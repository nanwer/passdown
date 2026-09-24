#!/bin/sh
# Save a private backup, publishing it only after an offline integrity check.
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
env_file=$here/.env
directory=
usage() { printf '%s\n' 'Usage: backup.sh [--env-file FILE] [directory]'; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --env-file)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
      env_file=$2; shift 2 ;;
    --*) usage >&2; exit 2 ;;
    *) [ -z "$directory" ] || { usage >&2; exit 2; }; directory=$1; shift ;;
  esac
done
# Resolve caller-relative paths before Compose changes its project directory.
case "$env_file" in /*) ;; *) env_file=$PWD/$env_file ;; esac
[ -f "$env_file" ] || { printf '%s\n' 'backup.sh: settings file not found.' >&2; exit 3; }
directory=${directory:-"$here/backups"}
case "$directory" in /*) ;; *) directory=$PWD/$directory ;; esac
mkdir -p "$directory"
directory=$(CDPATH= cd -- "$directory" && pwd -P)
partial=$(mktemp "$directory/.passdown-backup.XXXXXXXX")
child=
cleanup() {
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || :
    wait "$child" 2>/dev/null || :
  fi
  rm -f "$partial"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Background + wait keeps shell signal traps responsive while Docker runs.
# Compose reads settings as data; they are never sourced as shell instructions.
docker compose --project-directory "$here" --env-file "$env_file" run --rm -T ops backup > "$partial" &
child=$!
if wait "$child"; then child=; else status=$?; child=; exit "$status"; fi
docker compose --project-directory "$here" --env-file "$env_file" run --rm --no-deps -T ops restore --check < "$partial" >&2 &
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
    trap - EXIT
    printf '%s\n' "$final"
    exit 0
  fi
  number=$((number + 1))
done
printf '%s\n' 'backup.sh: could not publish a backup without replacing an existing path.' >&2
exit 1
