#!/bin/sh
# Create host settings without ever persisting the one-time setup code.
set -eu
umask 077
LC_ALL=C
export LC_ALL

fail() { printf '%s\n' "$2" >&2; exit "$1"; }
usage() {
  printf '%s\n' 'Usage: sh init.sh --domain HOST [--acme-email EMAIL | --internal-tls]' \
    '                  [--http-port PORT] [--https-port PORT] [--output FILE] [--build]' \
    '       sh init.sh --renew-setup-code [--output FILE]' \
    'Caddy is the supported proxy. localhost uses an internal certificate.'
}
need_value() { [ "$#" -ge 2 ] && [ -n "$2" ] || fail 2 'An option is missing its value.'; }
output=./.env
domain=
email=
internal=false
http_port=80
https_port=443
build=false
renew=false
creation_options=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --output) need_value "$@"; output=$2; shift 2 ;;
    --renew-setup-code) renew=true; shift ;;
    --domain) need_value "$@"; domain=$2; creation_options=true; shift 2 ;;
    --acme-email) need_value "$@"; email=$2; creation_options=true; shift 2 ;;
    --internal-tls) internal=true; creation_options=true; shift ;;
    --http-port) need_value "$@"; http_port=$2; creation_options=true; shift 2 ;;
    --https-port) need_value "$@"; https_port=$2; creation_options=true; shift 2 ;;
    --build) build=true; creation_options=true; shift ;;
    --proxy) need_value "$@"; [ "$2" = caddy ] || fail 3 'Only the Caddy proxy is supported by this version of init.sh.'; creation_options=true; shift 2 ;;
    --tls-dir|--tls-cert|--tls-key|--acme-webroot) fail 3 'nginx certificate options are not supported by this version of init.sh.' ;;
    *) fail 2 'Unknown option. Run sh init.sh --help for supported options.' ;;
  esac
done

