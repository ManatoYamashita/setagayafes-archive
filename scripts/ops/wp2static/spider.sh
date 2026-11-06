#!/bin/sh
# Crawl a published static site and list broken in-scope links, ignoring feeds / REST / oEmbed / RSD.
# Usage: spider.sh <start-url> <work-dir> <domain>
set -u
URL=$1; W=$2; DOM=$3
wget --spider -r -l inf --no-parent -nv -e robots=off --wait=0.05 --domains "$DOM" -o "$W/spider.log" "$URL"
grep -B1 -E "broken link|404 Not Found|ERROR 4|ERROR 5" "$W/spider.log" | grep -oE "https?://[^ ]+" | sed 's/:$//' | sort -u > "$W/broken.txt"
grep -vE '/feed/?$|/wp-json|xmlrpc\.php|/oembed' "$W/broken.txt" > "$W/broken-visible.txt" || true
echo "checked: $(grep -c ' URL:' "$W/spider.log")  broken(all): $(wc -l < "$W/broken.txt")  broken(excluding feeds/REST): $(wc -l < "$W/broken-visible.txt")"
head -15 "$W/broken-visible.txt"
