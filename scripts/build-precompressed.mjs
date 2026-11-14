// Writes index.html.gz next to every index.html in dist/, after `astro build`
// (see scripts/lib/precompress.mjs). Run before build-htaccess.mjs, which
// lists the published files.
//
// Usage: node scripts/build-precompressed.mjs [distDir]

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PRECOMPRESSED, gzip } from "./lib/precompress.mjs";
import { listFiles } from "./lib/rules.mjs";

const dist = process.argv[2] ?? join(process.cwd(), "dist");
const pages = (await listFiles(dist)).filter((file) => PRECOMPRESSED.test(file));

if (pages.length === 0) {
  console.error(`FAIL ${dist} has no index.html. Run \`astro build\` first.`);
  process.exit(1);
}

for (const page of pages) {
  const original = await readFile(join(dist, page));
  const compressed = gzip(original);
  await writeFile(join(dist, `${page}.gz`), compressed);
  console.log(
    `ok   dist/${page}.gz (${original.length.toLocaleString("en")} → ${compressed.length.toLocaleString("en")} bytes)`,
  );
}
