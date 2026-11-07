// End-to-end tests of the archive top page, run against the built dist/ in a
// real browser (Chromium through Playwright). Run with `pnpm test:e2e` after
// `pnpm build`.
//
// Expectations are derived from the festival data, so adding next year's
// festival does not require editing these tests.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import {
  ERA_NAMES,
  FESTIVALS,
  eraOf,
  latestFestival,
  ordinalOf,
  linkOf,
  titleOf,
} from "../src/data/festivals.ts";
import { RELATED_SITES } from "../src/data/related-sites.ts";
import { serve } from "./lib/server.mjs";

const latest = latestFestival();
const listed = FESTIVALS.filter((festival) => festival.round !== latest.round).toSorted(
  (a, b) => b.round - a.round,
);
const countOf = (/** @type {string} */ era) =>
  listed.filter((festival) => eraOf(festival.round) === era).length;

/** Whether `pnpm capture` has produced a screenshot for the festival. */
const captured = (/** @type {number} */ round) =>
  ["png", "jpg"].some((ext) => existsSync(`src/assets/captures/${ordinalOf(round)}.${ext}`));

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

/**
 * Opens the top page in a fresh context and collects console errors and
 * failed requests while it loads.
 *
 * @param {{ width?: number, height?: number, deviceScaleFactor?: number }} [viewport]
 */
