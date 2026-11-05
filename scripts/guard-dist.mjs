// Build-output guard. Runs automatically at the end of `pnpm build`.
//
// Checks:
// 1. dist/ contains no JavaScript files.
// 2. No HTML file in dist/ contains <script> (JSON-LD excepted), inline event
//    handlers or javascript: URLs.
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

/** @type {string[]} */
const clientCode = [];
for (const file of files.filter((name) => name.endsWith(".html"))) {
  for (const finding of findClientCodeInHtml(await readText(join(dist, file)))) {
    clientCode.push(`dist/${file}: ${finding}`);
  }
}
report("dist/ HTML runs no JavaScript", clientCode);

/** @type {string[]} */
const forbiddenFiles = [];
for (const file of files) {
  const reason = forbiddenFileReason(file);
  if (reason) forbiddenFiles.push(`dist/${file}: ${reason}`);
}
report("dist/ contains no dumps, backups, logs or server-side code", forbiddenFiles);
