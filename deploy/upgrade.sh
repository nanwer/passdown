#!/bin/sh
# Upgrade a running Passdown installation, replacing web only after the new
# version's migrations have succeeded. A failed migration leaves the site
# running the previous version.
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
env_file=$here/.env
mode=
image=
proxy_image=
skip_backup=false
usage() {
  printf '%s\n' \
    'Usage: upgrade.sh [--env-file FILE] [--skip-backup] --build' \
    '       upgrade.sh [--env-file FILE] [--skip-backup] --image REF [--proxy-image REF]' \
    '' \
    '  --build        rebuild the images from this source checkout, then upgrade' \
    '  --image REF    upgrade to a published application image' \
    '  --skip-backup  do not take a backup first (only if you have just made one)'
}
fail() {
  status=$1
  shift
  printf 'upgrade.sh: %s\n' "$*" >&2
  exit "$status"
}
valid_reference() {
  # A plain registry reference: no spaces, shell characters or leading dash.
  case "$1" in '' | -* | *[!A-Za-z0-9._:/@-]*) return 1 ;; esac
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help | -h) usage; exit 0 ;;
    --env-file)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
      env_file=$2; shift 2 ;;
    --build) [ -z "$mode" ] || { usage >&2; exit 2; }; mode=build; shift ;;
    --image)
      [ -z "$mode" ] && [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      valid_reference "$2" || fail 2 'The image reference is invalid.'
      mode=image; image=$2; shift 2 ;;
    --proxy-image)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      valid_reference "$2" || fail 2 'The proxy image reference is invalid.'
      proxy_image=$2; shift 2 ;;
    --skip-backup) skip_backup=true; shift ;;
    *) usage >&2; exit 2 ;;
  esac
