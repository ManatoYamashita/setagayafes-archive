// Writes dist/.htaccess after `astro build` (see scripts/lib/htaccess.mjs).
// It needs the built files: which paths are published, and the hashes of the
// inline styles of every HTML page for the Content-Security-Policy.
//
// Usage: node scripts/build-htaccess.mjs [distDir]

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildHtaccess, styleHashesOf } from "./lib/htaccess.mjs";
import { listFiles, readText } from "./lib/rules.mjs";

const dist = process.argv[2] ?? join(process.cwd(), "dist");
const files = (await listFiles(dist)).filter((file) => file !== ".htaccess");

if (files.length === 0) {
  console.error(`FAIL ${dist} is empty or missing. Run \`astro build\` first.`);
  process.exit(1);
}

/** @type {string[]} */
const styleHashes = [];
for (const file of files.filter((name) => name.endsWith(".html"))) {
  styleHashes.push(...styleHashesOf(await readText(join(dist, file))));
}

await writeFile(join(dist, ".htaccess"), buildHtaccess({ files, styleHashes }));
console.log(`ok   dist/.htaccess (${new Set(styleHashes).size} inline style hashes)`);
