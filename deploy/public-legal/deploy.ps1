#Requires -Version 5.1
<#
Default: read-only preflight. -Offline: local validation only.
-Apply requires -ExpectedAccountId and interactive confirmation.
Only privacy.html, privacy-ja.html and support.html are transferred.
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Offline,
    [string]$Profile,
    [ValidatePattern('^[0-9]{12}$')][string]$ExpectedAccountId,
    [string]$SourceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$region = 'ap-northeast-2'
$instance = 'i-0fa7bd5e4299994b3'
$bucket = 'popku-images'
$names = @('privacy.html', 'privacy-ja.html', 'support.html')
$routes = @('/privacy', '/ja/privacy', '/support')
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N')
$prefix = 'deploy-transfer/public-legal/' + $runId
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$tempDirectory = $null
$uploadedKeys = New-Object 'System.Collections.Generic.List[string]'
$commandId = $null
$submissionAttempted = $false
$remoteSettled = $false
$exitCode = 0

function Invoke-Aws {
    param([string[]]$Arguments)
    $common = @('--region', $region, '--output', 'json', '--no-cli-pager', '--cli-connect-timeout', '10', '--cli-read-timeout', '30')
    if ($Profile) { $common += @('--profile', $Profile) }
    # Windows PowerShell 5.1 turns native stderr into ErrorRecord objects.
    $ErrorActionPreference = 'Continue'
    $result = & aws @Arguments @common 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $output = ($result | ForEach-Object { $_.ToString() }) -join "`n"
    if ($code -ne 0) { throw "AWS CLI failed ($code): $($Arguments[0]) $($Arguments[1])`n$output" }
    if ($output.Trim()) { return ($output | ConvertFrom-Json) }
}

