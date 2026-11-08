// Source-level guard. Run with `pnpm guard` (CI runs it on every pull request).
//
// Checks:
// 1. src/ has no Astro hydration directives (client:*) and no <script> tags.
// 2. public/ has no files that must never be published (dumps, backups, logs, ...).
// 3. package.json has no UI runtime (React, Vue, Svelte, ...).
// 4. No text file in the repository names an SSH destination on the server
//    (the repository is public).
//
// Usage: node scripts/guard-source.mjs [projectRoot]

import { join } from "node:path";
import {
  findClientCodeInSource,
  findServerDestinations,
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

/** Folders that are generated, installed or ignored: not part of the repository's text. */
const SKIPPED = /^(node_modules|dist|\.astro|\.git|release|reference)\//;
const TEXT_EXTENSIONS = /\.(md|mdx|astro|html|css|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|sh|txt)$/;

/** @type {string[]} */
const destinations = [];
for (const file of await listFiles(root)) {
  if (SKIPPED.test(file) || !TEXT_EXTENSIONS.test(file)) continue;
  for (const destination of findServerDestinations(await readText(join(root, file)))) {
    destinations.push(`${file}: ${destination} (use the Host alias "setagayafes-archive")`);
  }
}
report("the repository names no SSH destination on the server", destinations);
