#!/bin/sh
# Puts the archive's public folder back as it was before a deployment by
# remote-deploy.sh. Runs on the server (FreeBSD sh); see docs/ops/deploy.md.
#
#   ssh setagayafes@www3019.sakura.ne.jp 'sh -s -- <stamp>' \
#     < scripts/ops/deploy/remote-rollback.sh
#
# <stamp> is the backup folder name that remote-deploy.sh printed
# (~/archive-docs/deploy/<stamp>/). Entries the deployment created are removed;
# entries it replaced are restored from the backup.
set -eu

STAMP=${1:?usage: remote-rollback.sh <stamp>}
PUBLIC=${PUBLIC:-$HOME/www/archive}
BACKUP=$HOME/archive-docs/deploy/$STAMP

fail() { echo "FAIL $*" >&2; exit 1; }

[ -d "$PUBLIC" ] || fail "no public folder: $PUBLIC"
[ -f "$BACKUP/entries.txt" ] && [ -f "$BACKUP/existing.txt" ] || fail "not a deployment backup: $BACKUP"

while IFS= read -r entry; do
  # remote-deploy.sh only wrote plain top-level names; check again before removing.
  case $entry in
    "" | . | .. | */* | *[!A-Za-z0-9._-]*) fail "unexpected entry: '$entry'" ;;
  esac
  rm -rf "${PUBLIC:?}/$entry"
  if grep -Fxq "$entry" "$BACKUP/existing.txt"; then
    if [ -d "$BACKUP/before/$entry" ]; then
      cp -Rp "$BACKUP/before/$entry" "$PUBLIC/$entry"
    else
      cp -p "$BACKUP/before/$entry" "$PUBLIC/$entry"
    fi
    echo "ok   restored $entry"
  else
    echo "ok   removed $entry (it did not exist before)"
  fi
done < "$BACKUP/entries.txt"

echo "ok   rolled back to before $(cat "$BACKUP/zip.txt" 2>/dev/null || echo "the deployment")"
