#!/usr/bin/env bash
# Read-only HTTP checks. No reload, DNS update or certificate operation.
# Usage: bash verify-public-legal.sh api|before|after EC2_IPV4 [HTML_SOURCE_DIR]
set -euo pipefail
umask 077

mode="${1:?Usage: bash verify-public-legal.sh api|before|after EC2_IPV4 [HTML_SOURCE_DIR]}"
ec2_ip="${2:?EC2 public IPv4 is required}"
source_dir="${3:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)}"
case "$mode" in api|before|after) ;; *) printf 'Invalid mode\n' >&2; exit 2 ;; esac
if [[ ! "$ec2_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    printf 'Supply the confirmed EC2 public IPv4, not a placeholder\n' >&2
    exit 2
fi
for dependency in curl python3 cmp grep; do
    command -v "$dependency" >/dev/null || { printf 'Missing command: %s\n' "$dependency" >&2; exit 2; }
done

check_dir="$(mktemp -d)"
trap 'rm -f -- "$check_dir"/*.headers "$check_dir"/*.body; rmdir -- "$check_dir"' EXIT

request() {
    local url="$1" output_name="$2" expected="$3" code
    shift 3
    code="$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
        -H 'Accept-Encoding: identity' "$@" \
        -D "$check_dir/$output_name.headers" -o "$check_dir/$output_name.body" \
        -w '%{http_code}' "$url")"
    printf '%s HTTP %s\n' "$url" "$code"
    if [[ "$code" != "$expected" ]]; then
        printf 'Expected HTTP %s; no redirect following is allowed\n' "$expected" >&2
        return 1
    fi
}

check_api() {
    local label="$1"
    shift
    request 'https://api.popchive.com/api/regions?countryCode=KR' "api-$label" 200 "$@"
    python3 - "$check_dir/api-$label.body" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as response:
    data = json.load(response)
if not isinstance(data, list) or not all(
    isinstance(item, dict) and isinstance(item.get('id'), int)
    and not isinstance(item['id'], bool) and isinstance(item.get('name'), str)
    for item in data
):
    raise SystemExit('API JSON schema mismatch')
print('API JSON schema OK')
PY
}

# Check both the existing public API and its EC2 route in every mode.
check_api dns
check_api ec2 --resolve "api.popchive.com:443:$ec2_ip"
if [[ "$mode" == api ]]; then
    printf 'API baseline/check passed\n'
    exit 0
fi

resolve_args=()
if [[ "$mode" == before ]]; then
    resolve_args=(--resolve "popchive.com:443:$ec2_ip")
fi
while read -r route file_name; do
    test -f "$source_dir/$file_name"
    request "https://popchive.com$route" "$file_name" 200 "${resolve_args[@]}"
    grep -Eiq '^content-type:[[:space:]]*text/html;.*charset=utf-8' "$check_dir/$file_name.headers"
    cmp -- "$source_dir/$file_name" "$check_dir/$file_name.body"
done <<'PAGES'
/privacy privacy.html
/ja/privacy privacy-ja.html
/support support.html
PAGES

for route in / /privacy.html /privacy-ja.html /support.html /privacy/ \
    /ja/privacy/ /support/ /admin /api /REVIEW.md /.env; do
    request "https://popchive.com$route" blocked 404 "${resolve_args[@]}"
done
printf 'PASS: TLS, API, three HTML bodies, UTF-8 headers and blocked routes (%s)\n' "$mode"
