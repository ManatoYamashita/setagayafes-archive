// Rewrites the srcset and sizes of the <img> tags listed in
// scripts/ops/image-sizes-rules.mjs, so that past festival pages load an
// image file close to the size they show it at (Lighthouse
// "uses-responsive-images"). Only files that are already on the server are
// used as candidates; no image is made or changed.
//
// Runs on a local mirror of the pages, never on the server:
//
//   node scripts/ops/fit-image-sizes.mjs <mirror-dir> <files.txt> <out-dir>
//
//   <mirror-dir>  the archive's pages, at their paths under the archive
//                 (for example <mirror-dir>/96th/index.html)
//   <files.txt>   the files on the server that the candidates may point at,
//                 one path per line, relative to the archive folder
//                 (for example 95th/wp-content/uploads/2024/10/….jpg)
//   <out-dir>     changed pages are written here with the same relative paths
//
// Prints a JSON report. A rule that does not apply (the tag is not found,
// found twice, or a candidate is missing on the server) is listed as skipped
// and its tag is left as it is.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { URL } from "node:url";
import { fitImageSizes } from "../lib/image-sizes.mjs";
import { RULES } from "./image-sizes-rules.mjs";

const [mirror, filesTxt, out] = process.argv.slice(2);
if (!mirror || !filesTxt || !out) {
  console.error("usage: fit-image-sizes.mjs <mirror-dir> <files.txt> <out-dir>");
  process.exit(1);
}

const ARCHIVE_ORIGIN = "https://archive.setagayafes.org";

const existing = new Set(
  (await readFile(filesTxt, "utf8"))
    .split("\n")
    .map((line) => line.trim().replace(/^\.\//, ""))
    .filter(Boolean),
);

/** @param {string} url */
function exists(url) {
  const parsed = new URL(url);
  if (parsed.origin !== ARCHIVE_ORIGIN) return false;
  return existing.has(decodeURIComponent(parsed.pathname).replace(/^\//, ""));
}

const report = [];
for (const [page, rules] of Object.entries(RULES)) {
  const html = await readFile(join(mirror, page), "utf8");
  const result = fitImageSizes(html, rules, exists);
  const changed = result.results.filter((r) => r.status === "changed").length;
  if (changed > 0) {
    await mkdir(dirname(join(out, page)), { recursive: true });
    await writeFile(join(out, page), result.html, "utf8");
  }
  report.push({ page, changed, results: result.results });
}

console.log(JSON.stringify(report, null, 2));
