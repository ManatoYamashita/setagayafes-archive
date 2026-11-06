// Before/after screenshots for replacing a live site with a static copy
// (docs/ops/wp-to-static.md). Run by hand from a laptop, not in CI.
//
//   node scripts/ops/compare-pages.mjs shoot <out-dir> <url>...
//       Full-page screenshot of each URL (00.png, 01.png, ...) plus report.json
//       with the HTTP status and every failed sub-request (status >= 400).
//   node scripts/ops/compare-pages.mjs compare <before-dir> <after-dir>
//       Share of differing pixels for each same-named PNG.
//   node scripts/ops/compare-pages.mjs diff <before.png> <after.png> <out.png>
//       Side-by-side image: before | after | changed pixels in red (50% scale).
//
// Screenshots wait until every <img> has finished loading. Without that wait a
// heavy page is captured half-loaded and shows differences that are not there.

/* global document, Image, ImageData, OffscreenCanvas, btoa */

import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { chromium } from "playwright";

const VIEWPORT = { width: 1280, height: 900 };
// A pixel counts as changed when the summed RGB difference exceeds this.
const PIXEL_THRESHOLD = 30;
// The side-by-side image is cut at this height (before scaling) to stay readable.
const DIFF_MAX_HEIGHT = 4000;

async function shoot(outDir, urls) {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  const report = [];
  for (const [i, url] of urls.entries()) {
    const failed = [];
    const onResponse = (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    };
    page.on("response", onResponse);
    let status;
    try {
      const response = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
      status = response ? response.status() : "none";
      await page
        .waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, {
          timeout: 20_000,
        })
        .catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      await page.screenshot({
        path: join(outDir, `${String(i).padStart(2, "0")}.png`),
        fullPage: true,
      });
    } catch (error) {
      status = `ERR ${String(error.message).split("\n")[0]}`;
    }
    page.off("response", onResponse);
    report.push({ i, url, status, failed });
    console.log(i, status, failed.length, url);
  }
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

// Runs inside the browser: decodes two PNGs and compares them pixel by pixel.
async function comparePixels([a, b, threshold, maxHeight, withImage]) {
  const load = (base64) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = `data:image/png;base64,${base64}`;
    });
  const [imgA, imgB] = await Promise.all([load(a), load(b)]);
  const width = Math.min(imgA.width, imgB.width);
  const height = Math.min(imgA.height, imgB.height, withImage ? maxHeight : Infinity);
  const pixels = (img) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);
    return context.getImageData(0, 0, width, height);
  };
  const pa = pixels(imgA);
  const pb = pixels(imgB);
  const marked = new ImageData(width, height);
  let changed = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    const delta =
      Math.abs(pa.data[i] - pb.data[i]) +
      Math.abs(pa.data[i + 1] - pb.data[i + 1]) +
      Math.abs(pa.data[i + 2] - pb.data[i + 2]);
    const hit = delta > threshold;
    if (hit) changed++;
    marked.data[i] = hit ? 255 : pa.data[i] * 0.3 + 178;
    marked.data[i + 1] = hit ? 0 : pa.data[i + 1] * 0.3 + 178;
    marked.data[i + 2] = hit ? 0 : pa.data[i + 2] * 0.3 + 178;
    marked.data[i + 3] = 255;
  }
  const result = {
    sizeA: `${imgA.width}x${imgA.height}`,
    sizeB: `${imgB.width}x${imgB.height}`,
    percent: ((100 * changed) / (width * height)).toFixed(3),
  };
  if (!withImage) return result;
  const toCanvas = (data) => {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d").putImageData(data, 0, 0);
    return canvas;
  };
  const out = new OffscreenCanvas((width * 3) / 2, height / 2);
  const context = out.getContext("2d");
  context.scale(0.5, 0.5);
  context.drawImage(toCanvas(pa), 0, 0);
  context.drawImage(toCanvas(pb), width, 0);
  context.drawImage(toCanvas(marked), 2 * width, 0);
  const bytes = new Uint8Array(await (await out.convertToBlob()).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return { ...result, png: btoa(binary) };
}

async function withPage(run) {
  const browser = await chromium.launch();
  try {
    return await run(await browser.newPage());
  } finally {
    await browser.close();
  }
}

async function compare(beforeDir, afterDir) {
  const names = (await readdir(beforeDir)).filter((name) => name.endsWith(".png")).sort();
  await withPage(async (page) => {
    for (const name of names) {
      const afterPath = join(afterDir, name);
      const exists = await access(afterPath).then(
        () => true,
        () => false,
      );
      if (!exists) {
        console.log(name, "missing after");
        continue;
      }
      const [a, b] = await Promise.all([readFile(join(beforeDir, name)), readFile(afterPath)]);
      const r = await page.evaluate(comparePixels, [
        a.toString("base64"),
        b.toString("base64"),
        PIXEL_THRESHOLD,
        DIFF_MAX_HEIGHT,
        false,
      ]);
      console.log(name, r.sizeA, r.sizeB, `${r.percent}%`);
    }
  });
}

async function diff(beforePng, afterPng, outPng) {
  const [a, b] = await Promise.all([readFile(beforePng), readFile(afterPng)]);
  const r = await withPage((page) =>
    page.evaluate(comparePixels, [
      a.toString("base64"),
      b.toString("base64"),
      PIXEL_THRESHOLD,
      DIFF_MAX_HEIGHT,
      true,
    ]),
  );
  await writeFile(outPng, Buffer.from(r.png, "base64"));
  console.log(`${r.percent}% changed, written to ${outPng}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "shoot" && args.length >= 2) await shoot(args[0], args.slice(1));
else if (command === "compare" && args.length === 2) await compare(args[0], args[1]);
else if (command === "diff" && args.length === 3) await diff(args[0], args[1], args[2]);
else {
  console.error(
    "usage: compare-pages.mjs shoot <out-dir> <url>... | compare <before> <after> | diff <before.png> <after.png> <out.png>",
  );
  process.exit(2);
}
