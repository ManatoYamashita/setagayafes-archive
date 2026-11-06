#!/bin/sh
# Remove <link> tags that point at endpoints a static copy cannot serve (feeds, REST API, oEmbed, RSD).
# Usage: strip-dynamic-links.sh <static-dir>
set -eu
find "$1" -name '*.html' -type f | while IFS= read -r f; do
  perl -0pi -e '
    s{<link[^>]+rel=["\x27](?:alternate)["\x27][^>]+type=["\x27](?:application/(?:rss\+xml|atom\+xml|json|json\+oembed|xml\+oembed)|text/xml\+oembed)["\x27][^>]*>\s*}{}gi;
    s{<link[^>]+rel=["\x27](?:https://api\.w\.org/|EditURI|wlwmanifest|pingback|shortlink)["\x27][^>]*>\s*}{}gi;
  ' "$f"
done
echo "remaining dynamic refs: $(grep -rlE 'wp-json|xmlrpc\.php|/feed["/]' "$1" --include='*.html' | wc -l) files"
