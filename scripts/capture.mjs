// Captures the top page of every festival in src/data/festivals.ts, as the
// original images for the thumbnails. Run by hand once a year (not in CI):
//
//   pnpm capture            # every festival
//   pnpm capture 98         # only the 98th (add it to src/data/festivals.ts first)
//   pnpm capture 94 97th    # several
//
// The first run needs the browser: `pnpm exec playwright install chromium-headless-shell`.
//
// The originals go to src/assets/captures/ and are committed. The AVIF
// thumbnails and the OGP JPEG are made from them at build time
// (src/lib/captures.ts), so this script never writes to public/ or dist/.
//
// The 87th has no surviving site, so its photo is downloaded instead and its
// metadata (EXIF and the like) is removed. In a full run the photo is fetched
// only when it is missing; name the festival to fetch it again.

import { mkdir, rename, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  CAPTURE_CONDITIONS,
  CAPTURE_DIR,
  captureTarget,
  parseFestivalArgs,
} from "./lib/capture-targets.mjs";
import { stripJpegMetadata } from "./lib/jpeg.mjs";

const NAVIGATION_TIMEOUT_MS = 60_000;
const NETWORK_IDLE_TIMEOUT_MS = 15_000;

const root = process.cwd();
const outDir = join(root, CAPTURE_DIR);
const args = process.argv.slice(2);
const explicit = args.length > 0;
/** @type {import("./lib/capture-targets.mjs").CaptureTarget[]} */
let targets;
try {
  targets = parseFestivalArgs(args).map(captureTarget);
} catch (error) {
  console.error(/** @type {Error} */ (error).message);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

/**
 * Writes through a temporary file so that a failed run never leaves a broken
 * original behind.
 *
 * @param {string} file
 * @param {Uint8Array} data
 */
async function writeAtomically(file, data) {
  const path = join(outDir, file);
  const temporary = `${path}.partial`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

/** @param {string} file */
async function exists(file) {
  try {
    await access(join(outDir, file));
    return true;
  } catch {
    return false;
  }
}

/** @param {import("./lib/capture-targets.mjs").PhotoTarget} target */
async function fetchPhoto(target) {
  const response = await fetch(target.url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${target.url}`);
  const stripped = stripJpegMetadata(new Uint8Array(await response.arrayBuffer()));
  await writeAtomically(target.file, stripped);
}

/**
 * @param {import("playwright").Browser} browser
 * @param {import("./lib/capture-targets.mjs").SiteTarget} target
 */
async function captureSite(browser, target) {
  const context = await browser.newContext({ ...CAPTURE_CONDITIONS });
  try {
    const page = await context.newPage();
    const response = await page.goto(target.url, {
      waitUntil: "load",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() ?? "(no response)"} for ${target.url}`);
    }
    // Some old sites keep polling; a missing network idle is not an error.
    await page
      .waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS })
      .catch(() => {});
    // eslint-disable-next-line no-undef -- runs in the page, where document exists.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(target.settleMs);
    const png = await page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      scale: "device",
    });
    await writeAtomically(target.file, png);
  } finally {
    await context.close();
  }
}

/** @type {string[]} */
const failures = [];
const browser = await chromium.launch();
try {
  // One at a time, to be gentle with the shared host.
  for (const target of targets) {
    const label = `${target.slug.padEnd(5)} ${target.url}`;
    try {
      if (target.kind === "photo") {
        if (!explicit && (await exists(target.file))) {
          console.log(`skip ${label} (photo already saved; name it to fetch again)`);
          continue;
        }
        await fetchPhoto(target);
      } else {
        await captureSite(browser, target);
      }
      console.log(`ok   ${label} -> ${CAPTURE_DIR}/${target.file}`);
    } catch (error) {
      failures.push(target.slug);
      console.error(`FAIL ${label}: ${/** @type {Error} */ (error).message}`);
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  process.exitCode = 1;
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
}
