// Makes the relative url() values of CSS custom properties in a past festival
// site's pages absolute (Issue #3). WordPress themes write
// "--ver_page_top_button_url: url(wp-content/…)" in an inline <style>, and the
// stylesheet that uses the variable resolves the URL against its own location
// (…/assets/css/wp-content/…), not the page's, so the image is a 404.
// The URL is resolved against the page here and written as /<round>/… .
//
// Runs on a local mirror of the site's pages, never on the server:
//
//   node scripts/ops/absolutize-css-vars.mjs <round> <mirror-dir> <out-dir>
//
// Changed files are written to <out-dir> with the same relative paths.
// Prints a JSON report.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { listFiles } from "../lib/rules.mjs";

const [round, mirror, out] = process.argv.slice(2);
if (!round || !mirror || !out) {
  console.error("usage: absolutize-css-vars.mjs <round> <mirror-dir> <out-dir>");
  process.exit(1);
}

const report = { round, files: 0, values: 0 };

// "--name: url(" + optional quote + a relative path that is not data:, #… or a URL.
const VAR_URL = /(--[\w-]+\s*:\s*url\(\s*)(["']?)((?:\.\.\/)*)(wp-content\/[^"')\s]+)/g;

for (const file of (await listFiles(mirror)).filter((name) => /\.html?$/i.test(name))) {
  const text = await readFile(join(mirror, file), "latin1");
  let changed = false;
  const next = text.replace(VAR_URL, (whole, head, quote, ups, rest) => {
    const resolved = posix.normalize(posix.join(posix.dirname(file), ups, rest));
    // Stay inside the site's folder.
    if (resolved.startsWith("../")) return whole;
    report.values++;
    changed = true;
    return `${head}${quote}/${round}/${resolved}`;
  });
  if (!changed) continue;
  report.files++;
  await mkdir(dirname(join(out, file)), { recursive: true });
  await writeFile(join(out, file), next, "latin1");
}

console.log(JSON.stringify(report));
