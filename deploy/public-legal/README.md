# 공개 정책 페이지 배포 준비

## 기존 운영 HTML 업데이트 자동화 (deploy.ps1)

현재 운영 Nginx·HTTPS가 이미 준비됐다는 사용자 확인을 전제로 하는 **HTML 업데이트 전용** 스크립트다. 아래의 초기 설치·인증서·DNS 절차는 이 스크립트와 별개이며 다시 실행할 필요가 없다. 이번 자동화 작업에서는 실제 배포나 AWS 정책 변경을 하지 않았다.

원본은 저장소 루트의 `public-legal/privacy.html`, `privacy-ja.html`, `support.html`이다. `deploy/public-legal/`의 기존 tar.gz 및 SHA256SUMS는 초기 수동 배포 자료이며 업데이트 스크립트는 사용하거나 갱신하지 않는다. 원본 HTML도 수정하지 않는다.

### 실행

프로젝트 루트에서 Windows PowerShell 5.1 또는 PowerShell 7로 실행한다. 기본은 dry-run이며 S3 업로드와 SSM Run Command를 보내지 않는다.

```powershell
# AWS 접근 없이 로컬 3개 파일만 검증
powershell.exe -NoProfile -File .\deploy\public-legal\deploy.ps1 -Offline

# 기존 기본 자격 증명으로 읽기 전용 계정/EC2/Role/SSM 사전 검사
powershell.exe -NoProfile -File .\deploy\public-legal\deploy.ps1

# 필요하면 이미 존재하는, 확인된 POPCHIVE 프로필을 명시한다.
# -Profile 'CONFIRMED_POPCHIVE_PROFILE' (새 프로필 생성이나 oripa 사용 금지)

# 실제 변경 명령 예시: 이번 작업에서 실행하지 않았다.
# 계정 485378272197이 운영 POPCHIVE 계정인지 사용자가 먼저 확인해야 한다.
powershell.exe -NoProfile -File .\deploy\public-legal\deploy.ps1 -Apply -ExpectedAccountId 485378272197
```

PowerShell 7은 위 명령의 `powershell.exe`를 `pwsh`로 바꾸면 된다. 실행 정책 우회, 관리자 권한 실행, 자격 증명 추가는 스크립트가 수행하지 않는다. 다른 원본 디렉터리를 지정하려면 `-SourceDirectory`를 사용한다. 어떤 디렉터리를 선택해도 허용한 파일명 3개만 처리한다.

`-Apply`는 계정 ID, 리전, 대상 인스턴스, 경로를 표시하고 `485378272197 i-0fa7bd5e4299994b3`처럼 실제 조회한 계정과 고정 대상 인스턴스의 문자열을 직접 입력해야 진행한다. `-Apply -Offline`, 계정 불일치, oripa 프로필, 입력 불일치는 실패 종료한다. 성공은 종료 코드 0, 모든 검증·배포·정리 실패는 1이다.

### 동작 순서

