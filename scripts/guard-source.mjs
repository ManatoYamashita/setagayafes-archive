// Source-level guard. Run with `pnpm guard` (CI runs it on every pull request).
//
// Checks:
// 1. src/ has no Astro hydration directives (client:*) and no <script> tags.
// 2. public/ has no files that must never be published (dumps, backups, logs, ...).
// 3. package.json has no UI runtime (React, Vue, Svelte, ...).
//
// Usage: node scripts/guard-source.mjs [projectRoot]

import { join } from "node:path";
import {
  findClientCodeInSource,
  findUiRuntimePackages,
  forbiddenFileReason,
  listFiles,
  readText,
  report,
} from "./lib/rules.mjs";

const root = process.argv[2] ?? process.cwd();
const SOURCE_EXTENSIONS = /\.(astro|html|md|mdx|ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/;

/** @type {string[]} */
const clientCode = [];
for (const file of await listFiles(join(root, "src"))) {
  if (!SOURCE_EXTENSIONS.test(file)) continue;
  const source = await readText(join(root, "src", file));
  for (const finding of findClientCodeInSource(source)) {
    clientCode.push(`src/${file}: ${finding}`);
  }
}
report("src/ ships no client-side JavaScript (no client:*, no <script>)", clientCode);

/** @type {string[]} */
const forbiddenFiles = [];
for (const file of await listFiles(join(root, "public"))) {
  const reason = forbiddenFileReason(file);
  if (reason) forbiddenFiles.push(`public/${file}: ${reason}`);
}
report("public/ contains no dumps, backups, logs or server-side code", forbiddenFiles);

const packageJson = JSON.parse(await readText(join(root, "package.json")));
report(
  "package.json has no UI runtime",
  findUiRuntimePackages(packageJson).map((name) => `${name}: UI runtime is not allowed`),
);