async function open({ width = 1280, height = 900, deviceScaleFactor = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  const page = await context.newPage();
  /** @type {string[]} */
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${server.url}/`, { waitUntil: "load" });
  return { page, problems, close: () => context.close() };
}

/** @param {import("playwright").Page} page */
const visibleCards = (page) => page.locator(".grid > li:visible");

describe("page", () => {
  test("loads with no script, no console error and no failed request", async () => {
    const { page, problems, close } = await open();
    assert.equal(await page.locator("script").count(), 0);
    // Let lazy images load too: scroll to the bottom.
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(problems, []);
    await close();
  });

  test("has one h1 and landmarks in order", async () => {
    const { page, close } = await open();
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("h1").innerText(), "世田谷祭アーカイブ");
    assert.equal(await page.locator("header").count(), 1);
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.locator("footer").count(), 1);
    await close();
  });
});

describe("header menu", () => {
  test("opens with MENU, closes with Escape and returns focus", async () => {
    const { page, close } = await open();
    const button = page.getByRole("button", { name: "MENU" });
    const menu = page.locator("#site-menu");

    assert.equal(await menu.isVisible(), false);
    await button.click();
    await menu.waitFor({ state: "visible" });
    const links = menu.getByRole("link");
    assert.deepEqual(await links.allInnerTexts(), ["公式サイト", "公式ブログ", "X", "Instagram"]);

    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert.equal(
      await button.evaluate((element) => element === document.activeElement),
      true,
      "focus returns to the MENU button",
    );
    await close();
  });

  test("closes with its close button", async () => {
    const { page, close } = await open();
    await page.getByRole("button", { name: "MENU" }).click();
    const menu = page.locator("#site-menu");
    await menu.waitFor({ state: "visible" });
    await menu.getByRole("button", { name: "閉じる" }).click();
    await menu.waitFor({ state: "hidden" });
    await close();
  });

  test("keeps the close button reachable in a short viewport", async (t) => {
    const height = 256;
    const { page, close } = await open({ width: 320, height });
    t.after(close);

    await page.getByRole("button", { name: "MENU" }).click();
    const menu = page.locator("#site-menu");
    const panel = await menu.boundingBox();
    assert.ok(panel);
    assert.ok(panel.y + panel.height <= height, "the menu fits within the viewport");

    const linkCount = await menu.getByRole("link").count();
    for (let i = 0; i <= linkCount; i++) await page.keyboard.press("Tab");

    const closeButton = menu.getByRole("button", { name: "閉じる" });
    assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true);
    const button = await closeButton.boundingBox();
    assert.ok(button);
    assert.ok(
      button.y + button.height <= panel.y + panel.height,
      "Tab scrolls the button into view",
    );
    await page.keyboard.press("Enter");
    await menu.waitFor({ state: "hidden" });
  });

  test("can be operated from the keyboard", async () => {
    const { page, close } = await open();
    // Tab: site name link, then MENU.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.locator("#site-menu").waitFor({ state: "visible" });
    await close();
  });
});

describe("hero", () => {
  test("shows the latest festival and links to its site", async () => {
    const { page, close } = await open();
    const hero = page.locator("section", { has: page.locator("#hero-title") });
    assert.equal(await hero.locator("h2").innerText(), titleOf(latest, "ja"));
    assert.match(await hero.locator(".meta").innerText(), new RegExp(`第${latest.round}回`));
    const cta = hero.getByRole("link", { name: `第${latest.round}回のサイトを見る` });
    assert.equal(await cta.getAttribute("href"), linkOf(latest));
    await close();
  });

  test("loads its picture eagerly with high priority when there is one", async () => {
    const { page, close } = await open();
    const image = page.locator("section:has(#hero-title) img");
    if ((await image.count()) > 0) {
      assert.equal(await image.getAttribute("loading"), "eager");
      assert.equal(await image.getAttribute("fetchpriority"), "high");
    }
    // Card pictures never compete with it.
    for (const card of await page.locator(".grid img").all()) {
      assert.equal(await card.getAttribute("loading"), "lazy");
    }
    await close();
  });
});

describe("archive grid", () => {
  test("lists every other festival, newest first, linked to its site", async () => {
    const { page, close } = await open();
    const cards = page.locator(".grid > li");
    assert.equal(await cards.count(), listed.length);
    for (const [index, festival] of listed.entries()) {
      const link = cards.nth(index).getByRole("heading").getByRole("link");
      assert.equal(await link.getAttribute("href"), linkOf(festival), `round ${festival.round}`);
      assert.match(await link.innerText(), new RegExp(escape(titleOf(festival, "ja"))));
    }
    await close();
  });

  test("names the round in each link for screen readers", async () => {
    const { page, close } = await open();
    const first = listed[0];
    assert.ok(first);
    const link = page.getByRole("link", { name: `第${first.round}回 ${titleOf(first, "ja")}` });
    assert.equal(await link.count(), 1);
    await close();
  });

  test("marks external links, estimated dates and statuses", async () => {
    const { page, close } = await open();
    for (const festival of listed) {
      const card = page.locator(".grid > li", {
        has: page.locator(`a[href="${linkOf(festival)}"]`),
      });
      const text = await card.innerText();
      if (festival.externalLink)
        assert.match(text, new RegExp(escape(festival.externalLink.label.ja)));
      if ("estimated" in festival.dates) assert.match(text, /（推定）/);
      if (festival.status === "cancelled") assert.match(text, /中止/);
    }
    await close();
  });

  test("shows the screenshot as AVIF, or the round number before capturing", async () => {
    const { page, close } = await open();
    const cards = page.locator(".grid > li");
    for (const [index, festival] of listed.entries()) {
      const card = cards.nth(index);
      const image = card.locator("img");
      if (captured(festival.round)) {
        assert.equal(await image.count(), 1, `round ${festival.round} has its screenshot`);
        assert.match((await image.getAttribute("src")) ?? "", /\.avif$/);
        assert.equal(await image.getAttribute("alt"), "", "decorative: the heading names the card");
      } else {
        assert.equal(await image.count(), 0);
        assert.equal(await card.locator(".plate").innerText(), String(festival.round));
      }
    }
    await close();
  });

  test("lets lazy pictures pick their size from the laid-out width", async () => {
    const { page, close } = await open();
    const cardSizes = await page
      .locator(".grid img")
      .evaluateAll((images) => images.map((image) => image.getAttribute("sizes") ?? ""));
    for (const sizes of cardSizes) assert.match(sizes, /^auto, \(width >= 64rem\)/);
    const heroSizes = await page.locator("main img").first().getAttribute("sizes");
    assert.doesNotMatch(heroSizes ?? "", /^auto/, "an eager picture cannot use auto");
    await close();
  });

  for (const { width, autoSizes } of [
    { width: 1023, autoSizes: true },
    { width: 1280, autoSizes: true },
    { width: 1023, autoSizes: false },
    { width: 1280, autoSizes: false },
  ]) {
    test(`loads enough image resolution at ${width}px and DPR 2 (auto sizes: ${autoSizes})`, async (t) => {
      const first = listed.find((festival) => eraOf(festival.round) === "musashi");
      if (!first || !captured(first.round)) {
        t.skip("no captured musashi festival");
        return;
      }
      const { page, close } = await open({ width, deviceScaleFactor: 2 });
      t.after(close);

      const selector = '.grid > li[data-era="musashi"] img';
      const image = page.locator(selector).first();
      if (!autoSizes) {
        await image.evaluate((element) => {
          const image = /** @type {HTMLImageElement} */ (element);
          image.sizes = image.sizes.replace(/^auto,\s*/, "");
        });
      }
      await image.scrollIntoViewIfNeeded();
      const beforeSrc = await image.evaluate(async (element) => {
        const image = /** @type {HTMLImageElement} */ (element);
        await image.decode();
        return image.currentSrc;
      });
      const before = await image.boundingBox();
      assert.ok(before);

      await page.locator("label:has(#era-musashi)").click();
      const after = await image.boundingBox();
      assert.ok(after && after.width > before.width);

      await page.waitForFunction(
        ({ selector, beforeSrc, autoSizes, requiredWidth }) => {
          const image = /** @type {HTMLImageElement | null} */ (document.querySelector(selector));
          if (!image?.complete || !image.naturalWidth) return false;
          if (autoSizes && image.currentSrc === beforeSrc) return false;
          // naturalWidth accounts for density, so compare the selected width descriptor.
          return image.srcset.split(",").some((candidate) => {
            const [url, width] = candidate.trim().split(/\s+/);
            return image.currentSrc.endsWith(url) && Number.parseInt(width, 10) >= requiredWidth;
          });
        },
        { selector, beforeSrc, autoSizes, requiredWidth: Math.ceil(after.width * 2) },
        { timeout: 3000 },
      );
    });
  }

  test("makes the whole card clickable", async () => {
    const { page, close } = await open();
    const card = page.locator(".grid > li").first();
    const box = await card.boundingBox();
    assert.ok(box);
    // Click the picture area, not the heading.
    await page.mouse.click(box.x + box.width / 2, box.y + 20);
    await page.waitForURL(`${server.url}${linkOf(/** @type {any} */ (listed[0]))}`);
    await close();
  });
});

describe("era filter", () => {
  test("shows all festivals by default", async () => {
    const { page, close } = await open();
    assert.equal(await page.locator("#era-all").isChecked(), true);
    assert.equal(await visibleCards(page).count(), listed.length);
    assert.equal(
      await page.locator(".result-text:visible").innerText(),
      `${listed.length}件を表示中`,
    );
    await close();
  });

  for (const era of /** @type {const} */ (["musashi", "tcu"])) {
    test(`narrows the grid to ${era}`, async () => {
      const { page, close } = await open();
      await page.locator("label", { hasText: ERA_NAMES[era].ja }).click();
      assert.equal(await page.locator(`#era-${era}`).isChecked(), true);
      const cards = visibleCards(page);
      assert.equal(await cards.count(), countOf(era));
      const eras = await cards.evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-era")),
      );
      assert.deepEqual(new Set(eras), new Set([era]));
      assert.equal(
        await page.locator(".result-text:visible").innerText(),
        `${countOf(era)}件を表示中`,
      );
      await close();
    });
  }

  test("is a radio group operable with arrow keys", async () => {
    const { page, close } = await open();
    await page.locator("#era-all").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#era-musashi").isChecked(), true);
    assert.equal(await visibleCards(page).count(), countOf("musashi"));
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#era-tcu").isChecked(), true);
    assert.equal(await visibleCards(page).count(), countOf("tcu"));
    await close();
  });

  test("labels the group", async () => {
    const { page, close } = await open();
    const group = page.getByRole("group", { name: "時代で絞り込む" });
    assert.equal(await group.getByRole("radio").count(), 3);
    await close();
  });
});