1. 로컬 파일 존재·크기·symlink 여부, 엄격한 UTF-8 디코딩, HTML/charset 선언을 검사하고 SHA-256을 표시한다. 읽은 바이트를 스냅샷으로 보관하여 전송 중 편집의 영향을 피한다.
2. STS로 현재 계정과 주체를 확인한다. EC2 running 상태, 연결된 instance profile의 `popchive-ec2-ssm-role`, Online Linux SSM 노드를 검사한다. 권한 부족은 중단하며 다른 계정/프로필로 자동 전환하지 않는다.
3. `-Apply`와 입력 확인을 통과하면 3개 스냅샷만 `s3://popku-images/deploy-transfer/public-legal/<UTC시간-GUID>/<파일명>`에 SSE-S3(AES256)로 업로드한다. 공개 ACL은 설정하지 않는다.
4. 단일 `AWS-RunShellScript` 명령을 고정 EC2에 전달한다. 원격 Python 3 트랜잭션은 배포 lock을 잡고, 도구·운영 파일·EC2 Role 계정을 확인한다. 원격 AWS CLI는 정적 자격 증명/config를 무시하고 IMDS의 EC2 Role을 사용한다.
5. `/var/www/.popchive-legal-*` 임시 디렉터리에 다운로드한다. 크기·UTF-8·SHA-256 검증 후 기존 3개를 `/var/backups/popchive-public/<UTC시간-GUID>/`에 복사하고 백업 hash를 검증한다. 백업은 공개 root 밖에 보존하며 자동 삭제하지 않는다.
6. 기존 파일의 소유자·그룹·권한을 보존하고 같은 파일시스템 내 `os.replace`로 파일별 교체한다. 설치 hash와 HTTPS `/privacy`, `/ja/privacy`, `/support`의 200·UTF-8 Content-Type·응답 바이트 hash를 loopback(Host/SNI 유지) 및 공용 DNS 경로에서 검사한다. TLS 인증과 호스트 검증을 끄거나 redirect를 따라가지 않는다.
7. 원격 예외 발생 시 교체를 시도한 파일을 백업에서 복구하고 hash를 확인한다. SSM 완료 후 Windows에서도 동일 HTTPS 3개를 검사한다. Nginx reload는 필요 없으며 API·SSL·DNS·Docker·DB를 다루지 않는다.
8. 종료된 명령의 전송 객체 3개와 로컬 임시 파일을 정리한다. 정리 실패는 경로와 오류를 보고하고 실패 종료한다. SSM 요청/조회 결과가 불명확하거나 timeout/cancellation이면 객체를 보존하여 진행 중인 다운로드를 방해하지 않는다.