# Resolve once, then keep Compose tied to the settings directory even when this
# script was invoked elsewhere. Never source a settings file as shell code.
case "$output" in /*) ;; *) output=$PWD/$output ;; esac
install_dir=$(CDPATH= cd -- "$(dirname "$output")" 2>/dev/null && pwd -P) || fail 3 'The settings directory does not exist.'
output=$install_dir/$(basename "$output")
[ "$(basename "$output")" != . ] && [ "$(basename "$output")" != .. ] || fail 2 'Choose a settings filename.'
temporary=
snapshot=
lock=
cleanup() {
  [ -z "$temporary" ] || rm -f "$temporary"
  [ -z "$snapshot" ] || rm -f "$snapshot"
  [ -z "$lock" ] || rmdir "$lock"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

random_hex() {
  generated=$(od -An -v -N "$1" -tx1 /dev/urandom | tr -d ' \n')
  [ "${#generated}" -eq "$(( $1 * 2 ))" ] || fail 1 'Could not obtain secure random bytes.'
  printf '%s' "$generated"
}
make_code() {
  # Reject the top 32 byte values; the remaining 224 map uniformly to 32 symbols.
  setup_code=$(od -An -v -N 64 -tu1 /dev/urandom | awk '
    BEGIN { alphabet="0123456789ABCDEFGHJKMNPQRSTVWXYZ"; count=0 }
    { for (i=1; i<=NF && count<20; i++) if ($i<224) { printf "%s", substr(alphabet, ($i%32)+1, 1); count++ } }')
  [ "${#setup_code}" -eq 20 ] || fail 1 'Could not obtain a secure setup code. Try again.'
  if command -v sha256sum >/dev/null 2>&1; then
    setup_hash=$(printf '%s' "$setup_code" | sha256sum | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    setup_hash=$(printf '%s' "$setup_code" | shasum -a 256 | awk '{print $1}')
  elif command -v openssl >/dev/null 2>&1; then
    setup_hash=$(printf '%s' "$setup_code" | openssl dgst -sha256 | awk '{print $NF}')
  else
    fail 3 'Install sha256sum, shasum, or openssl to hash the setup code.'
  fi
  [ "${#setup_hash}" -eq 64 ] || fail 1 'Could not hash the setup code.'
  case "$setup_hash" in *[!0-9a-f]*) fail 1 'Could not hash the setup code.' ;; esac
}
print_code() {
  printf '\n  Setup code:  '
  printf '%s' "$setup_code" | awk '{printf "%s-%s-%s-%s\n",substr($0,1,5),substr($0,6,5),substr($0,11,5),substr($0,16,5)}'
  printf '\n%s\n' 'This code is shown only now and is not stored anywhere. It works until setup completes or the code is renewed.'
}
shell_quote() { printf "'"; printf '%s' "$1" | sed "s/'/'\\\\''/g"; printf "'"; }
print_compose() {
  printf 'docker compose --project-directory '; shell_quote "$install_dir"
  printf ' --env-file '; shell_quote "$output"
  printf ' --project-name '; shell_quote "$project"
  printf ' -f '; shell_quote "$install_dir/compose.yaml"
  if [ "$compose_files" = compose.yaml:compose.build.yaml ]; then
    printf ' -f '; shell_quote "$install_dir/compose.build.yaml"
  fi
}
read_setting() {
  awk -v key="$1" 'index($0,key "=")==1 {count++; value=substr($0,length(key)+2)} END {if(count!=1) exit 1; print value}' "$snapshot"
}

if [ "$renew" = true ]; then
  [ "$creation_options" = false ] || fail 2 'Renewal accepts only --output; existing installation settings are preserved.'
  [ ! -L "$output" ] && [ -f "$output" ] || fail 4 'Renewal requires an existing regular settings file, not a symlink.'
  if mkdir "$output.renew-lock" 2>/dev/null; then lock=$output.renew-lock
  else fail 4 'Another settings renewal is in progress; no settings were changed.'; fi
  snapshot=$(mktemp "$install_dir/.passdown-settings.XXXXXXXX") || fail 1 'Could not create a private settings snapshot.'
  cat "$output" > "$snapshot"
  project=$(read_setting COMPOSE_PROJECT_NAME) || fail 3 'COMPOSE_PROJECT_NAME must appear exactly once in the settings file.'
  case "$project" in ''|*[!a-z0-9_-]*|-*|_*) fail 3 'COMPOSE_PROJECT_NAME is invalid.' ;; esac
  compose_files=$(read_setting COMPOSE_FILE) || fail 3 'COMPOSE_FILE must appear exactly once in the settings file.'
  case "$compose_files" in compose.yaml|compose.yaml:compose.build.yaml) ;; *) fail 3 'The settings name unsupported Compose files.' ;; esac
  old_hash=$(read_setting PASSDOWN_SETUP_CODE_SHA256) || fail 3 'PASSDOWN_SETUP_CODE_SHA256 must appear exactly once in the settings file.'
  case "$old_hash" in *[!0-9a-f]*) fail 3 'The existing setup-code hash is invalid.' ;; esac
  [ "${#old_hash}" -eq 64 ] || fail 3 'The existing setup-code hash is invalid.'
  # Explicit files/project plus a cleared interpolation environment prevent an
  # unrelated shell's Compose settings from probing a different installation.
  if state=$(
    cd "$install_dir"
    unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_DISABLE_ENV_FILE
    unset PASSDOWN_DOMAIN BETTER_AUTH_URL PASSDOWN_TLS PASSDOWN_HTTP_PORT PASSDOWN_HTTPS_PORT
    unset PASSDOWN_HSTS_MAX_AGE GUIDE_DB_OWNER_PASSWORD GUIDE_DB_RUNTIME_PASSWORD BETTER_AUTH_SECRET
    unset PASSDOWN_SETUP_CODE_SHA256 PASSDOWN_IMAGE PASSDOWN_PROXY_IMAGE PASSDOWN_PROXY
    set -- docker compose --project-directory "$install_dir" --env-file "$output" --project-name "$project" -f compose.yaml
    [ "$compose_files" = compose.yaml ] || set -- "$@" -f compose.build.yaml
    "$@" run --rm -T ops setup-state 2>/dev/null
  ); then :
  else fail 1 'Could not read setup state. Check Docker and database availability; settings were not changed.'; fi
  case "$state" in
    required) ;;
    complete) fail 4 'Setup is already complete; there is nothing to renew. Use Administration → Accounts or ops reset-password for sign-in problems.' ;;
    *) fail 1 'Setup state was not recognized; settings were not changed.' ;;
  esac
  make_code
  temporary=$(mktemp "$install_dir/.passdown-settings.XXXXXXXX") || fail 1 'Could not create private settings.'
  awk -v hash="$setup_hash" '/^PASSDOWN_SETUP_CODE_SHA256=/ {print "PASSDOWN_SETUP_CODE_SHA256=" hash; next} {print}' "$snapshot" > "$temporary"
  chmod 600 "$temporary"
  [ ! -L "$output" ] && cmp -s "$snapshot" "$output" || fail 4 'Settings changed during renewal; nothing was replaced. Try again.'
  mv -f "$temporary" "$output"
  temporary=
  print_code
  printf '\nNext: '; print_compose; printf ' up -d --no-deps --force-recreate web\n'
  printf '%s\n' 'The previous code stops working when web is recreated.'
  exit 0
fi

[ ! -e "$output" ] && [ ! -L "$output" ] || fail 1 'The settings path already exists; nothing was overwritten.'
[ -n "$domain" ] || fail 2 '--domain is required.'
case "$domain" in *[!a-zA-Z0-9.-]*) fail 2 'Use a hostname without a scheme, port, path, or whitespace.' ;; esac
domain=$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]')
printf '%s\n' "$domain" | awk 'length($0)>253 {exit 1} {n=split($0,labels,"."); for(i=1;i<=n;i++) if(length(labels[i])<1 || length(labels[i])>63 || labels[i] ~ /^-/ || labels[i] ~ /-$/) exit 1}' || fail 2 'The hostname is invalid.'
for port in "$http_port" "$https_port"; do
  case "$port" in ''|*[!0-9]*|0*) fail 2 'Ports must be integers from 1 to 65535 without leading zeroes.' ;; esac
  [ "${#port}" -le 5 ] && [ "$port" -le 65535 ] || fail 2 'Ports must be integers from 1 to 65535.'
done
[ "$http_port" != "$https_port" ] || fail 2 'HTTP and HTTPS ports must differ.'
if [ -n "$email" ]; then
  [ "$internal" = false ] || fail 2 'Choose either --acme-email or --internal-tls.'
  case "$email" in *[!a-zA-Z0-9._%+@-]*) fail 2 'The ACME email address is invalid.' ;; esac
  printf '%s\n' "$email" | awk '/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ {ok=1} END {exit !ok}' || fail 2 'The ACME email address is invalid.'
fi
hsts=31536000
if [ "$domain" = localhost ]; then internal=true; hsts=0; fi
if [ "$internal" = true ]; then tls=internal
elif [ -n "$email" ]; then tls=$email
else fail 3 'Public domains require --acme-email EMAIL or explicit --internal-tls.'; fi
origin=https://$domain
[ "$https_port" = 443 ] || origin=$origin:$https_port
project=passdown
owner_password=$(random_hex 32)
runtime_password=$(random_hex 32)
auth_secret=$(random_hex 48)
make_code
compose_files=compose.yaml
[ "$build" = false ] || compose_files=compose.yaml:compose.build.yaml
temporary=$(mktemp "$install_dir/.passdown-settings.XXXXXXXX") || fail 1 'Could not create private settings.'
cat > "$temporary" <<SETTINGS
# Generated by init.sh. Keep this file private and out of source control.
COMPOSE_PROJECT_NAME=$project
COMPOSE_FILE=$compose_files
PASSDOWN_PROXY=caddy
PASSDOWN_DOMAIN=$domain
BETTER_AUTH_URL=$origin
PASSDOWN_TLS=$tls
PASSDOWN_HSTS_MAX_AGE=$hsts
PASSDOWN_HTTP_PORT=$http_port
PASSDOWN_HTTPS_PORT=$https_port
GUIDE_DB_OWNER_PASSWORD=$owner_password
GUIDE_DB_RUNTIME_PASSWORD=$runtime_password
BETTER_AUTH_SECRET=$auth_secret
PASSDOWN_SETUP_CODE_SHA256=$setup_hash
SETTINGS
if [ "$build" = true ]; then
  printf '%s\n' 'PASSDOWN_IMAGE=passdown:local' 'PASSDOWN_PROXY_IMAGE=passdown-caddy:local' >> "$temporary"
fi
chmod 600 "$temporary"
# A hard-link claims the destination exclusively, including against another init.
ln "$temporary" "$output" 2>/dev/null || fail 1 'The settings path already exists or could not be created; nothing was overwritten.'
printf '%s\n' 'Wrote private settings (0600). Keep a copy in your password manager.'
print_code
printf '\nNext: '; print_compose; printf ' up -d\n'
printf 'Then open %s/setup and enter the code.\n' "$origin"
printf 'If you lose the code before finishing setup: sh init.sh --renew-setup-code --output '; shell_quote "$output"; printf '\n'
