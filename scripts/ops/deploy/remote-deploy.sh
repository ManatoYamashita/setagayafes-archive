#!/bin/sh
# Deploys the new top (a zip from `pnpm package`) into the archive's public folder
# on the Sakura server. Runs on the server (FreeBSD sh); see docs/ops/deploy.md.
#
#   ssh setagayafes-archive 'sh -s -- archive-top-<commit>.zip' \
#     < scripts/ops/deploy/remote-deploy.sh
#
# "setagayafes-archive" is a Host alias in your ~/.ssh/config (docs/ops/deploy.md).
# The real user and server names are not written in this public repository.
#
# The zip and its .sha256 must already be in ~/archive-docs/deploy/inbox/.
# Before extracting, everything the zip will write to is kept in
# ~/archive-docs/deploy/<stamp>/before/ (files copied, folders moved), so that
# remote-rollback.sh can put it back. Folders from the zip (en/, _astro/) are
# replaced, not merged, so stale hashed files do not pile up.
# Nothing outside the zip's top-level entries is touched, and a folder on the
# server is replaced only if an earlier deployment created it.
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

# A backup is never reused: a second run with the same stamp would copy the
# files it had just deployed over the backup of the originals.
mkdir -p "$DEPLOY"
chmod 700 "$DEPLOY"
mkdir "$BACKUP" 2>/dev/null || fail "a backup for $STAMP already exists: $BACKUP"
mkdir "$BACKUP/before"
chmod 700 "$BACKUP"

# True when an earlier deployment wrote the entry. Only deployments that got
# past these checks count: they have existing.txt next to entries.txt.
created_by_us() {
  for dir in "$DEPLOY"/*/; do
    [ "$dir" != "$BACKUP/" ] && [ -f "$dir/existing.txt" ] || continue
    grep -Fxq "$1" "$dir/entries.txt" && return 0
  done
  return 1
}

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
  # Any other folder already on the server (e.g. .well-known) belongs to
  # someone else unless one of our deployments created it.
  if [ -d "$PUBLIC/$entry" ] && ! created_by_us "$entry"; then
    fail "the zip would replace a folder an earlier deployment did not create: $entry"
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