SSM은 [eventual consistency](https://docs.aws.amazon.com/cli/latest/reference/ssm/get-command-invocation.html)가 있으므로 `InvocationDoesNotExist`는 잠시 재조회한다. [Run Command](https://docs.aws.amazon.com/cli/latest/reference/ssm/send-command.html)의 수신 대기 timeout은 120초, 실행 timeout은 600초, 로컬 조회 기한은 840초이며 개별 AWS/HTTPS 요청에도 timeout을 둔다.

### 필요한 최소 IAM 범위 (정책을 적용하지 않음)

| 주체 | 작업 | 제한할 리소스/조건 |
| --- | --- | --- |
| Windows 실행 주체 | `sts:GetCallerIdentity` | 계정 확인(STS identity 조회 자체는 별도 Allow 없이 가능) |
| Windows 실행 주체 | `ec2:DescribeInstances`, `ssm:DescribeInstanceInformation` | 조회 API는 `Resource: *`; 지원하는 리전 조건을 `ap-northeast-2`로 제한 |
| Windows 실행 주체 | `iam:GetInstanceProfile` | 실제 EC2에 연결된 instance profile ARN만 허용(현재 이름/ARN 미확인) |
| Windows 실행 주체 | `ssm:SendCommand` | `arn:aws:ec2:ap-northeast-2:485378272197:instance/i-0fa7bd5e4299994b3` 및 `arn:aws:ssm:ap-northeast-2::document/AWS-RunShellScript`만 허용 |
| Windows 실행 주체 | `ssm:GetCommandInvocation` | 이 API가 지원하는 범위 `Resource: *`; 리전 조건 제한 |
| Windows 실행 주체 | `s3:PutObject`, `s3:DeleteObject` | `arn:aws:s3:::popku-images/deploy-transfer/public-legal/*`만 허용 |
| EC2 `popchive-ec2-ssm-role` | `s3:GetObject` | 위 전송 object prefix만 허용. EC2는 업로드·삭제·버킷 전체 조회 불필요 |
| EC2 Role | 기존 SSM Agent 통신 권한 | 기존 SSM core 권한 및 Agent 버전별 `ssmmessages`/`ec2messages` 통신을 유지. 이 작업에서 부여/변경하지 않음 |

실제 계정이 다르면 운영 확인부터 다시 해야 하며 위 ARN을 무작정 적용하면 안 된다. `iam:PassRole`, 관리자 권한, Nginx/Route 53/EC2 변경 권한은 필요 없다. IAM 권한만으로 버킷 정책·SCP·permissions boundary·VPC endpoint 정책의 거부를 해소할 수 없다. SSE-KMS 강제 버킷이면 현재 AES256 전송은 거부될 수 있으므로 기존 정책과 암호화 방식을 먼저 확인한다. 최소 IAM API별 리소스 지원은 [SSM 권한 표](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html)와 [EC2 권한 표](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonec2.html)를 기준으로 검토한다.

`AWS-RunShellScript`는 대상 EC2에서 root 셸을 실행할 수 있는 권한이다. 인스턴스/document 제한만으로 명령 내용을 HTML 업데이트로 강제할 수는 없다. 더 엄격한 권한 분리가 필요하면 별도 제한된 SSM document가 필요하지만 이번 작업에서는 만들지 않았다.

### 조사 결과와 적용 전 확인

- AWS CLI 2.36.40과 Windows PowerShell 5.1 사용 가능. 현재 조회한 기본 주체는 계정 `485378272197`의 `arn:aws:iam::485378272197:user/popku-s3`. 프로필 목록은 비어 있었고 oripa 프로필을 사용하지 않았다.
- `ssm:DescribeInstanceInformation`은 AccessDeniedException, `ec2:DescribeInstances`는 UnauthorizedOperation으로 거부됐다. 현재 자격 증명으로 온라인 dry-run도 완료할 수 없다. Role 연결, SSM 상태, IAM instance profile ARN, S3 쓰기·읽기·삭제, bucket 정책/버전 관리는 확인되지 않았다.
- 실제 적용 전: 운영 계정과 사용할 기존 자격 증명, 위 최소 권한, EC2 Role/SSM Online, 원격 root 실행 및 `python3`·AWS CLI·`curl`·IMDS·S3/STS 통신, 기존 운영 HTML 3개와 root 경로, 백업 저장 공간, HTTPS 경로/UTF-8 header/DNS를 확인한다. 로컬 문서 공개 승인 상태는 `public-legal/REVIEW.md`를 기준으로 담당자가 확인한다.
- 로컬 PowerShell 5.1 구문 검사, offline dry-run, 누락·빈 파일·잘못된 UTF-8 및 옵션 guard를 검증했다. 모의 AWS 응답으로 온라인 dry-run의 조회 전용 호출, 계정 불일치·CLI 오류·확인 거부의 변경 차단, SSM 실패 후 객체 정리와 SendCommand 결과 불명 시 객체 보존도 검증했다. 모의 테스트는 실제 AWS 명령을 호출하지 않았다. PowerShell 7 실행 환경과 로컬 Python 실행 환경이 없어 실제 실행/원격 Python 구문 검사는 미검증이다. 운영 Python/SSM 트랜잭션·백업/복구·HTTPS 본문 검증은 AWS 변경 금지에 따라 운영에서 실행하지 않았다.

### 실패 복구와 운영상 한계

- Python이 처리할 수 있는 예외는 자동 복구한다. EC2 중단, SIGKILL, SSM 실행 timeout 등은 복구 코드를 실행하지 못할 수 있다. 전체 3개 묶음의 원자적 교체는 아니므로 매우 짧게 신/구 문서가 섞여 보일 수 있다. 파일별 교체는 원자적이다. 동일 스크립트의 동시 배포는 lock으로 차단하지만 다른 도구의 직접 편집은 통제하지 않는다.
- 결과 불명확 시 출력된 command ID를 `aws ssm get-command-invocation --region ap-northeast-2 --command-id <ID> --instance-id i-0fa7bd5e4299994b3`로 조회한다. SendCommand 응답 자체를 못 받았다면 SSM 콘솔에서 `POPCHIVE legal <run ID>` comment로 확인한다. 실행 종료와 운영 파일 상태를 확인하기 전 재실행/객체 삭제를 하지 않는다.
- 백업 경로를 확인한 운영 담당자는 실행 중인 배포가 없을 때 서버에서 `(cd /var/backups/popchive-public/<run ID> && sha256sum -c SHA256SUMS)`로 검증한다. 검증된 3개만 root 밖의 같은 파일시스템 임시 경로에 `cp -p`로 복사한 뒤 각 파일을 `mv -f`로 `/var/www/popchive-public/`에 복구하고 hash와 HTTPS를 재검사한다. 스크립트는 별도 원격 복구 명령을 자동 재전송하지 않는다.
- 원격 성공 후 Windows HTTPS 검사만 실패하면 연결/캐시/공용 라우팅 문제일 수도 있어 추가 원격 변경을 하지 않는다. 백업을 보존하고 담당자가 복구 여부를 결정한다.
- S3 versioning 활성 버킷에서는 DeleteObject가 delete marker를 만들고 이전 버전을 남길 수 있다. 전송 prefix의 버전 보존/정리 정책을 담당자가 확인해야 한다. 스크립트는 버전 삭제 권한을 요구하거나 lifecycle/IAM을 변경하지 않는다. 보존 백업과 남은 전송 객체의 정리 주기는 운영 담당자가 정한다.

---

**로컬 파일 준비만 완료. 아래 서버·전송·인증서 명령은 실제 적용 단계용이며 이번 작업에서는 실행하지 않았다.** DNS 변경, 운영 배포, 관리자 웹 접근, Docker 변경도 하지 않았다.

## 1. 구성과 준비 파일

사용자가 확인한 운영 구성: Ubuntu 호스트 Nginx 1.24.0, 활성 사이트 /etc/nginx/sites-enabled/default, 원본 /etc/nginx/sites-available/default, Certbot 및 certbot.timer 활성, api.popchive.com 전용 인증서, API 127.0.0.1:8080, 컨테이너 popchive-backend-1 / popchive-mysql-1, 배포 경로 /opt/popchive.

| 준비 파일 | 용도 |
| --- | --- |
| popchive-public.nginx.conf.example | 별도 사이트 /etc/nginx/sites-available/zz-popchive-public에 설치할 설정 |
| verify-public-legal.sh | api / before / after 모드의 TLS·HTTP·HTML·API 검증 |
| SHA256SUMS | HTML 3개와 설정·검증 스크립트의 무결성 확인 |
| popchive-public.tar.gz | 위 5개 파일 + SHA256SUMS만 담은 전송 파일 |

HTML은 public-legal/privacy.html, privacy-ja.html, support.html을 변경 없이 사용한다. 정적 root는 /var/www/popchive-public이다. HTTPS에서 /privacy, /ja/privacy, /support만 GET/HEAD로 제공하고 그 외 경로와 HTTP는 404다. 리다이렉트·API proxy·관리자 웹·SPA fallback은 추가하지 않는다.

실제 공개 승인 전에는 기존 public-legal/REVIEW.md에 남아 있는 확인 사항도 완료해야 한다. 이번 작업에서 정책 문구를 수정하거나 공개 승인을 확정하지 않았다.

새 사이트 이름 zz-popchive-public은 기존 default보다 뒤에 로드되도록 정했다. 기존 default 파일·symlink·API 인증서·Docker·/opt/popchive는 변경하지 않는다. 기존 popchive.com 블록이나 같은 배포 경로가 있으면 아래 절차를 중단하고 별도로 확인한다. 기본 설정의 상속이나 listen 옵션 충돌은 nginx -t와 실제 HTTP 검증으로 확인한다.

## 2. 사용자가 콘솔에서 준비할 사항

**현재는 확인만 한다. 실제 생성·변경은 다음 적용 단계에서 승인 후 수행한다.**

1. EC2 콘솔에서 대상 인스턴스와 공인 IP를 확인한다. DNS 전환 시 사용할 고정 IP가 없다면 Elastic IP 할당·연결을 별도로 계획한다. 연결 변경은 운영 API에도 영향을 줄 수 있으므로 이번 단계에서는 하지 않는다.
2. 기존 보안 그룹의 TCP 443 접근을 확인한다. API가 사용하는 규칙을 변경하지 않는다. DNS-01 발급에는 새 인바운드 80 규칙이 필요 없다.
3. 기존 SSH 또는 EC2 연결 → Session Manager로 Ubuntu 셸에 접속한다. 현재 로컬 S3 IAM 자격증명으로는 EC2/SSM 조회가 거부됐으므로 기존 운영 권한을 사용한다. 아래 scp는 기존 SSH 접속 수단이 있을 때만 사용한다. SSM만 가능하면 기존에 승인된 파일 전송 수단이 필요하며, 전송을 위해 22번 포트를 임의로 개방하지 않는다.
4. DNS의 실제 NS를 확인한다. Route 53이 권한 DNS라면 해당 Hosted zone, 아니라면 실제 DNS 사업자의 콘솔을 사용한다. 다음 인증서 발급 단계에서 TXT만 추가·삭제한다. 서비스 A/AAAA/ALIAS/CNAME과 api.popchive.com 레코드는 그대로 둔다.

루트 도메인은 계속 Vercel을 유지한다. 기존 루트 DNS 값·TTL·AAAA와 루트 페이지 처리 방침은 향후 전환 전에 기록한다. 이 파일 준비 작업은 서비스 DNS 전환을 포함하지 않는다.

## 3. 전송 (향후 실행, Windows PowerShell)

압축 파일을 먼저 로컬에서 확인한다. 목록은 HTML 3개, 설정, 검증 스크립트, SHA256SUMS 총 6개여야 한다. 개인키·환경 파일·관리자 웹·REVIEW.md는 포함하지 않는다.

```powershell
Set-Location C:/dev/popku-rn
tar -tzf deploy/public-legal/popchive-public.tar.gz

$Ec2Ip = 'REPLACE_WITH_CONFIRMED_PUBLIC_IP'
$SshKey = 'C:/REPLACE_WITH_EXISTING_SSH_KEY.pem'
$RemoteStage = '/home/ubuntu/popchive-public-staging-' + (Get-Date -Format yyyyMMdd-HHmmss)
ssh -i $SshKey "ubuntu@$Ec2Ip" "umask 077; mkdir -- '$RemoteStage'"
if ($LASTEXITCODE -ne 0) { throw 'Staging directory creation failed' }
scp -i $SshKey deploy/public-legal/popchive-public.tar.gz "ubuntu@${Ec2Ip}:$RemoteStage/"
if ($LASTEXITCODE -ne 0) { throw 'Archive transfer failed' }
Write-Output $RemoteStage
```

## 4. staging 검증과 기존 상태 기록 (Ubuntu Bash)

이하 단계는 같은 Ubuntu Bash 세션에서 진행한다. STAGE에는 위에서 출력된 실제 경로, EC2_IP에는 확인된 공인 IPv4를 넣는다. 명령 실패 시 다음 단계로 진행하지 않는다.

```bash
set -euo pipefail
umask 077
STAGE='/home/ubuntu/popchive-public-staging-REPLACE_WITH_TIMESTAMP'
EC2_IP='REPLACE_WITH_CONFIRMED_PUBLIC_IP'
test -d "$STAGE"
tar -tzf "$STAGE/popchive-public.tar.gz"
tar -xzf "$STAGE/popchive-public.tar.gz" -C "$STAGE" --no-same-owner --no-same-permissions
(cd "$STAGE" && sha256sum --check SHA256SUMS)

sudo nginx -t
# 인증서 이름·경로·도메인만 확인하며 개인키를 출력하지 않는다.
sudo certbot certificates
# 전체 Nginx 설정 대신 server_name 선언만 출력한다.
sudo nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name[[:space:]]'
```

popchive.com이 이미 선언돼 있거나 popchive-public 인증서가 존재하면 신규 설치·발급을 중단한다. API 인증서는 Certbot 출력의 실제 fullchain 경로를 기록한다. 아래 API_CERT를 그 경로로 바꾼다.

```bash
API_CERT='/REPLACE_WITH_EXISTING_API_FULLCHAIN_PATH'
sudo test -f "$API_CERT"
sudo sha256sum /etc/nginx/sites-available/default "$API_CERT" > "$STAGE/existing-files.sha256"
readlink /etc/nginx/sites-enabled/default > "$STAGE/default-link.before"
docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.RestartCount}}' \
  popchive-backend-1 popchive-mysql-1 > "$STAGE/containers.before"

bash "$STAGE/verify-public-legal.sh" api "$EC2_IP"
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  'http://127.0.0.1:8080/api/regions?countryCode=KR' -o "$STAGE/api-loopback.json"
python3 - "$STAGE/api-loopback.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as response:
    data = json.load(response)
if not isinstance(data, list):
    raise SystemExit('Loopback API did not return a JSON array')
print('Loopback API OK')
PY
```

## 5. 루트 도메인 인증서 발급 (서비스 DNS 전환 전)

기존 인증서는 API 전용이므로 popchive.com에는 **새 인증서가 필요하다.** 별도 cert-name popchive-public과 도메인 popchive.com만 지정한다. API 인증서의 확장·재발급·갱신, certbot --nginx, 서비스 중단이 필요한 --standalone은 사용하지 않는다.

DNS-01은 Vercel을 향하는 서비스 레코드를 유지한 채 TXT로 검증할 수 있다. TXT 추가도 DNS 변경이므로 **아래 발급은 다음 단계에서만 수행한다.** [Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge)

```bash
dig +short NS popchive.com
dig +short CAA popchive.com
sudo certbot plugins
sudo certbot --help all | grep -- --no-directory-hooks
```

권한 DNS와 CAA를 확인한다. 기존 전역 Certbot 옵션·디렉터리 hook의 실행을 방지하기 위해 초기 발급에는 --config /dev/null과 --no-directory-hooks를 지정한다. 설치 버전이 옵션을 지원하지 않으면 생략해서 실행하지 말고 중단한다. Route 53을 실제로 사용하고 dns-route53 플러그인·필요한 DNS 권한이 이미 준비돼 있다면 자동 갱신 가능한 방식으로 발급한다. 자격증명 값을 출력하지 않는다. [Certbot hook 제어](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

```bash
# 조건을 충족한 경우에만 선택한다. 수동 방식과 둘 다 실행하지 않는다.
sudo certbot certonly --config /dev/null --no-directory-hooks \
  --dns-route53 --cert-name popchive-public -d popchive.com
```

DNS API 구성이 없으면 아래 수동 방식으로 발급한다. Certbot이 제시한 값을 실제 DNS 콘솔의 _acme-challenge.popchive.com TXT에 추가하고, 권한 NS 조회에 정확히 나타난 뒤 Certbot에서 계속 진행한다. 기존 challenge TXT는 덮어쓰거나 지우지 않는다.

```bash
sudo certbot certonly --config /dev/null --no-directory-hooks \
  --manual --preferred-challenges dns \
  --cert-name popchive-public -d popchive.com
# Certbot이 TXT 등록을 기다리는 동안 별도 셸에서 실행한다.
dig @REPLACE_WITH_AUTHORITATIVE_NS TXT _acme-challenge.popchive.com
```

발급 성공 후 자신이 추가한 TXT 값만 제거한다. DNS가 Route 53이 아니면 실제 권한 DNS 콘솔에서 수행한다. AWS 콘솔에 TXT를 추가해도 해당 zone이 권한 DNS가 아니면 인증은 되지 않는다.

```bash
sudo test -f /etc/letsencrypt/live/popchive-public/fullchain.pem
sudo test -f /etc/letsencrypt/live/popchive-public/privkey.pem
sudo openssl x509 -in /etc/letsencrypt/live/popchive-public/fullchain.pem \
  -noout -dates -ext subjectAltName
sudo openssl x509 -in /etc/letsencrypt/live/popchive-public/fullchain.pem \
  -noout -checkhost popchive.com -checkend 2592000
sudo sha256sum --check --status "$STAGE/existing-files.sha256"
```

**certbot.timer 활성만으로 수동 DNS 인증서는 자동 갱신되지 않는다.** 자동 DNS 플러그인/hook을 준비하거나 수동 갱신 담당자와 만료 30일 전 알림을 확정해야 한다. 수동 갱신도 위 certonly 명령에서 동일 cert-name을 지정해 TXT 절차를 다시 수행한다. [Certbot 수동 갱신 제약](https://eff-certbot.readthedocs.io/en/stable/using.html#manual)

발급·갱신 시 기존 API lineage는 대상에 넣지 않는다. 전체 certbot renew나 전체 --dry-run을 이 절차에서 실행하지 않는다. 향후 자동 갱신 시험도 새 인증서만 --cert-name popchive-public으로 제한한다.

## 6. HTML과 별도 사이트 적용

이 단계부터 실제 파일 배치와 Nginx reload가 발생한다. 다음 운영 적용 승인 전에는 실행하지 않는다. 이미 대상 경로가 있으면 자동 덮어쓰지 않고 중단한다.

```bash
sudo test ! -e /var/www/popchive-public
sudo test ! -L /var/www/popchive-public
sudo test ! -e /etc/nginx/sites-available/zz-popchive-public
sudo test ! -L /etc/nginx/sites-available/zz-popchive-public
sudo test ! -e /etc/nginx/sites-enabled/zz-popchive-public
sudo test ! -L /etc/nginx/sites-enabled/zz-popchive-public

sudo install -d -o root -g root -m 0755 /var/www/popchive-public
sudo install -o root -g root -m 0644 \
  "$STAGE/privacy.html" "$STAGE/privacy-ja.html" "$STAGE/support.html" \
  /var/www/popchive-public/

# 실행 중 worker의 실제 계정으로 파일 읽기 권한을 확인한다.
NGINX_WORKER="$(ps -C nginx -o user=,args= | awk '/nginx: worker process/ {print $1; exit}')"
test -n "$NGINX_WORKER"
for page in privacy.html privacy-ja.html support.html; do
  sudo -u "$NGINX_WORKER" test -r "/var/www/popchive-public/$page"
  cmp "$STAGE/$page" "/var/www/popchive-public/$page"
done

sudo install -o root -g root -m 0644 "$STAGE/popchive-public.nginx.conf.example" \
  /etc/nginx/sites-available/zz-popchive-public
sudo ln -s /etc/nginx/sites-available/zz-popchive-public \
  /etc/nginx/sites-enabled/zz-popchive-public

sudo nginx -t
sudo sha256sum --check --status "$STAGE/existing-files.sha256"
readlink /etc/nginx/sites-enabled/default > "$STAGE/default-link.after"
cmp "$STAGE/default-link.before" "$STAGE/default-link.after"
sudo systemctl reload nginx
```

nginx -t 실패나 새로운 충돌 경고가 있으면 reload하지 않고 8절의 새 사이트 비활성화 절차를 수행한다. certificate/key 파일 일치 여부도 nginx -t에서 검사된다. restart, Docker/Compose 명령, 기존 default 수정은 필요 없다.

## 7. DNS 전환 전 HTTPS 검증

```bash
bash "$STAGE/verify-public-legal.sh" before "$EC2_IP"
docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.RestartCount}}' \
  popchive-backend-1 popchive-mysql-1 > "$STAGE/containers.after"
cmp "$STAGE/containers.before" "$STAGE/containers.after"
sudo sha256sum --check --status "$STAGE/existing-files.sha256"
```

before 모드는 curl --resolve로 Host·SNI를 유지하면서 EC2에 직접 연결한다. 새 인증서의 신뢰·호스트명·유효기간, 각 페이지 200·UTF-8·원본 바이트 일치, 다른 경로 404, 기존 API의 일반 DNS/EC2 직접 연결 200·JSON 스키마를 검사한다. -k와 -L을 사용하지 않는다. [curl --resolve](https://curl.se/docs/manpage.html#--resolve)

외부 클라이언트에서도 확인한다. Windows PowerShell 예시이며 상태 코드가 200이고 인증서 오류가 없어야 한다.

```powershell
curl.exe --silent --show-error --connect-timeout 10 --max-time 30 `
  --resolve "popchive.com:443:$Ec2Ip" --output NUL `
  --write-out 'HTTP %{http_code}\n' https://popchive.com/privacy
```

브라우저의 언어·지원 링크는 DNS 전환 전에는 기존 Vercel 주소로 연결된다. 링크 목적지는 로컬 HTML 검사로 확인했고, EC2 콘텐츠로의 탐색은 위 강제 연결 검증을 사용한다.

**여기서 작업을 멈춘다.** 이 준비 범위에서는 서비스 DNS를 변경하지 않는다. 향후 전환이 별도로 승인되면 루트 도메인만 고정 IP로 전환하고 AAAA가 이전 Vercel을 향하지 않도록 검토한다. api.popchive.com·MX·기타 TXT는 유지한다. 전환 후에는 같은 스크립트의 after 모드로 검증한다.

```bash
# 향후 서비스 DNS 전환 승인 및 전파 확인 후에만 실행한다.
bash "$STAGE/verify-public-legal.sh" after "$EC2_IP"
```

### 새 인증서 갱신 후 반영

수동 갱신이면 사이트 적용 후와 동일하게 nginx -t 통과 → systemctl reload nginx → before 검증을 수행한다. 자동 DNS 방식이면 기존 API용 hook을 수정하지 않고 새 lineage만 처리하는 deploy hook을 별도로 추가한다. 이미 같은 역할의 hook이 있으면 중복 추가하지 않는다. 기존 timer가 실행하는 전역 hook도 새 lineage에 대해 서비스 중단 등의 동작을 하지 않는지 운영자가 확인해야 한다. 다음은 향후 hook 설치 명령이다.

```bash
sudo test ! -e /etc/letsencrypt/renewal-hooks/deploy/zz-popchive-public
sudo test ! -L /etc/letsencrypt/renewal-hooks/deploy/zz-popchive-public
sudo test -d /etc/letsencrypt/renewal-hooks/deploy
test -x /usr/sbin/nginx
test -x /usr/bin/systemctl
sudo tee /etc/letsencrypt/renewal-hooks/deploy/zz-popchive-public >/dev/null <<'HOOK'
#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/popchive-public ] || exit 0
[ -L /etc/nginx/sites-enabled/zz-popchive-public ] || exit 0
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
HOOK
sudo chown root:root /etc/letsencrypt/renewal-hooks/deploy/zz-popchive-public
sudo chmod 0750 /etc/letsencrypt/renewal-hooks/deploy/zz-popchive-public
```

hook은 root 소유·0750으로 설치하며 성공한 새 인증서 발급·갱신 뒤에만 실행한다. 기존 API lineage에 대해서는 바로 종료한다. 초기 발급 및 수동 갱신에서 --no-directory-hooks를 사용한 실행은 이 hook도 생략하므로 직접 검증 후 reload한다.

## 8. 문제 발생 시 롤백

DNS 전환 전이므로 Vercel 서비스 DNS는 그대로 유지된다. 이번에 만든 별도 사이트 symlink만 비활성화한다. 실제 대상 경로가 다르면 unlink하지 않는다.

```bash
test "$(sudo readlink /etc/nginx/sites-enabled/zz-popchive-public)" = \
  /etc/nginx/sites-available/zz-popchive-public
sudo unlink /etc/nginx/sites-enabled/zz-popchive-public
sudo nginx -t
# 이미 reload한 경우에만 아래 reload가 필요하다.
sudo systemctl reload nginx
bash "$STAGE/verify-public-legal.sh" api "$EC2_IP"
sudo sha256sum --check --status "$STAGE/existing-files.sha256"
readlink /etc/nginx/sites-enabled/default > "$STAGE/default-link.rollback"
cmp "$STAGE/default-link.before" "$STAGE/default-link.rollback"
docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.RestartCount}}' \
  popchive-backend-1 popchive-mysql-1 > "$STAGE/containers.rollback"
cmp "$STAGE/containers.before" "$STAGE/containers.rollback"
```

reload 전 nginx -t만 실패했다면 symlink를 해제한 뒤 nginx -t만 확인하고 reload를 생략한다. 기존 프로세스는 이전 설정을 계속 사용한다. 새 HTML·sites-available 파일·새 인증서는 진단을 위해 남겨두며 API 인증서를 삭제·복원·재발급하지 않는다. 선택적으로 설치한 새 갱신 hook도 symlink가 없으면 실행되지 않는다.

기존 파일 해시나 컨테이너 상태가 달라지면 무조건 복원하거나 재시작하지 말고 중단한다. 인증서 해시는 기존 certbot.timer의 정상 갱신으로 바뀔 수도 있으므로 이유를 확인한다. 향후 서비스 DNS 전환 후 문제가 생기면 보관한 루트 레코드를 Vercel 값으로 복구하고, 캐시 TTL 동안 EC2로 오는 요청을 고려해 새 사이트 제거 시점을 결정한다.

## 로컬 검증 범위

HTML 원문 보존, 링크와 static alias 경로, 별도 인증서 경로, 셸 문법, 압축 내용·체크섬을 로컬에서 확인한다. 로컬 Nginx 실행 파일과 발급된 루트 인증서가 없어 실제 nginx -t 및 운영 HTTPS 검증은 아직 수행하지 않았다. 적용 단계의 nginx -t와 before 검증 통과가 필수다.
