#!/bin/sh
# Dump the WordPress tables of a site without printing credentials.
# Usage: dump-db.sh <wp-dir> <out-file.sql.gz>
set -eu
WP=$1; OUT=$2
umask 077
CNF=$(mktemp)
trap 'rm -f "$CNF"' EXIT
php -r '
$s = file_get_contents($argv[1]);
$get = function ($k) use ($s) { preg_match("/define\(\s*[\x27\"]".$k."[\x27\"]\s*,\s*[\x27\"]([^\x27\"]*)[\x27\"]/", $s, $m); return $m[1] ?? ""; };
preg_match("/\\\$table_prefix\s*=\s*[\x27\"]([^\x27\"]*)/", $s, $p);
echo "[client]\nuser=".$get("DB_USER")."\npassword=\"".$get("DB_PASSWORD")."\"\nhost=".$get("DB_HOST")."\n# db=".$get("DB_NAME")."\n# prefix=".($p[1] ?? "")."\n";
' "$WP/wp-config.php" > "$CNF"
DB=$(sed -n 's/^# db=//p' "$CNF"); PREFIX=$(sed -n 's/^# prefix=//p' "$CNF")
TABLES=$(mysql --defaults-extra-file="$CNF" -N -e "SHOW TABLES LIKE '$(echo "$PREFIX" | sed 's/_/\\_/g')%'" "$DB")
[ -n "$TABLES" ] || { echo "no tables for prefix $PREFIX" >&2; exit 1; }
mysqldump --defaults-extra-file="$CNF" --single-transaction --no-tablespaces "$DB" $TABLES | gzip > "$OUT"
echo "db=$DB prefix=$PREFIX tables=$(echo $TABLES | wc -w) size=$(ls -l "$OUT" | awk '{print $5}')B"
gzip -dc "$OUT" | tail -1
