#!/bin/sh
# Upgrade a command-line Passdown installation after changing the image
# versions in its compose file (or replacing it with a newer release's file).
#
# `docker compose up -d` on its own stops the running version before the new
# version's migrations run, so a failed migration leaves the site down. This
# script applies the migrations first, with the new image, while the previous
# version keeps serving; web and the proxy are replaced only after they
# succeed. It backs up first, using the version that is running.
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
files=
project=
skip_backup=false
usage() {
  printf '%s\n' 'Usage: upgrade.sh [--file FILE]... [--project NAME] [--skip-backup]' \
    '' \
    '  Change the image versions in the compose file first. Then:' \
    '  --file FILE     the compose file the installation runs (default: compose.yaml beside' \
    '                  this script); repeat it for an overlay such as compose.build.yaml' \
    '  --project NAME  the Compose project, if it is not the folder name' \
    '  --skip-backup   do not take a backup first (only if you have just made one)'
}
fail() {
  status=$1
  shift
  printf 'upgrade.sh: %s\n' "$*" >&2
  exit "$status"
}
absolute() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help | -h) usage; exit 0 ;;
    --file)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
      [ -f "$2" ] || fail 3 "The compose file $2 was not found."
      files="$files
$(absolute "$2")"
      shift 2 ;;
    --project)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      case "$2" in '' | *[!a-z0-9_-]* | -* | _*) fail 2 'Project names use lowercase letters, digits, hyphens and underscores.' ;; esac
      project=$2
      shift 2 ;;
    --skip-backup) skip_backup=true; shift ;;
    *) usage >&2; exit 2 ;;
  esac
done
if [ -z "$files" ]; then
  [ -f "$here/compose.yaml" ] || fail 3 'No compose.yaml beside this script; name it with --file.'
  files="
$here/compose.yaml"
fi

# Settings from this shell must not point Compose at another installation.
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
# The installation's files and project, as newline-separated words, so paths
# with spaces stay one argument each.
nl='
'
compose_args=
backup_args=
old_ifs=$IFS
IFS=$nl
set -f
for file in $files; do
  compose_args="$compose_args$nl-f$nl$file"
  backup_args="$backup_args$nl--file$nl$file"
done
set +f
IFS=$old_ifs
if [ -n "$project" ]; then
  compose_args="$compose_args$nl--project-name$nl$project"
  backup_args="$backup_args$nl--project$nl$project"
fi
# shellcheck disable=SC2086 # Split on newlines only, without globbing.
compose() { (IFS=$nl; set -f; exec docker compose $compose_args "$@"); }
# shellcheck disable=SC2086
backup() { (IFS=$nl; set -f; exec sh "$here/backup.sh" $backup_args "$@"); }
log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$here/upgrade.log"
}

web=$(compose ps -q web 2>/dev/null | head -n 1) || web=
if [ -z "$web" ] || [ "$(docker inspect --format '{{.State.Running}}' "$web" 2>/dev/null)" != true ]; then
  fail 4 'This installation is not running. For a first start, use docker compose up -d.'
fi
previous=$(docker inspect --format '{{.Image}}' "$web")
log "start previous-web=$previous"

if [ "$skip_backup" = false ]; then
  printf '%s\n' 'Backing up with the running version…' >&2
  backup --image "$previous" >&2 || {
    log 'failed: backup'
    fail 1 'The backup failed, so nothing was upgraded.'
  }
fi

printf '%s\n' 'Fetching the new version…' >&2
# Release tags never move, so an image already on this host is the one named;
# locally built images (compose.build.yaml) are never pulled.
if ! compose pull --quiet --ignore-buildable --policy missing >&2; then
  log 'failed: pull'
  fail 1 'The new images could not be fetched. Nothing was changed.'
fi

printf '%s\n' 'Applying migrations with the new version while the current one keeps serving…' >&2
# The command is given without the compose file's --status-dir: if this
# fails, the previous version is still serving, so the proxy must not be
# left an "upgrade failed" notice to show should web stop later.
if ! compose run --rm -T migrate migrate >&2; then
  log 'failed: migrations failed; previous version still running'
  fail 1 'Migrations failed; the site is still running the previous version. Nothing else was changed. Read the error above, and see the upgrade guide before retrying.'
fi
log migrated

printf '%s\n' 'Starting the new version…' >&2
if ! compose up -d --wait --wait-timeout 300 >&2; then
  log 'failed: new version did not become healthy'
  fail 1 'Migrations were applied, but the new version did not become healthy. Read docker compose logs web. To go back, restore the backup with the previous version as described in the upgrade guide.'
fi
log 'replaced web'
compose run --rm -T ops version
compose run --rm -T ops status
printf '%s\n' 'Upgrade complete.'
