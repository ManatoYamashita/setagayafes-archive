// Build-output guard. Runs automatically at the end of `pnpm build`.
//
// Checks:
// 1. dist/ contains no JavaScript files.
// 2. No file the browser would parse as markup (.html, .htm, .xhtml, .svg, ...)
//    contains <script> (JSON-LD excepted), inline event handlers, script URLs
//    or an srcdoc that does.
// 3. dist/ contains no files that must never be published.
//
// Size budgets and link checks are added later (Issue #1, "post-build checks").
//
// Usage: node scripts/guard-dist.mjs [distDir]

import { join } from "node:path";
import {
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

/**
 * Extensions a browser parses as HTML, XML or SVG, where a script can run.
 * Checked by content rather than rejected, so that any of them can be published
 * once it is script-free.
 */
const MARKUP_EXTENSIONS = /\.(html?|xht(ml)?|shtml?|svg|xml|xslt?)$/i;

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
