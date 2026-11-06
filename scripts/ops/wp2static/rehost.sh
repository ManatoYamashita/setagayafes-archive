#!/bin/sh
# Rewrite absolute references to an old origin so a static copy can live under a new base URL.
# Usage: rehost.sh <static-dir> <old-host> <new-base-url-with-trailing-slash>
#   e.g. rehost.sh out 96th.setagayafes.org https://archive.setagayafes.org/96th/
set -eu
DIR=$1; OLD=$2; NEW=$3
export OLD NEW
find "$DIR" -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.json' -o -name '*.xml' -o -name '*.svg' \) | while IFS= read -r f; do
  LC_ALL=C grep -q -F "$OLD" "$f" || continue
  perl -pi -e '
    BEGIN { ($o = quotemeta $ENV{OLD}); $n = $ENV{NEW}; ($ne = $n) =~ s{/}{\\/}g; }
    s{(?:https?:)?//(?:www\.)?$o/}{$n}g;          # https://host/  //host/  www.host
    s{(?:https?:)?\\/\\/(?:www\.)?$o\\/}{$ne}g;    # JSON-escaped https:\/\/host\/
    s{(?:https?:)?//(?:www\.)?$o(?=["\x27\s<)])}{substr($n,0,-1)}ge;  # bare origin without trailing slash
  ' "$f"
done
echo "files still mentioning $OLD: $(LC_ALL=C grep -rlF "$OLD" "$DIR" --include='*.html' --include='*.css' --include='*.js' | wc -l)"
echo "root-relative refs in html (href/src=\"/...\" not //): $(LC_ALL=C grep -rhoE '(href|src)="/[^/"][^"]*"' "$DIR" --include='*.html' | sort -u | wc -l)"
