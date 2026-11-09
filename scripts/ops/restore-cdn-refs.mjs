// Restores the web font and icon font references of a past festival site to
// their original CDN (Issue #3). HTTrack saved "//fonts.googleapis.com/css?…"
// as a relative path that climbs out of the site ("../../css?family=…"), which
// is a 404 on the archive host. Only references that climb above the site's
// own folder are changed, so the site's own css/ or font-awesome/ folders are
// left alone.
//
// Not restored, on purpose (Issue #3): the X (Twitter) widget, Google Analytics
// (gtag) and the Jetpack stats script. The archive adds no tracking (Issue #1),
// and the X embed no longer works without signing in.
//
// Runs on a local mirror of the site's text files, never on the server:
//
//   node scripts/ops/restore-cdn-refs.mjs <mirror-dir> <out-dir>
//
// Changed files are written to <out-dir> with the same relative paths.
// Prints a JSON report.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listFiles } from "../lib/rules.mjs";

const [mirror, out] = process.argv.slice(2);
if (!mirror || !out) {
  console.error("usage: restore-cdn-refs.mjs <mirror-dir> <out-dir>");
  process.exit(1);
}

/**
 * HTTrack's path (after the "../" part) and the original URL. "-1", "-2" are
 * the suffixes HTTrack adds when names collide; "b16c" is its hash of a query.
 */
const RULES = [
  { name: "google-fonts-css", from: /^css(?:-\d+)?\?/, to: "https://fonts.googleapis.com/css?" },
  { name: "google-fonts-css2", from: /^css2(?:-\d+)?\?/, to: "https://fonts.googleapis.com/css2?" },
  {
    name: "font-awesome-4",
    from: /^font-awesome\/(?=4\.\d+\.\d+\/)/,
    to: "https://maxcdn.bootstrapcdn.com/font-awesome/",
  },
  {
    name: "font-awesome-5-js",
    from: /^use\.fontawesome\.com\/releases\/(v[\d.]+)\/js\/all[0-9a-f]{4}\.js/,
    to: "https://use.fontawesome.com/releases/$1/js/all.js",
  },
  {
    name: "font-awesome-5-host",
    from: /^use\.fontawesome\.com\/index\.html/,
    to: "https://use.fontawesome.com/",
  },
];

const report = { files: 0, refs: /** @type {Record<string, number>} */ ({}) };

for (const file of (await listFiles(mirror)).filter((name) => /\.(html?|css|js)$/i.test(name))) {
  const depth = file.split("/").length - 1;
  const text = await readFile(join(mirror, file), "latin1");
  let changed = false;
  const next = text.replace(/(["'(])((?:\.\.\/)+)([^"'()\s>]+)/g, (whole, open, ups, rest) => {
    // Only paths that leave the site's folder: more "../" than the file is deep.
    if (ups.length / 3 <= depth) return whole;
    for (const rule of RULES) {
      if (!rule.from.test(rest)) continue;
      report.refs[rule.name] = (report.refs[rule.name] ?? 0) + 1;
      changed = true;
      return `${open}${rest.replace(rule.from, rule.to)}`;
    }
    return whole;
  });
  if (!changed) continue;
  report.files++;
  await mkdir(dirname(join(out, file)), { recursive: true });
  await writeFile(join(out, file), next, "latin1");
}

console.log(JSON.stringify(report, null, 1));
