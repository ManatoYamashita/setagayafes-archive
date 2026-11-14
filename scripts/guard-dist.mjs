// Build-output guard. Runs automatically at the end of `pnpm build`.
//
// Checks:
// 1. dist/ contains no JavaScript files.
// 2. No file the browser would parse as markup (.html, .htm, .xhtml, .svg, ...)
//    contains <script> (JSON-LD excepted), inline event handlers, script URLs
//    or an srcdoc that does.
// 3. dist/ contains no files that must never be published, and each .gz
//    (the pre-compressed top pages) inflates to the file next to it.
// 4. Every link to this site points to a file in dist/ (or to an archived
//    festival site on the server). Links that need the network are checked by
//    `pnpm check:links`; the page-weight budgets by the e2e tests, in a browser.
//
// Usage: node scripts/guard-dist.mjs [distDir]

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { precompressedProblem } from "./lib/precompress.mjs";
import { checkDistLinks } from "./lib/site.mjs";
import {
  MARKUP_EXTENSIONS,
  findClientCodeInHtml,
  forbiddenFileReason,
  listFiles,
  readText,
  report,
} from "./lib/rules.mjs";

const dist = process.argv[2] ?? join(process.cwd(), "dist");
const files = await listFiles(dist);

if (files.length === 0) {
  console.error(`FAIL ${dist} is empty or missing. Run \`astro build\` first.`);
  process.exit(1);
}

report(
  "dist/ contains no JavaScript files",
  files.filter((file) => /\.(m?js|cjs)$/.test(file)).map((file) => `dist/${file}`),
);

/** @type {string[]} */
const clientCode = [];
for (const file of files.filter((name) => MARKUP_EXTENSIONS.test(name))) {
  for (const finding of findClientCodeInHtml(await readText(join(dist, file)))) {
    clientCode.push(`dist/${file}: ${finding}`);
  }
}
report("dist/ markup (HTML, SVG, XML) runs no JavaScript", clientCode);

/** @type {string[]} */
const forbiddenFiles = [];
for (const file of files) {
  const reason = forbiddenFileReason(file);
  if (reason) forbiddenFiles.push(`dist/${file}: ${reason}`);
}
report("dist/ contains no dumps, backups, logs or server-side code", forbiddenFiles);

/** @type {string[]} */
const badPrecompressed = [];
for (const file of files.filter((name) => name.endsWith(".gz"))) {
  const original = files.includes(file.slice(0, -".gz".length))
    ? await readFile(join(dist, file.slice(0, -".gz".length)))
    : undefined;
  const problem = precompressedProblem(await readFile(join(dist, file)), original);
  if (problem) badPrecompressed.push(`dist/${file}: ${problem}`);
}
report("each .gz in dist/ inflates to the file next to it", badPrecompressed);

const links = await checkDistLinks(dist, files);
report("links to this site point to files in dist/ or to archived sites", links.broken);
console.log(
  `     ${links.server.length} links to archived sites and ${links.external.length} to other hosts: run \`pnpm check:links\` to check them online`,
);