function Get-ByteHash {
    param([byte[]]$Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Test-PublicPages {
    $previousTls = [System.Net.ServicePointManager]::SecurityProtocol
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = $previousTls -bor [System.Net.SecurityProtocolType]::Tls12
        for ($i = 0; $i -lt $names.Count; $i++) {
            $url = 'https://popchive.com' + $routes[$i]
            $request = [System.Net.HttpWebRequest]::Create($url)
            $request.AllowAutoRedirect = $false
            $request.Timeout = 30000
            $request.ReadWriteTimeout = 30000
            $request.Headers['Accept-Encoding'] = 'identity'
            $request.Headers['Cache-Control'] = 'no-cache'
            $response = $request.GetResponse()
            try {
                if ([int]$response.StatusCode -ne 200) { throw "$url returned HTTP $([int]$response.StatusCode)" }
                if ($response.ContentType -notmatch '(?i)^text/html\s*;.*charset\s*=\s*utf-8') { throw "${url}: expected HTML UTF-8 Content-Type" }
                $memory = New-Object System.IO.MemoryStream
                try {
                    $response.GetResponseStream().CopyTo($memory)
                    if ((Get-ByteHash $memory.ToArray()) -ne $files[$i].Hash) { throw "HTTPS body SHA-256 mismatch: $url" }
                } finally { $memory.Dispose() }
                Write-Host "HTTPS verified: $url HTTP 200 / SHA-256 OK"
            } finally { $response.Dispose() }
        }
    } finally { [System.Net.ServicePointManager]::SecurityProtocol = $previousTls }
}

try {
    if ($Apply -and $Offline) { throw '-Apply and -Offline cannot be combined.' }
    if ($Apply -and -not $ExpectedAccountId) { throw '-Apply requires -ExpectedAccountId (confirmed POPCHIVE account).' }
    foreach ($selectedProfile in @($Profile, $env:AWS_PROFILE, $env:AWS_DEFAULT_PROFILE)) {
        if ($selectedProfile -match '(?i)oripa') { throw 'The oripa profile is prohibited. Select an existing POPCHIVE credential source.' }
    }
    if (-not $SourceDirectory) { $SourceDirectory = Join-Path $PSScriptRoot '../../public-legal' }
    $source = (Resolve-Path -LiteralPath $SourceDirectory).Path
    $files = @()
    foreach ($name in $names) {
        $path = Join-Path $source $name
        $item = Get-Item -LiteralPath $path
        if ($item.PSIsContainer -or $item.Length -eq 0 -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw "Invalid, empty or linked input file: $path" }
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $html = $utf8.GetString($bytes) # Throws on invalid UTF-8; never rewrites the source.
        if ($html -notmatch '(?i)<html\b' -or $html -notmatch '(?i)charset\s*=\s*["'']?utf-8') { throw "Missing HTML / UTF-8 declaration: $path" }
        $files += [pscustomobject]@{ Name = $name; Bytes = $bytes; Hash = (Get-ByteHash $bytes) }
        Write-Host "$name / $($bytes.Length) bytes / SHA-256 $($files[-1].Hash)"
    }
    Write-Host "Mode: $(if ($Apply) { 'APPLY' } else { 'DRY-RUN' }); Region: $region; Instance: $instance"
    Write-Host "Source: $source; Destination: /var/www/popchive-public/"
    Write-Host "Temporary S3 prefix: s3://$bucket/$prefix/"
    if ($Offline) {
        Write-Host 'Account: UNVERIFIED (offline). Local checks passed; AWS permissions and remote prerequisites are not verified.'
        exit 0
    }
    $null = Get-Command aws -ErrorAction Stop
    $identity = Invoke-Aws @('sts', 'get-caller-identity')
    Write-Host "AWS account: $($identity.Account); Principal: $($identity.Arn); Profile: $(if ($Profile) { $Profile } else { 'existing default credential chain' })"
    if ($ExpectedAccountId -and $identity.Account -ne $ExpectedAccountId) { throw 'AWS account does not match -ExpectedAccountId.' }
    $ec2 = Invoke-Aws @('ec2', 'describe-instances', '--instance-ids', $instance)
    $target = @($ec2.Reservations | ForEach-Object { $_.Instances })
    if ($target.Count -ne 1 -or $target[0].State.Name -ne 'running') { throw 'Target EC2 instance is not running.' }
    if (-not $target[0].PSObject.Properties['IamInstanceProfile']) { throw 'Target EC2 has no IAM instance profile.' }
    $profileName = ($target[0].IamInstanceProfile.Arn -split '/')[-1]
    $instanceProfile = Invoke-Aws @('iam', 'get-instance-profile', '--instance-profile-name', $profileName)
    if (@($instanceProfile.InstanceProfile.Roles | Where-Object RoleName -EQ 'popchive-ec2-ssm-role').Count -ne 1) { throw 'Target EC2 role is not popchive-ec2-ssm-role.' }
    $ssm = Invoke-Aws @('ssm', 'describe-instance-information', '--filters', "Key=InstanceIds,Values=$instance")
    $nodes = @($ssm.InstanceInformationList)
    if ($nodes.Count -ne 1 -or $nodes[0].PingStatus -ne 'Online' -or $nodes[0].PlatformType -ne 'Linux') { throw 'Target must be an Online Linux SSM managed node.' }
    Write-Host 'Read-only preflight passed. S3 write/delete, SendCommand and server tools require separate operational permission; dry-run cannot prove them.'
    if (-not $Apply) { Write-Host 'DRY-RUN complete. No uploads, Run Commands or operating file changes performed.'; exit 0 }

    $confirmation = "$($identity.Account) $instance"
    $answer = Read-Host "Type '$confirmation' to replace ONLY the three backed-up HTML files"
    if ($answer -cne $confirmation) { throw 'Confirmation did not match. Nothing uploaded or deployed.' }

    $tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('popchive-legal-' + $runId)
    $null = New-Item -ItemType Directory -Path $tempDirectory
    foreach ($file in $files) {
        $snapshot = Join-Path $tempDirectory $file.Name
        [System.IO.File]::WriteAllBytes($snapshot, $file.Bytes)
        $key = "$prefix/$($file.Name)"
        $uploadedKeys.Add($key) # Cleanup also covers ambiguous upload failures.
        $null = Invoke-Aws @('s3api', 'put-object', '--bucket', $bucket, '--key', $key, '--body', $snapshot, '--content-type', 'text/html; charset=utf-8', '--server-side-encryption', 'AES256')
    }
    $manifest = @{}
    foreach ($file in $files) { $manifest[$file.Name] = $file.Hash }
    $config = @{ account = $identity.Account; region = $region; bucket = $bucket; prefix = $prefix; run = $runId; hashes = $manifest } | ConvertTo-Json -Compress
    $config64 = [Convert]::ToBase64String($utf8.GetBytes($config))
    # A single root-owned transaction handles staging, backup, replacement and rollback.
    # No shell interpolation of source HTML or user-supplied paths.
    $python = @'
import base64, fcntl, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile
c = json.loads(base64.b64decode(sys.argv[1]))
names = ('privacy.html', 'privacy-ja.html', 'support.html')
routes = ('/privacy', '/ja/privacy', '/support')
root = pathlib.Path('/var/www/popchive-public')
backup = pathlib.Path('/var/backups/popchive-public') / c['run']
stage = None
changed = []
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=60, **kwargs)
def https_check(local):
    for name, route in zip(names, routes):
        body, headers = stage / ('body-' + name), stage / ('headers-' + name)
        args = ['curl', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '30',
                '-H', 'Accept-Encoding: identity', '-H', 'Cache-Control: no-cache',
                '-D', str(headers), '-o', str(body), '-w', '%{http_code}']
        if local:
            args += ['--resolve', 'popchive.com:443:127.0.0.1']
        args += ['https://popchive.com' + route]
        status = run(args, capture_output=True, text=True).stdout
        if status != '200' or not re.search(r'^content-type:\s*text/html\s*;.*charset\s*=\s*utf-8', headers.read_text(), re.I | re.M):
            raise RuntimeError('HTTPS status/content-type failed: ' + route + ' HTTP ' + status)
        if digest(body) != c['hashes'][name]:
            raise RuntimeError('HTTPS body mismatch: ' + route)
        print('HTTPS OK ' + ('loopback ' if local else 'DNS ') + route, flush=True)
if os.geteuid() != 0:
    raise SystemExit('SSM command must run as root')
os.umask(0o077)
lock = open('/var/lock/popchive-public-deploy.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
try:
    for tool in ('aws', 'curl'):
        if not shutil.which(tool):
            raise RuntimeError('Missing remote dependency: ' + tool)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError('Destination must be an existing real directory')
    for p in (pathlib.Path('/var/backups'), pathlib.Path('/var/backups/popchive-public')):
        if p.is_symlink():
            raise RuntimeError('Backup parent must not be a symlink')
    original = {}
    for name in names:
        p = root / name
        if p.is_symlink() or not p.is_file() or p.stat().st_size == 0:
            raise RuntimeError('Existing HTML missing, empty or symlink: ' + name)
        original[name] = digest(p)
    # Ignore remote static credentials/config; use the EC2 role through IMDS.
    env = {k: v for k, v in os.environ.items() if not k.startswith('AWS_')}
    env.update(AWS_CONFIG_FILE='/dev/null', AWS_SHARED_CREDENTIALS_FILE='/dev/null', AWS_DEFAULT_REGION=c['region'], AWS_PAGER='')
    aws = ['aws', '--region', c['region'], '--output', 'json', '--cli-connect-timeout', '10', '--cli-read-timeout', '30']
    who = json.loads(run(aws + ['sts', 'get-caller-identity'], env=env, capture_output=True, text=True).stdout)
    if who['Account'] != c['account'] or ':assumed-role/popchive-ec2-ssm-role/' not in who['Arn']:
        raise RuntimeError('Remote AWS identity is not the expected EC2 role/account')
    stage = pathlib.Path(tempfile.mkdtemp(prefix='.popchive-legal-', dir=str(root.parent)))
    for name in names:
        p = stage / name
        run(aws + ['s3api', 'get-object', '--bucket', c['bucket'], '--key', c['prefix'] + '/' + name, str(p)], env=env, stdout=subprocess.DEVNULL)
        if not p.stat().st_size or digest(p) != c['hashes'][name]:
            raise RuntimeError('Staging SHA-256/size failed: ' + name)
        p.read_bytes().decode('utf-8-sig', errors='strict')
    backup.mkdir(parents=True, exist_ok=False)
    for name in names:
        old = root / name
        shutil.copy2(old, backup / name)
        st = old.stat()
        os.chown(backup / name, st.st_uid, st.st_gid)
        if digest(backup / name) != original[name]:
            raise RuntimeError('Backup verification failed: ' + name)
    (backup / 'SHA256SUMS').write_text(''.join(original[n] + '  ' + n + '\n' for n in names), encoding='ascii')
    print('Verified backup: ' + str(backup), flush=True)
    for name in names:
        if digest(root / name) != original[name]:
            raise RuntimeError('Operating file changed during staging: ' + name)
    for name in names:
        st = (backup / name).stat()
        os.chown(stage / name, st.st_uid, st.st_gid)
        os.chmod(stage / name, st.st_mode & 0o777)
        changed.append(name) # Includes an ambiguous replace failure.
        os.replace(stage / name, root / name)
    for name in names:
        if digest(root / name) != c['hashes'][name]:
            raise RuntimeError('Installed SHA-256 failed: ' + name)
    https_check(True)
    https_check(False)
    print('DEPLOY_SUCCESS ' + c['run'], flush=True)
except BaseException as error:
    print('DEPLOY_FAILED: ' + str(error), file=sys.stderr, flush=True)
    failed = []
    for name in changed:
        try:
            restore = stage / ('restore-' + name)
            shutil.copy2(backup / name, restore)
            st = (backup / name).stat()
            os.chown(restore, st.st_uid, st.st_gid)
            os.replace(restore, root / name)
            if digest(root / name) != original[name]:
                raise RuntimeError('Restored hash mismatch')
        except BaseException as restore_error:
            failed.append(name)
            print('ROLLBACK_FAILED ' + name + ': ' + str(restore_error), file=sys.stderr, flush=True)
    if changed:
        print('ROLLBACK ' + ('FAILED' if failed else 'VERIFIED') + ' backup=' + str(backup), file=sys.stderr, flush=True)
    sys.exit(1)
finally:
    if stage is not None:
        try:
            shutil.rmtree(stage)
        except Exception as error:
            print('STAGING_CLEANUP_FAILED: ' + str(error), file=sys.stderr, flush=True)
            sys.exit(1)
'@
    $python64 = [Convert]::ToBase64String($utf8.GetBytes($python.Replace("`r`n", "`n")))
    $remote = "set -eu`ncommand -v python3 >/dev/null || { echo 'Missing python3' >&2; exit 1; }`nprintf '%s' '$python64' | base64 -d | python3 - '$config64'"
    $payload = @{ DocumentName = 'AWS-RunShellScript'; InstanceIds = @($instance); TimeoutSeconds = 120; Comment = "POPCHIVE legal $runId"; Parameters = @{ commands = @($remote); executionTimeout = @('600') } }
    $jsonPath = Join-Path $tempDirectory 'command.json'
    [System.IO.File]::WriteAllText($jsonPath, ($payload | ConvertTo-Json -Depth 6 -Compress), $utf8)
    $submissionAttempted = $true
    $sent = Invoke-Aws @('ssm', 'send-command', '--cli-input-json', ('file://' + $jsonPath.Replace('\', '/')))
    $commandId = $sent.Command.CommandId
    Write-Host "SSM Command ID: $commandId; backup: /var/backups/popchive-public/$runId"
    $deadline = (Get-Date).AddSeconds(840)
    do {
        Start-Sleep -Seconds 5
        try { $invocation = Invoke-Aws @('ssm', 'get-command-invocation', '--command-id', $commandId, '--instance-id', $instance) }
        catch { if ($_.Exception.Message -match 'InvocationDoesNotExist') { continue }; throw }
        if ($invocation.Status -in @('Pending', 'InProgress', 'Delayed', 'Cancelling')) { continue }
        # Timeouts/cancellation can interrupt a transaction without running rollback.
        $remoteSettled = $invocation.Status -in @('Success', 'Failed')
        Write-Host $invocation.StandardOutputContent
        if ($invocation.StandardErrorContent) { Write-Warning $invocation.StandardErrorContent }
        if ($invocation.Status -ne 'Success' -or $invocation.ResponseCode -ne 0 -or $invocation.StandardOutputContent -notmatch "DEPLOY_SUCCESS $runId") { throw "SSM failed: $($invocation.Status), code $($invocation.ResponseCode). Check the reported backup/rollback status." }
        Test-PublicPages
        Write-Host "Deployment verified. Backup retained: /var/backups/popchive-public/$runId"
        break
    } while ((Get-Date) -lt $deadline)
    if (-not $remoteSettled) { throw 'SSM polling deadline exceeded; remote outcome UNKNOWN. Do not rerun until this command is inspected.' }
} catch {
    $exitCode = 1
    Write-Error -ErrorAction Continue $_.Exception.Message
    if ($commandId) { Write-Warning "Inspect SSM command $commandId and backup /var/backups/popchive-public/$runId before retrying. External HTTPS failure after remote success requires operator review; it does not trigger another remote write." }
} finally {
    # Never remove transfer objects while an accepted command may still need them.
    if ($uploadedKeys.Count -gt 0) {
        if ($submissionAttempted -and -not $remoteSettled) {
            Write-Warning "Remote outcome unknown. Transfer objects retained at s3://$bucket/$prefix/; inspect SSM then delete these exact three keys."
        } else {
            foreach ($key in $uploadedKeys) {
                try { $null = Invoke-Aws @('s3api', 'delete-object', '--bucket', $bucket, '--key', $key) }
                catch { $exitCode = 1; Write-Warning "S3 cleanup failed: s3://$bucket/$key : $($_.Exception.Message)" }
            }
        }
    }
    if ($tempDirectory) {
        try {
            $resolvedTemp = [System.IO.Path]::GetFullPath($tempDirectory)
            $expectedTemp = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ('popchive-legal-' + $runId)))
            if ($resolvedTemp -cne $expectedTemp) { throw 'Refusing cleanup outside the exact deployment temporary directory.' }
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
        catch { $exitCode = 1; Write-Warning "Local cleanup failed: $tempDirectory : $($_.Exception.Message)" }
    }
}
exit $exitCode
