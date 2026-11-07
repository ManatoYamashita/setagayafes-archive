// Page-weight budgets (docs/rules/conventions.md, "性能の予算"), measured in
// a real browser against the built dist/. Run with `pnpm test:e2e` after
// `pnpm build`.
//
// Bytes are the uncompressed response bodies: the production host does not
// compress, and the test server does not either.
//
// - initial: what the first view needs. Everything that is not an image (the
//   HTML with its inlined CSS, the favicon), plus the images of the <img>
//   elements that are inside the first viewport. Images the browser fetches
//   ahead for lazy <img> below the fold are left out: how far ahead it reads
//   depends on the browser and the network, and they do not delay the first
//   view (owner's decision, 2026-11-07).
// - total: everything the page loads when scrolled to the bottom as it opens,
//   without touching the era filter (owner's decision, 2026-11-07).
//   Switching filters makes some cards wider, and the browser fetches larger
//   images for them; that amount is printed for reference, not budgeted.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";

/** Budgets in bytes (1 KB = 1,000 bytes). */
const BUDGET = { initial: 200_000, total: 1_000_000 };

/**
 * Screens to measure: the smallest phone, common phones and tablets, the
 * Lighthouse presets, and high-density desktops that pick the largest images.
 */
const VIEWPORTS = [
  { name: "phone 320", width: 320, height: 640, deviceScaleFactor: 2 },
  { name: "phone 390 @3x", width: 390, height: 844, deviceScaleFactor: 3 },
  { name: "Lighthouse mobile", width: 412, height: 823, deviceScaleFactor: 1.75 },
  { name: "tablet 768", width: 768, height: 1024, deviceScaleFactor: 2 },
  { name: "tablet 1023", width: 1023, height: 900, deviceScaleFactor: 2 },
  { name: "Lighthouse desktop", width: 1350, height: 940, deviceScaleFactor: 1 },
  { name: "desktop 1440 @2x", width: 1440, height: 900, deviceScaleFactor: 2 },
  { name: "desktop 1920 @2x", width: 1920, height: 1080, deviceScaleFactor: 2 },
];

const PAGES = ["/", "/en/"];

/** @type {Awaited<ReturnType<typeof serve>>} */
let server;
/** @type {import("playwright").Browser} */
let browser;

before(async () => {
  server = await serve("dist");
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

/**
 * Loads a page and measures it.
 *
 * @param {string} path
 * @param {(typeof VIEWPORTS)[number]} viewport
 */
async function measure(path, { width, height, deviceScaleFactor }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  const page = await context.newPage();

  /** @type {Map<string, Promise<number>>} */
  const bodies = new Map();
  page.on("response", (response) => {
    if (!bodies.has(response.url())) {
      bodies.set(
        response.url(),
        response.body().then(
          (body) => body.length,
          () => 0,
        ),
      );
    }
  });
  const sizes = async () =>
    new Map(await Promise.all([...bodies].map(async ([url, size]) => [url, await size])));

  await page.goto(`${server.url}${path}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  // Images whose <img> is entirely outside the first viewport. An image used
  // by both a visible and a hidden <img> counts as visible.
  const belowTheFold = await page.evaluate(async () => {
    const images = [...document.images];
    const visible = images.filter((image) => {
      const box = image.getBoundingClientRect();
      return box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
    });
    // Make sure the visible ones have finished loading before counting.
    await Promise.all(visible.map((image) => image.decode().catch(() => undefined)));
    const shown = new Set(visible.map((image) => image.currentSrc));
    return images.map((image) => image.currentSrc).filter((src) => src !== "" && !shown.has(src));
  });
  await page.waitForLoadState("networkidle");
  const below = new Set(belowTheFold);
  let initial = 0;
  for (const [url, size] of await sizes()) if (!below.has(url)) initial += size;

  const scrollToBottom = async () => {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= scrollHeight; y += Math.round(height / 2)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(30);
    }
    await page.waitForLoadState("networkidle");
  };
  const sum = async () => {
    const all = await sizes();
    return { bytes: [...all.values()].reduce((a, b) => a + b, 0), requests: all.size };
  };

  await scrollToBottom();
  const total = await sum();

  // For reference: every filter, scrolled to the bottom.
  for (const era of ["musashi", "tcu", "all"]) {
    await page.locator(`label:has(#era-${era})`).click();
    await scrollToBottom();
  }
  const withFilters = await sum();

  await context.close();
  return { initial, total, withFilters };
}

for (const path of PAGES) {
  describe(`budget: ${path}`, () => {
    for (const viewport of VIEWPORTS) {
      const label = `${viewport.name} (${viewport.width}x${viewport.height} @${viewport.deviceScaleFactor}x)`;
      test(`${label}: initial <= ${kb(BUDGET.initial)}, total <= ${kb(BUDGET.total)}`, async (context) => {
        const { initial, total: page, withFilters } = await measure(path, viewport);
        const total = page.bytes;
        context.diagnostic(
          `initial ${kb(initial)}, total ${kb(total)} in ${page.requests} requests` +
            ` (with every filter: ${kb(withFilters.bytes)} in ${withFilters.requests})`,
        );
        assert.ok(
          initial <= BUDGET.initial,
          `initial ${kb(initial)} exceeds ${kb(BUDGET.initial)}`,
        );
        assert.ok(total <= BUDGET.total, `total ${kb(total)} exceeds ${kb(BUDGET.total)}`);
      });
    }
  });
}
