#!/bin/sh
# Save a private backup of a Passdown installation, publishing it only after
# an offline integrity check. Works for a command-line installation and for a
# Portainer stack: name the stack's compose file and project.
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
files=
project=
image=
directory=
usage() {
  printf '%s\n' 'Usage: backup.sh [--file FILE]... [--project NAME] [--image REF] [DIRECTORY]' \
    '' \
    '  --file FILE     the compose file the installation runs (default: compose.yaml beside' \
    '                  this script); repeat it for an overlay such as compose.build.yaml' \
    '  --project NAME  the Compose project: for a Portainer stack, the stack name' \
    '  --image REF     make the backup with this Passdown image (upgrade.sh passes the running one)' \
    '  DIRECTORY       where to write the backup (default: backups beside this script)'
}
fail() { printf 'backup.sh: %s\n' "$2" >&2; exit "$1"; }
absolute() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --file)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
      [ -f "$2" ] || fail 3 "The compose file $2 was not found."
      files="$files
$(absolute "$2")"; shift 2 ;;
    --project)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      case "$2" in ''|*[!a-z0-9_-]*|-*|_*) fail 2 'Project names use lowercase letters, digits, hyphens and underscores.' ;; esac
      project=$2; shift 2 ;;
    --image)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      case "$2" in ''|-*|*[!A-Za-z0-9._:/@-]*) fail 2 'The image reference is invalid.' ;; esac
      image=$2; shift 2 ;;
    --*) usage >&2; exit 2 ;;
    *) [ -z "$directory" ] || { usage >&2; exit 2; }; directory=$1; shift ;;
  esac
done
if [ -z "$files" ]; then
  [ -f "$here/compose.yaml" ] || fail 3 'No compose.yaml beside this script; name it with --file.'
  files="
$here/compose.yaml"
fi
directory=${directory:-"$here/backups"}
directory=$(absolute "$directory")
mkdir -p "$directory"
directory=$(CDPATH= cd -- "$directory" && pwd -P)
private=$(mktemp -d "${TMPDIR:-/tmp}/passdown-backup.XXXXXXXX")
partial=$(mktemp "$directory/.passdown-backup.XXXXXXXX")
child=
cleanup() {
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || :
    wait "$child" 2>/dev/null || :
  fi
  rm -f "$partial"
  rm -rf "$private"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Settings from this shell must not point Compose at another installation.
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
set --
old_ifs=$IFS
IFS='
'
for file in $files; do set -- "$@" -f "$file"; done
IFS=$old_ifs
if [ -n "$image" ]; then
  printf 'services:\n  ops:\n    image: "%s"\n    pull_policy: missing\n' "$image" > "$private/image.yaml"
  set -- "$@" -f "$private/image.yaml"
fi
[ -z "$project" ] || set -- "$@" --project-name "$project"

# Background + wait keeps shell signal traps responsive while Docker runs.
docker compose "$@" run --rm -T ops backup > "$partial" &
child=$!
if wait "$child"; then child=; else status=$?; child=; exit "$status"; fi
docker compose "$@" run --rm --no-deps -T ops restore --check < "$partial" >&2 &
child=$!
if wait "$child"; then child=; else status=$?; child=; exit "$status"; fi

# Flush the verified partial before publication. POSIX sync also flushes other
# pending host writes, avoiding a platform-specific fsync dependency.
sync

stamp=$(date -u +%Y%m%dT%H%M%SZ)
number=1
while [ "$number" -le 99 ]; do
  if [ "$number" -eq 1 ]; then final=$directory/passdown-$stamp.tar
  else final=$directory/passdown-$stamp-$number.tar
  fi
  # Skip directories and symlinks too: plain ln treats a directory as a
  # destination container rather than refusing the existing candidate name.
  if [ ! -e "$final" ] && [ ! -L "$final" ] && ln "$partial" "$final" 2>/dev/null; then
    rm -f "$partial"
    printf '%s\n' "$final"
    exit 0
  fi
  number=$((number + 1))
done
printf '%s\n' 'backup.sh: could not publish a backup without replacing an existing path.' >&2
exit 1