describe("layout", () => {
  test("features the first card of the pattern on wide screens, also after filtering", async () => {
    const { page, close } = await open({ width: 1280 });
    const widthOf = async (/** @type {number} */ n) =>
      (await visibleCards(page).nth(n).boundingBox())?.width ?? 0;

    assert.ok((await widthOf(0)) > (await widthOf(1)) * 1.8, "first card spans two columns");

    await page.locator("label:has(#era-musashi)").click();
    assert.ok((await widthOf(0)) > (await widthOf(1)) * 1.8, "pattern restarts after filtering");
    await close();
  });

  for (const era of /** @type {const} */ (["all", "musashi", "tcu"])) {
    test(`keeps the tab order in the reading order with three columns (${era})`, async (t) => {
      const { page, close } = await open({ width: 1280 });
      t.after(close);
      await page.locator(`label:has(#era-${era})`).click();
      const boxes = await visibleCards(page).evaluateAll((items) =>
        items.map((item) => {
          const { x, y } = item.getBoundingClientRect();
          return { x: Math.round(x), y: Math.round(y) };
        }),
      );
      const reading = boxes
        .map((box, index) => ({ ...box, index }))
        .toSorted((a, b) => a.y - b.y || a.x - b.x)
        .map((box) => box.index);
      assert.deepEqual(reading, [...boxes.keys()], "source order is left to right, top to bottom");
      const cards = visibleCards(page);
      await cards.first().getByRole("link").focus();
      for (const index of reading) {
        const link = cards.nth(index).getByRole("link");
        assert.equal(
          await link.evaluate((element) => element === document.activeElement),
          true,
          `Tab reaches card ${index + 1} in visual reading order`,
        );
        await page.keyboard.press("Tab");
      }
    });
  }

  test("uses one column on phones", async () => {
    const { page, close } = await open({ width: 375, height: 800 });
    const [first, second] = await Promise.all([
      visibleCards(page).nth(0).boundingBox(),
      visibleCards(page).nth(1).boundingBox(),
    ]);
    assert.ok(first && second);
    assert.equal(Math.round(first.width), Math.round(second.width));
    assert.ok(second.y > first.y + first.height);
    await close();
  });

  for (const width of [320, 375, 768, 1024, 1440]) {
    test(`does not scroll sideways at ${width}px`, async () => {
      const { page, close } = await open({ width, height: 800 });
      assert.equal(await page.evaluate(() => window.innerWidth), width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.equal(overflow, 0);
      await close();
    });
  }
});

describe("related sites", () => {
  test("links only the sites that are not blocked", async () => {
    const { page, close } = await open();
    const section = page.locator("section:has(#related-title)");
    for (const site of RELATED_SITES) {
      const item = section.locator("li", { hasText: site.name.ja });
      assert.equal(await item.count(), 1, site.id);
      const link = item.getByRole("link");
      if ("blockedBy" in site) {
        assert.equal(await link.count(), 0, `${site.id} is not linked yet`);
        assert.match(await item.innerText(), /公開準備中/);
      } else {
        assert.equal(await link.getAttribute("href"), site.path);
      }
    }
    await close();
  });
});

describe("footer", () => {
  test("repeats the menu links", async () => {
    const { page, close } = await open();
    const menuLinks = await page
      .locator("#site-menu a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const footerLinks = await page
      .locator("footer a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.deepEqual(footerLinks, menuLinks);
    await close();
  });
});

/** @param {string} text */
function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
