// Puts a picture handed over by hand in place of a festival's capture:
//
//   pnpm capture:import 97 ~/Downloads/setagayafes-97.png
//
// The festival must be marked `supplied` in OVERRIDES (scripts/lib/capture-targets.mjs),
// so that `pnpm capture` never overwrites the picture with a screenshot.
// The picture must be a 16:10 PNG, the shape of every thumbnail box. Its
// metadata is removed and its image data deflated again (scripts/lib/png.mjs);
// the pixels stay the same. The AVIF thumbnails are made from it at build time.

import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureTarget } from "./lib/capture-targets.mjs";
import { optimizePng, pngSize } from "./lib/png.mjs";

const [roundArg, source] = process.argv.slice(2);
if (!roundArg || !source) {
  console.error("usage: pnpm capture:import <round> <file.png>");
  process.exit(1);
}

try {
  const target = captureTarget(Number(roundArg));
  if (target.kind !== "supplied") {
    throw new Error(
      `festival ${target.number} is not marked \`supplied\` in OVERRIDES ` +
        "(scripts/lib/capture-targets.mjs); `pnpm capture` would overwrite the picture",
    );
  }
  const input = new Uint8Array(await readFile(source));
  const { width, height } = pngSize(input);
  if (width * 10 !== height * 16) {
    throw new Error(`${source} is ${width}x${height}; the thumbnail box is 16:10`);
  }
  const output = optimizePng(input);
  const path = join(process.cwd(), target.dir, target.file);
  const temporary = `${path}.partial`;
  await writeFile(temporary, output);
  await rename(temporary, path);
  const kb = (/** @type {number} */ bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  console.log(
    `ok   ${target.slug} ${width}x${height}: ${kb(input.length)} -> ${kb(output.length)} ` +
      `-> ${target.dir}/${target.file}`,
  );
} catch (error) {
  console.error(`FAIL ${/** @type {Error} */ (error).message}`);
  process.exit(1);
}