done
[ -n "$mode" ] || { usage >&2; exit 2; }
[ "$mode" = image ] || [ -z "$proxy_image" ] || fail 2 '--proxy-image is only used with --image.'
case "$env_file" in /*) ;; *) env_file=$PWD/$env_file ;; esac
[ -f "$env_file" ] && [ ! -L "$env_file" ] || fail 3 'The settings file was not found.'
# The settings name their Compose files relatively, and Compose resolves them
# against the working directory: run every command from the installation.
cd "$here"

read_setting() {
  awk -v key="$1" 'index($0,key "=")==1 {count++; value=substr($0,length(key)+2)} END {if(count>1) exit 1; print value}' "$env_file"
}
compose_files=$(read_setting COMPOSE_FILE) || fail 3 'COMPOSE_FILE appears more than once in the settings file.'
proxy=$(read_setting PASSDOWN_PROXY) || fail 3 'PASSDOWN_PROXY appears more than once in the settings file.'
case "${proxy:-caddy}" in caddy|nginx) proxy=${proxy:-caddy} ;; *) fail 3 'PASSDOWN_PROXY must be caddy or nginx.' ;; esac
case "$proxy:$compose_files" in
  caddy:compose.yaml | nginx:compose.yaml:compose.nginx.yaml) built=false ;;
  caddy:compose.yaml:compose.build.yaml | nginx:compose.yaml:compose.build.yaml:compose.nginx.yaml:compose.nginx.build.yaml) built=true ;;
  *) fail 3 'The settings name Compose files that do not match PASSDOWN_PROXY; see the configuration reference.' ;;
esac
if [ "$mode" = build ] && [ "$built" = false ]; then
  fail 4 'This installation uses published images; upgrade it with --image instead of --build.'
fi
proxy_tag=passdown-$proxy

# Settings come only from the settings file: a variable left in this shell
# would otherwise override it and point Compose at another installation or image.
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_DISABLE_ENV_FILE
for variable in $(env | awk -F= '/^(PASSDOWN_|GUIDE_|BETTER_AUTH_)/ {print $1}'); do
  unset "$variable"
done
compose() {
  docker compose --project-directory "$here" --env-file "$env_file" "$@"
}
log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$here/upgrade.log"
}
running_image() {
  container=$(compose ps -q "$1" 2>/dev/null | head -n 1)
  [ -n "$container" ] || return 1
  docker inspect --format '{{.Image}}' "$container"
}

web=$(compose ps -q web 2>/dev/null | head -n 1) || web=
if [ -z "$web" ] || [ "$(docker inspect --format '{{.State.Running}}' "$web" 2>/dev/null)" != true ]; then
  fail 4 'This installation is not running. For a first start, use docker compose up -d.'
fi
previous_web=$(running_image web)
previous_proxy=$(running_image proxy) || previous_proxy=
log "start mode=$mode previous-web=$previous_web previous-proxy=${previous_proxy:-none}${image:+ image=$image}"

if [ "$skip_backup" = false ]; then
  printf '%s\n' 'Backing up before upgrading…' >&2
  sh "$here/backup.sh" --env-file "$env_file" >&2 || {
    log 'failed: backup'
    fail 1 'The backup failed, so nothing was upgraded.'
  }
fi

if [ "$mode" = build ]; then
  # The running containers keep their image. Keep a name for it too, so the
  # previous version can be started again if it is ever needed.
  docker tag "$previous_web" passdown:previous
  [ -z "$previous_proxy" ] || docker tag "$previous_proxy" "$proxy_tag:previous"
  printf '%s\n' 'Building the new version…' >&2
  revision=$(git -C "$here/.." rev-parse HEAD 2>/dev/null) || revision=unknown
  PASSDOWN_REVISION=$revision compose build web proxy >&2 || {
    docker tag "$previous_web" passdown:local
    [ -z "$previous_proxy" ] || docker tag "$previous_proxy" "$proxy_tag:local"
    log 'failed: build'
    fail 1 'The build failed. The site is still running the previous version.'
  }
else
  # Release tags never move, so an image already on this host is the one named.
  fetch() { docker image inspect "$1" >/dev/null 2>&1 || { printf 'Fetching %s…\n' "$1" >&2; docker pull "$1" >&2; }; }
  fetch "$image" || { log 'failed: pull'; fail 1 'The image could not be pulled. Nothing was changed.'; }
  if [ -n "$proxy_image" ]; then
    fetch "$proxy_image" || { log 'failed: pull'; fail 1 'The proxy image could not be pulled. Nothing was changed.'; }
  fi
fi

with_new_images() {
  if [ "$mode" = image ]; then
    if [ -n "$proxy_image" ]; then
      PASSDOWN_IMAGE=$image PASSDOWN_PROXY_IMAGE=$proxy_image "$@"
    else
      PASSDOWN_IMAGE=$image "$@"
    fi
  else
    "$@"
  fi
}

printf '%s\n' 'Applying migrations with the new version…' >&2
if ! with_new_images compose run --rm -T migrate >&2; then
  if [ "$mode" = build ]; then
    docker tag "$previous_web" passdown:local
    [ -z "$previous_proxy" ] || docker tag "$previous_proxy" "$proxy_tag:local"
  fi
  log 'failed: migrations failed; previous version still running'
  fail 1 'Migrations failed; the site is still running the previous version. Nothing else was changed. Read the error above; see the upgrade guide for recovery.'
fi
log migrated

if [ "$mode" = image ]; then
  # Record the new image so every later docker compose command uses it.
  snapshot=$(mktemp "$here/.passdown-settings.XXXXXXXX")
  updated=$(mktemp "$here/.passdown-settings.XXXXXXXX")
  trap 'rm -f "$snapshot" "$updated"' EXIT
  cat "$env_file" > "$snapshot"
  awk -v image="$image" -v proxy="$proxy_image" '
    /^PASSDOWN_IMAGE=/ {print "PASSDOWN_IMAGE=" image; seen=1; next}
    /^PASSDOWN_PROXY_IMAGE=/ && proxy != "" {print "PASSDOWN_PROXY_IMAGE=" proxy; proxied=1; next}
    {print}
    END {
      if (!seen) print "PASSDOWN_IMAGE=" image
      if (proxy != "" && !proxied) print "PASSDOWN_PROXY_IMAGE=" proxy
    }' "$snapshot" > "$updated"
  chmod 600 "$updated"
  cmp -s "$snapshot" "$env_file" || fail 4 'The settings file changed during the upgrade; it was not updated. Migrations were applied: set PASSDOWN_IMAGE yourself, then run docker compose up -d.'
  mv -f "$updated" "$env_file"
fi

printf '%s\n' 'Starting the new version…' >&2
if ! with_new_images compose up -d --no-deps --wait web proxy >&2; then
  log 'failed: new version did not become healthy'
  fail 1 'Migrations were applied, but the new version did not become healthy. Read docker compose logs web. To go back, restore the backup with the previous version as described in the upgrade guide.'
fi
log 'replaced web'
compose run --rm -T ops version
compose run --rm -T ops status
printf '%s\n' 'Upgrade complete.'
