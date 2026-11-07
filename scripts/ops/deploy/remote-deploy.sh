#!/bin/sh
# Deploys the new top (a zip from `pnpm package`) into the archive's public folder
# on the Sakura server. Runs on the server (FreeBSD sh); see docs/ops/deploy.md.
#
#   ssh setagayafes@www3019.sakura.ne.jp 'sh -s -- archive-top-<commit>.zip' \
#     < scripts/ops/deploy/remote-deploy.sh
#
# The zip and its .sha256 must already be in ~/archive-docs/deploy/inbox/.
# Before extracting, everything the zip will write to is kept in
# ~/archive-docs/deploy/<stamp>/before/ (files copied, folders moved), so that
# remote-rollback.sh can put it back. Folders from the zip (en/, _astro/) are
# replaced, not merged, so stale hashed files do not pile up.
# Nothing outside the zip's top-level entries is touched.
set -eu

ZIP_NAME=${1:?usage: remote-deploy.sh <zip name>}
PUBLIC=${PUBLIC:-$HOME/www/archive}
DEPLOY=$HOME/archive-docs/deploy
ZIP=$DEPLOY/inbox/$ZIP_NAME
STAMP=${STAMP:-$(date +%Y%m%d-%H%M%S)}
BACKUP=$DEPLOY/$STAMP

fail() { echo "FAIL $*" >&2; exit 1; }

[ -d "$PUBLIC" ] || fail "no public folder: $PUBLIC"
[ -f "$ZIP" ] || fail "no zip: $ZIP"
[ -f "$ZIP.sha256" ] || fail "no checksum: $ZIP.sha256"

if command -v sha256 >/dev/null 2>&1; then
  actual=$(sha256 -q "$ZIP")
else
  actual=$(shasum -a 256 "$ZIP" | cut -d' ' -f1)
fi
expected=$(cut -d' ' -f1 "$ZIP.sha256")
[ "$actual" = "$expected" ] || fail "checksum mismatch: $ZIP"
echo "ok   checksum $actual"

mkdir -p "$BACKUP/before"
chmod 700 "$DEPLOY" "$BACKUP"

# The top-level entries the zip writes, e.g. index.html, en, _astro, .htaccess.
unzip -Z1 "$ZIP" | sed 's#/.*##' | sort -u > "$BACKUP/entries.txt"
[ -s "$BACKUP/entries.txt" ] || fail "the zip is empty"

# Refuse anything that could reach outside the top's own paths: odd names, the
# past festival folders, and the server's own folders (docs/rules/conventions.md, 4).
while IFS= read -r entry; do
  case $entry in
    "" | . | .. | */* | *[!A-Za-z0-9._-]*) fail "unexpected entry in the zip: '$entry'" ;;
  esac
  if echo "$entry" | grep -Eq '^[0-9]+(st|nd|rd|th)$|^(errorpage|todoroki|tfa|img|css|js)$'; then
    fail "the zip would overwrite a folder it does not own: $entry"
  fi
done < "$BACKUP/entries.txt"
echo "ok   entries: $(tr '\n' ' ' < "$BACKUP/entries.txt")"

# Keep what is there now. Files are copied (the site keeps working until they
# are overwritten); folders are moved away and replaced by the zip's copy.
: > "$BACKUP/existing.txt"
while IFS= read -r entry; do
  [ -e "$PUBLIC/$entry" ] || continue
  echo "$entry" >> "$BACKUP/existing.txt"
  if [ -d "$PUBLIC/$entry" ]; then
    mv "$PUBLIC/$entry" "$BACKUP/before/$entry"
  else
    cp -p "$PUBLIC/$entry" "$BACKUP/before/$entry"
  fi
done < "$BACKUP/entries.txt"
echo "$ZIP_NAME" > "$BACKUP/zip.txt"

unzip -o -q "$ZIP" -d "$PUBLIC"
echo "ok   extracted $ZIP_NAME into $PUBLIC"
echo "     backup: $BACKUP (roll back with remote-rollback.sh $STAMP)"
