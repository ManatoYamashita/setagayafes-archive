#!/bin/sh
# Mirror the HTML pages of a WordPress site (query-string URLs and dynamic endpoints excluded).
# Usage: crawl.sh <start-url> <cut-dirs> <out-dir> <domain> [url-list-file]
#   url-list-file: optional extra start URLs (e.g. from wp-sitemap.xml) for pages the menus do not link to
set -eu
URL=$1; CUT=$2; OUT=$3; DOM=$4; LIST=${5:-}
EXTRA=""; [ -n "$LIST" ] && EXTRA="--input-file=$LIST"
mkdir -p "$OUT/crawl"
cd "$OUT/crawl"
wget --mirror --page-requisites --adjust-extension --no-parent -nH --cut-dirs="$CUT" \
  --restrict-file-names=nocontrol -e robots=off --wait=0.1 --tries=2 --timeout=30 \
  --reject-regex '(\?|/wp-admin|wp-login\.php|xmlrpc\.php|/wp-json|/feed/?$|/trackback|/embed/?$|/wp-cron|/amp/?$)' \
  --domains "$DOM" -o "$OUT/wget.log" $EXTRA "$URL" || echo "wget exit $? (8 = some server errors; see wget.log)"
echo "html: $(find . -name '*.html' | wc -l)  other: $(find . -type f ! -name '*.html' | wc -l)  size: $(du -sh . | cut -f1)"
echo "server errors:"; grep -E "ERROR [0-9]+" "$OUT/wget.log" | sort | uniq -c | head
