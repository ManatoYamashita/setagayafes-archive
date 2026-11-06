#!/bin/sh
# Build a static copy of a WordPress site.
# Usage: build-static.sh <wp-dir> <crawl-dir> <out-dir> <rewrite-base>
#   wp-dir:       the live WordPress folder (read only)
#   crawl-dir:    wget mirror output (HTML pages, saved with .html)
#   out-dir:      staging folder to create (must not exist)
#   rewrite-base: URL path of the site, e.g. /todoroki/2011/
set -eu
WP=$1; CRAWL=$2; OUT=$3; BASE=$4
case $OUT in /*) ;; *) OUT=$PWD/$OUT ;; esac
case $CRAWL in /*) ;; *) CRAWL=$PWD/$CRAWL ;; esac
[ -e "$OUT" ] && { echo "out-dir exists: $OUT" >&2; exit 1; }
mkdir -p "$OUT"
# 1) Static assets from the WordPress folder: everything except code, secrets, backups and logs.
( cd "$WP" && find . -type f \
    ! -name '*.php' ! -name '*.phtml' ! -name '*.sql' ! -name '*.sql.gz' ! -name '*.log' \
    ! -name '*.bak' ! -name '*.orig' ! -name '*.swp' ! -name '.htaccess' ! -name '.htpasswd' \
    ! -name 'wp-config*' ! -name '.user.ini' ! -name 'php.ini' ! -name '*.sh' \
    ! -name 'readme.html' ! -name 'license.txt' ! -name 'readme-ja.html' \
    ! -path './wp-content/backup-db/*' ! -path './wp-content/upgrade/*' ! -path './wp-content/cache/*' \
    ! -path './wp-content/backups/*' ! -path './wp-content/uploads/backup*' ! -path '*/.git/*' \
    -print 2>"$OUT.find-errors.txt" || true ) > "$OUT.assets.txt"
# Unreadable folders (e.g. a plugin disabled with mode 000) are skipped; list them for the record.
[ -s "$OUT.find-errors.txt" ] && echo "skipped (unreadable): $(wc -l < "$OUT.find-errors.txt") path(s), see $OUT.find-errors.txt"
# rsync copies names byte for byte (tar warned on non-UTF-8 names such as Shift_JIS uploads).
rsync -a --files-from="$OUT.assets.txt" "$WP/" "$OUT/"
# 2) Crawled HTML on top (wins over any same-named file).
rsync -a "$CRAWL/" "$OUT/"
# 2b) Drop <link> tags for feeds / REST / oEmbed / RSD that the static copy cannot serve.
"$(dirname "$0")/strip-dynamic-links.sh" "$OUT"
# 3) Serve pretty URLs (/foo and /foo/) from foo.html, without PHP.
cat > "$OUT/.htaccess" <<HT
# Static archive of a former WordPress site (converted 2026-11-06, setagayafes-archive#2).
DirectoryIndex index.html
Options -Indexes
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase $BASE
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} ^(.+?)/?\$
RewriteCond %1.html -f
RewriteRule ^(.+?)/?\$ \$1.html [L]
</IfModule>
<FilesMatch "\.(php|phtml|sql|log|bak)\$">
Require all denied
</FilesMatch>
HT
chmod -R u=rwX,go=rX "$OUT"
echo "files: $(find "$OUT" -type f | wc -l)  size: $(du -sh "$OUT" | cut -f1)  php: $(find "$OUT" -name '*.php' | wc -l)"
