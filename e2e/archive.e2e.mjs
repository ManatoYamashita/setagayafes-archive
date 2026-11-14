// End-to-end tests of the archive top page in both languages ("/" and
// "/en/"), run against the built dist/ in a real browser (Chromium through
// Playwright). Run with `pnpm test:e2e` after `pnpm build`.
//
// Expectations are derived from the festival data, so adding next year's
// festival does not require editing these tests. The page's own wording is
// spelled out in PAGES, not read from src/i18n/ui.ts, so a wrong word fails.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { URL } from "node:url";
import { chromium } from "playwright";
import {
  ERA_NAMES,
  FESTIVALS,
  STATUS_LABELS,
  eraOf,
  latestFestival,
  ordinalOf,
  linkOf,
  yearOf,
} from "../src/data/festivals.ts";
import { RELATED_SITES } from "../src/data/related-sites.ts";
import { headingOf } from "../src/i18n/ui.ts";
import {
  eraLabel,
  eraRadio,
  menuButton,
  siteMenu,
  visibleCards,
  watchProblems,
} from "../scripts/lib/page-parts.mjs";
import { serve } from "./lib/server.mjs";

/** @typedef {"ja" | "en"} Lang */

/** The page's own wording in each language. */
const PAGES = {
  ja: {
    path: "/",
    pageTitle: "世田谷祭アーカイブ｜東京都市大学（旧 武蔵工業大学）の学園祭 歴代公式サイト",
    skip: "本文へ移動",
    heroTitle: "東京都市大学世田谷祭\nアーカイブ",
    seeArchive: "過去の回を見る",
    menuLinks: ["公式サイト", "公式ブログ", "X", "Instagram", "English"],
    close: "閉じる",
    round: (/** @type {number} */ round) => `第${round}回`,
    visit: (/** @type {number} */ round) => `第${round}回のサイトを見る`,
    showing: (/** @type {number} */ count) => `${count}件を表示中`,
    filterLegend: "時代で絞り込む",
    estimated: "（推定）",
    comingSoon: "公開準備中",
    preview: (/** @type {number} */ round) => `プレビュー（第${round}回）`,
  },
  en: {
    path: "/en/",
    pageTitle: "Setagaya Festival Archive | Tokyo City University",
    skip: "Skip to content",
    heroTitle: "Setagaya Festival\nArchive",
    seeArchive: "See past festivals",
    menuLinks: ["Official site", "Official blog", "X", "Instagram", "日本語"],
    close: "Close",
    round: (/** @type {number} */ round) => ordinalOf(round),
    visit: (/** @type {number} */ round) => `Visit the ${ordinalOf(round)} festival’s site`,
    showing: (/** @type {number} */ count) => `Showing ${count} festivals`,
    filterLegend: "Filter by era",
    estimated: "(estimated)",
    comingSoon: "Coming soon",
    preview: (/** @type {number} */ round) => `Preview: the ${ordinalOf(round)} festival’s site`,
  },
};

/** @type {readonly Lang[]} */
const LANGS = ["ja", "en"];

/** Hiragana, katakana and kanji: text that only a Japanese reader can read. */
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

const latest = latestFestival();
/** The grid lists every festival, the hero's too (Issue #30). */
const listed = FESTIVALS.toSorted((a, b) => b.round - a.round);
const countOf = (/** @type {string} */ era) =>
  listed.filter((festival) => eraOf(festival.round) === era).length;

/** Whether `pnpm capture` has produced a screenshot for the festival. */
const captured = (/** @type {number} */ round) =>
  ["png", "jpg"].some((ext) => existsSync(`src/assets/captures/${ordinalOf(round)}.${ext}`));

/** The festival folders on this host, e.g. "/97th/": what the previews load. */
const FESTIVAL_PATHS = new Set(FESTIVALS.map((festival) => linkOf(festival)));

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
 * Opens a top page in a fresh context and collects console errors and
 * failed requests while it loads.
 *
 * @param {string} path
 * @param {{ width?: number, height?: number, deviceScaleFactor?: number }} [viewport]
 */
async function open(path, { width = 1280, height = 900, deviceScaleFactor = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  const page = await context.newPage();
  const problems = watchProblems(page);
  await page.goto(`${server.url}${path}`, { waitUntil: "load" });
  return { page, problems, close: () => context.close() };
}

for (const lang of LANGS) {
  const t = PAGES[lang];

  describe(`${lang}: page`, () => {
    test("loads with no script, no console error and no failed request", async () => {
      const { page, problems, close } = await open(t.path);
      // JSON-LD is data, not code (docs/rules/conventions.md §1).
      assert.equal(await page.locator('script:not([type="application/ld+json"])').count(), 0);
      // Let lazy images load too: scroll to the bottom.
      await page.locator("footer").scrollIntoViewIfNeeded();
      await page.waitForLoadState("networkidle");
      assert.deepEqual(problems, []);
      await close();
    });

    test("has one h1 and landmarks in order", async () => {
      const { page, close } = await open(t.path);
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator("h1").innerText(), t.heroTitle);
      assert.equal(await page.title(), t.pageTitle);
      assert.equal(await page.locator("header").count(), 1);
      assert.equal(await page.locator("main").count(), 1);
      assert.equal(await page.locator("footer").count(), 1);
      await close();
    });
  });

  describe(`${lang}: skip link`, () => {
    test("is the first stop, shows only with focus and moves to the hero", async () => {
      const { page, close } = await open(t.path);
      const skip = page.getByRole("link", { name: t.skip, exact: true });
      const widthOf = async () => (await skip.boundingBox())?.width ?? 0;
      assert.ok((await widthOf()) <= 1, "hidden before focus");

      await page.keyboard.press("Tab");
      assert.equal(await skip.evaluate((element) => element === document.activeElement), true);
      assert.ok((await widthOf()) > 1, "visible with focus");

      await page.keyboard.press("Enter");
      await page.waitForURL(/#latest$/);
      // The next Tab starts from the hero, not from the header.
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement?.closest("#latest") !== null),
        true,
      );
      await close();
    });
  });

  describe(`${lang}: header menu`, () => {
    test("opens with MENU, closes with Escape and returns focus", async () => {
      const { page, close } = await open(t.path);
      const button = menuButton(page);
      const menu = siteMenu(page);

      assert.equal(await menu.isVisible(), false);
      await button.click();
      await menu.waitFor({ state: "visible" });
      const links = menu.getByRole("link");
      assert.deepEqual(await links.allInnerTexts(), t.menuLinks);

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
      const { page, close } = await open(t.path);
      await menuButton(page).click();
      const menu = siteMenu(page);
      await menu.waitFor({ state: "visible" });
      await menu.getByRole("button", { name: t.close }).click();
      await menu.waitFor({ state: "hidden" });
      await close();
    });

    test("keeps the close button reachable in a short viewport", async (context) => {
      const height = 256;
      const { page, close } = await open(t.path, { width: 320, height });
      context.after(close);

      await menuButton(page).click();
      const menu = siteMenu(page);
      const panel = await menu.boundingBox();
      assert.ok(panel);
      assert.ok(panel.y + panel.height <= height, "the menu fits within the viewport");

      const linkCount = await menu.getByRole("link").count();
      for (let i = 0; i <= linkCount; i++) await page.keyboard.press("Tab");

      const closeButton = menu.getByRole("button", { name: t.close });
      assert.equal(
        await closeButton.evaluate((element) => element === document.activeElement),
        true,
      );
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
      const { page, close } = await open(t.path);
      // MENU is the first stop after the skip link.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await siteMenu(page).waitFor({ state: "visible" });
      await close();
    });
  });

  describe(`${lang}: hero`, () => {
    test("names the archive's span and links to the latest festival and the list", async () => {
      const { page, close } = await open(t.path);
      const hero = page.locator("#latest");
      const rounds = FESTIVALS.map((festival) => festival.round);
      const first = Math.min(...rounds);
      const lead = await hero.locator(".lead").innerText();
      assert.match(lead, new RegExp(String(yearOf(first))));
      assert.match(lead, new RegExp(String(yearOf(latest.round))));
      assert.match(lead, new RegExp(t.round(first)));
      const cta = hero.getByRole("link", { name: t.visit(latest.round), exact: true });
      assert.equal(await cta.getAttribute("href"), linkOf(latest));
      const list = hero.getByRole("link", { name: t.seeArchive, exact: true });
      assert.equal(await list.getAttribute("href"), "#archive");
      await close();
    });

    test("loads its picture eagerly with high priority when there is one", async () => {
      const { page, close } = await open(t.path);
      const image = page.locator("#latest img");
      if ((await image.count()) > 0) {
        assert.equal(await image.count(), 1);
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

  describe(`${lang}: archive grid`, () => {
    test("lists every festival, newest first, linked to its site", async () => {
      const { page, close } = await open(t.path);
      const cards = page.locator(".grid > li");
      assert.equal(await cards.count(), listed.length);
      for (const [index, festival] of listed.entries()) {
        const link = cards.nth(index).getByRole("heading").getByRole("link");
        assert.equal(await link.getAttribute("href"), linkOf(festival), `round ${festival.round}`);
        assert.match(await link.innerText(), new RegExp(escape(headingOf(festival, lang).text)));
      }
      await close();
    });

    test("names the round in each link for screen readers", async () => {
      const { page, close } = await open(t.path);
      const first = listed[0];
      assert.ok(first);
      const heading = headingOf(first, lang);
      const name = [t.round(first.round), heading.text, heading.translation]
        .filter(Boolean)
        .join(" ");
      const link = page.getByRole("link", { name, exact: true });
      assert.equal(await link.count(), 1);
      await close();
    });

    test("marks external links, estimated dates and statuses", async () => {
      const { page, close } = await open(t.path);
      for (const festival of listed) {
        const card = page.locator(".grid > li", {
          has: page.locator(`a[href="${linkOf(festival)}"]`),
        });
        const text = await card.innerText();
        if (festival.externalLink)
          assert.match(text, new RegExp(escape(festival.externalLink.label[lang])));
        if ("estimated" in festival.dates) assert.match(text, new RegExp(escape(t.estimated)));
        const status = STATUS_LABELS[festival.status];
        if (status) assert.match(text, new RegExp(escape(status[lang])));
        if (festival.statusReason)
          assert.match(text, new RegExp(escape(festival.statusReason[lang])));
      }
      await close();
    });

    test("shows the screenshot as AVIF, or the round number before capturing", async () => {
      const { page, close } = await open(t.path);
      const cards = page.locator(".grid > li");
      for (const [index, festival] of listed.entries()) {
        const card = cards.nth(index);
        const image = card.locator("img");
        if (captured(festival.round)) {
          assert.equal(await image.count(), 1, `round ${festival.round} has its screenshot`);
          assert.match((await image.getAttribute("src")) ?? "", /\.avif$/);
          assert.equal(
            await image.getAttribute("alt"),
            "",
            "decorative: the heading names the card",
          );
        } else {
          assert.equal(await image.count(), 0);
          assert.equal(await card.locator(".plate").innerText(), String(festival.round));
        }
      }
      await close();
    });

    test("lets lazy pictures pick their size from the laid-out width", async () => {
      const { page, close } = await open(t.path);
      const cardSizes = await page
        .locator(".grid img")
        .evaluateAll((images) => images.map((image) => image.getAttribute("sizes") ?? ""));
      for (const sizes of cardSizes) assert.match(sizes, /^auto, \(width >= 64rem\)/);
      const heroSizes = await page.locator("main img").first().getAttribute("sizes");
      assert.doesNotMatch(heroSizes ?? "", /^auto/, "an eager picture cannot use auto");
      await close();
    });

    for (const { width, autoSizes } of [
      { width: 412, autoSizes: true },
      { width: 1023, autoSizes: true },
      { width: 1280, autoSizes: true },
      { width: 1023, autoSizes: false },
      { width: 1280, autoSizes: false },
    ]) {
      test(`loads enough image resolution at ${width}px and DPR 2 (auto sizes: ${autoSizes})`, async (context) => {
        const first = listed.find((festival) => captured(festival.round));
        if (!first) {
          context.skip("no captured festival");
          return;
        }
        const { page, close } = await open(t.path, { width, deviceScaleFactor: 2 });
        context.after(close);

        const selector = `.grid > li:has(a[href="${linkOf(first)}"]) img`;
        const image = page.locator(selector);
        if (!autoSizes) {
          await image.evaluate((element) => {
            const image = /** @type {HTMLImageElement} */ (element);
            image.sizes = image.sizes.replace(/^auto,\s*/, "");
          });
        }
        await image.scrollIntoViewIfNeeded();
        const box = await image.boundingBox();
        assert.ok(box);

        await page.waitForFunction(
          ({ selector, requiredWidth }) => {
            const image = /** @type {HTMLImageElement | null} */ (document.querySelector(selector));
            if (!image?.complete || !image.naturalWidth) return false;
            // naturalWidth accounts for density, so compare the selected width descriptor.
            return image.srcset.split(",").some((candidate) => {
              const [url, width] = candidate.trim().split(/\s+/);
              return image.currentSrc.endsWith(url) && Number.parseInt(width, 10) >= requiredWidth;
            });
          },
          // The largest candidate is 1280px; a wider box at DPR 2 settles for it.
          { selector, requiredWidth: Math.min(1280, Math.ceil(box.width * 2)) },
          { timeout: 3000 },
        );
      });
    }

    test("makes the whole card clickable", async () => {
      const { page, close } = await open(t.path);
      const card = page.locator(".grid > li").first();
      // The hero is tall: bring the card into the viewport before clicking by coordinates.
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      assert.ok(box);
      // Click the picture area, not the heading.
      await page.mouse.click(box.x + box.width / 2, box.y + 20);
      await page.waitForURL(`${server.url}${linkOf(/** @type {any} */ (listed[0]))}`);
      await close();
    });
  });

  describe(`${lang}: era filter`, () => {
    test("shows all festivals by default", async () => {
      const { page, close } = await open(t.path);
      assert.equal(await eraRadio(page, "all").isChecked(), true);
      assert.equal(await visibleCards(page).count(), listed.length);
      assert.equal(
        await page.locator(".result-text:visible").innerText(),
        t.showing(listed.length),
      );
      await close();
    });

    for (const era of /** @type {const} */ (["musashi", "tcu"])) {
      test(`narrows the grid to ${era}`, async () => {
        const { page, close } = await open(t.path);
        await page.locator("label", { hasText: ERA_NAMES[era][lang] }).click();
        assert.equal(await eraRadio(page, era).isChecked(), true);
        const cards = visibleCards(page);
        assert.equal(await cards.count(), countOf(era));
        const eras = await cards.evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-era")),
        );
        assert.deepEqual(new Set(eras), new Set([era]));
        assert.equal(
          await page.locator(".result-text:visible").innerText(),
          t.showing(countOf(era)),
        );
        await close();
      });
    }

    test("is a radio group operable with arrow keys", async () => {
      const { page, close } = await open(t.path);
      await eraRadio(page, "all").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await eraRadio(page, "musashi").isChecked(), true);
      assert.equal(await visibleCards(page).count(), countOf("musashi"));
      await page.keyboard.press("ArrowRight");
      assert.equal(await eraRadio(page, "tcu").isChecked(), true);
      assert.equal(await visibleCards(page).count(), countOf("tcu"));
      await close();
    });

    test("keeps the picked era visible in forced colors", async () => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        forcedColors: "active",
      });
      const page = await context.newPage();
      await page.goto(`${server.url}${t.path}`, { waitUntil: "load" });
      const backgroundOf = (/** @type {import("../scripts/lib/page-parts.mjs").EraFilter} */ id) =>
        eraLabel(page, id).evaluate(
          (label) => label.ownerDocument.defaultView?.getComputedStyle(label).backgroundColor,
        );
      assert.notEqual(await backgroundOf("all"), await backgroundOf("musashi"));
      await context.close();
    });

    test("labels the group", async () => {
      const { page, close } = await open(t.path);
      const group = page.getByRole("group", { name: t.filterLegend });
      assert.equal(await group.getByRole("radio").count(), 3);
      await close();
    });
  });

  describe(`${lang}: layout`, () => {
    test("uses three even columns on wide screens, also after filtering", async () => {
      const { page, close } = await open(t.path, { width: 1280 });
      const boxesOf = async () =>
        Promise.all([0, 1, 2, 3].map(async (n) => visibleCards(page).nth(n).boundingBox()));
      for (const era of ["all", "musashi"]) {
        await eraLabel(page, era).click();
        const [a, b, c, d] = await boxesOf();
        assert.ok(a && b && c && d);
        assert.equal(Math.round(a.width), Math.round(b.width), `${era}: same width`);
        assert.equal(Math.round(b.width), Math.round(c.width), `${era}: same width`);
        assert.equal(Math.round(a.y), Math.round(c.y), `${era}: three in a row`);
        assert.ok(d.y > a.y + a.height, `${era}: the fourth starts a new row`);
      }
      await close();
    });

    for (const era of /** @type {const} */ (["all", "musashi", "tcu"])) {
      test(`keeps the tab order in the reading order with three columns (${era})`, async (context) => {
        const { page, close } = await open(t.path, { width: 1280 });
        context.after(close);
        await eraLabel(page, era).click();
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
        assert.deepEqual(
          reading,
          [...boxes.keys()],
          "source order is left to right, top to bottom",
        );
        // Each card has its buttons ("Visit the site", "Preview") before its
        // heading link. Tab through the grid and note which card each heading
        // link that receives focus belongs to.
        const cards = visibleCards(page);
        await cards.first().locator("a, button").first().focus();
        /** @type {number[]} */
        const order = [];
        for (let step = 0; step < boxes.length * 4; step += 1) {
          const index = await page.evaluate(() => {
            const active = document.activeElement;
            const card = active?.closest(".grid > li");
            if (!card) return -1;
            const visible = [...document.querySelectorAll(".grid > li")].filter((item) =>
              item.checkVisibility(),
            );
            return active?.closest("h3") ? visible.indexOf(card) : -2;
          });
          if (index === -1) break;
          if (index >= 0) order.push(index);
          await page.keyboard.press("Tab");
        }
        assert.deepEqual(order, reading, "Tab reaches the cards in visual reading order");
      });
    }

    test("uses one column on phones", async () => {
      const { page, close } = await open(t.path, { width: 375, height: 800 });
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
        const { page, close } = await open(t.path, { width, height: 800 });
        assert.equal(await page.evaluate(() => window.innerWidth), width);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert.equal(overflow, 0);
        await close();
      });
    }
  });

  describe(`${lang}: preview`, () => {
    test("opens the latest festival's site in a sandboxed iframe from the hero", async () => {
      const { page, close } = await open(t.path);
      await page.waitForLoadState("networkidle");
      // Nothing from the festival folders is fetched before a preview opens.
      const fetched = await page.evaluate(() =>
        // eslint-disable-next-line no-undef -- runs in the page.
        performance.getEntriesByType("resource").map((entry) => entry.name),
      );
      assert.deepEqual(
        fetched.filter((url) => FESTIVAL_PATHS.has(new URL(url).pathname)),
        [],
        "no preview loads on its own",
      );

      const hero = page.locator("#latest");
      await hero.locator(".frame").hover();
      const button = hero.getByRole("button", { name: t.preview(latest.round), exact: true });
      await button.click();
      const dialog = page.locator(`#preview-${latest.round}`);
      await dialog.waitFor({ state: "visible" });
      const frame = dialog.locator("iframe");
      assert.equal(await frame.getAttribute("src"), linkOf(latest));
      assert.equal(await frame.getAttribute("loading"), "lazy");
      assert.equal(
        await frame.getAttribute("sandbox"),
        "allow-scripts allow-popups allow-popups-to-escape-sandbox",
        "no allow-same-origin: the old sites' scripts cannot reach this page",
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await close();
    });

    test("moves focus into the panel when it opens and back when it closes", async () => {
      const { page, close } = await open(t.path);
      const hero = page.locator("#latest");
      await hero.locator(".frame").hover();
      const button = hero.getByRole("button", { name: t.preview(latest.round), exact: true });
      await button.focus();
      await page.keyboard.press("Enter");
      const dialog = page.locator(`#preview-${latest.round}`);
      await dialog.waitFor({ state: "visible" });
      assert.equal(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        true,
        "focus is inside the panel right after it opens",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent?.trim()),
        t.close,
        "on the close button",
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await button.evaluate((element) => element === document.activeElement),
        true,
        "focus returns to the button that opened it",
      );
      await close();
    });

    test("keeps focus in the panel and the page behind inert", async () => {
      const { page, close } = await open(t.path);
      const hero = page.locator("#latest");
      await hero.locator(".frame").hover();
      await hero.getByRole("button", { name: t.preview(latest.round), exact: true }).click();
      const dialog = page.locator(`#preview-${latest.round}`);
      await dialog.waitFor({ state: "visible" });
      assert.equal(await dialog.evaluate((element) => element.matches(":modal")), true);
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press("Tab");
        // body: focus has gone to the browser's own controls, not to the page behind.
        const where = await page.evaluate(() => {
          const active = document.activeElement;
          if (!active || active === document.body) return "browser";
          return active.closest("dialog") ? "panel" : `behind: ${active.outerHTML.slice(0, 80)}`;
        });
        assert.notEqual(where.startsWith("behind"), true, `Tab ${step + 1}: ${where}`);
      }
      await close();
    });

    test("closes with a click outside", async () => {
      const { page, close } = await open(t.path);
      const hero = page.locator("#latest");
      await hero.locator(".frame").hover();
      const button = hero.getByRole("button", { name: t.preview(latest.round), exact: true });
      await button.click();
      const dialog = page.locator(`#preview-${latest.round}`);
      await dialog.waitFor({ state: "visible" });
      // The panel leaves a margin all round: the top left corner is the backdrop.
      await page.mouse.click(2, 2);
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await button.evaluate((element) => element === document.activeElement), true);
      await close();
    });

    test("closes with the close button", async () => {
      const { page, close } = await open(t.path);
      const card = page.locator(".grid > li").first();
      await card.hover();
      await card.getByRole("button", { name: t.preview(latest.round), exact: true }).click();
      const dialog = page.locator(`#preview-${latest.round}`);
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("button", { name: t.close, exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await close();
    });

    test("keeps the page still while a preview is open", async () => {
      const { page, close } = await open(t.path);
      const hero = page.locator("#latest");
      await hero.locator(".frame").hover();
      const before = await page.evaluate(() => window.scrollY);
      await hero.getByRole("button", { name: t.preview(latest.round), exact: true }).click();
      const dialog = page.locator(`#preview-${latest.round}`);
      await dialog.waitFor({ state: "visible" });
      // Wheel over the dialog's bar, where the iframe cannot take the scroll.
      const bar = await dialog.locator(".bar").boundingBox();
      assert.ok(bar);
      await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.scrollY), before, "the page does not scroll");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(300);
      assert.ok(
        (await page.evaluate(() => window.scrollY)) > before,
        "it scrolls again after closing",
      );
      await close();
    });

    test("is offered for every festival whose site is on this host", async () => {
      const { page, close } = await open(t.path);
      for (const festival of listed) {
        const card = page.locator(".grid > li", {
          has: page.locator(`h3 a[href="${linkOf(festival)}"]`),
        });
        const buttons = card.locator('button[command="show-modal"]');
        assert.equal(
          await buttons.count(),
          festival.externalLink ? 0 : 1,
          `round ${festival.round}`,
        );
      }
      await close();
    });

    test("shows the buttons under the picture on touch screens", async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await page.goto(`${server.url}${t.path}`, { waitUntil: "load" });
      const card = page.locator(".grid > li").first();
      await card.scrollIntoViewIfNeeded();
      const button = card.getByRole("button", { name: t.preview(latest.round), exact: true });
      assert.equal(await button.isVisible(), true);
      const [picture, buttonBox] = await Promise.all([
        card.locator("img").boundingBox(),
        button.boundingBox(),
      ]);
      assert.ok(picture && buttonBox && buttonBox.y > picture.y + picture.height);
      await context.close();
    });
  });

  describe(`${lang}: related sites`, () => {
    test("links only the sites that are not blocked", async () => {
      const { page, close } = await open(t.path);
      const section = page.locator("section:has(#related-title)");
      for (const site of RELATED_SITES) {
        const item = section.locator("li", { hasText: site.name[lang] });
        assert.equal(await item.count(), 1, site.id);
        const link = item.getByRole("link");
        if ("blockedBy" in site) {
          assert.equal(await link.count(), 0, `${site.id} is not linked yet`);
          assert.match(await item.innerText(), new RegExp(t.comingSoon));
        } else {
          assert.equal(await link.getAttribute("href"), site.path);
          if (existsSync(`src/assets/related/${site.id}.png`)) {
            const image = link.locator("img");
            assert.match((await image.getAttribute("src")) ?? "", /\.avif$/);
            assert.equal(
              await image.getAttribute("alt"),
              "",
              "decorative: the name labels the tile",
            );
            assert.equal(await image.getAttribute("loading"), "lazy");
          }
        }
      }
      await close();
    });
  });

  describe(`${lang}: footer`, () => {
    test("repeats the menu links", async () => {
      const { page, close } = await open(t.path);
      const menuLinks = await siteMenu(page)
        .locator("a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      // The builder's credit sits outside the footer's navigation, so compare the navs only.
      const footerLinks = await page
        .locator("footer nav a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      // The footer groups them differently (icons, text links, button): compare as sets.
      assert.deepEqual(footerLinks.toSorted(), menuLinks.toSorted());
      await close();
    });

    test("credits the builder", async () => {
      const { page, close } = await open(t.path);
      const credit = page.locator("footer .credit a");
      assert.equal(await credit.getAttribute("href"), "https://www.yamashitamana.to/");
      assert.equal(await credit.innerText(), "yamashitamana.to");
      await close();
    });
  });
}

describe("languages", () => {
  for (const lang of LANGS) {
    const t = PAGES[lang];
    const other = lang === "ja" ? "en" : "ja";

    test(`${lang}: declares its language and links both versions for search engines`, async () => {
      const { page, close } = await open(t.path);
      assert.equal(await page.locator("html").getAttribute("lang"), lang);
      const alternates = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) =>
          links.map((link) => [link.getAttribute("hreflang"), link.getAttribute("href")]),
        );
      assert.deepEqual(alternates, [
        ["ja", "https://archive.setagayafes.org/"],
        ["en", "https://archive.setagayafes.org/en/"],
        ["x-default", "https://archive.setagayafes.org/"],
      ]);
      await close();
    });

    test(`${lang}: the menu switches to the other language`, async () => {
      const { page, close } = await open(t.path);
      await menuButton(page).click();
      const link = siteMenu(page).getByRole("link", { name: t.menuLinks.at(-1) });
      assert.equal(await link.getAttribute("hreflang"), other);
      assert.equal(await link.getAttribute("lang"), other);
      await link.click();
      await page.waitForURL(`${server.url}${PAGES[other].path}`);
      assert.equal(await page.locator("h1").innerText(), PAGES[other].heroTitle);
      await close();
    });
  }

  test("en: every Japanese text is marked lang=ja", async () => {
    const { page, close } = await open(PAGES.en.path);
    const unmarked = await page.evaluate((source) => {
      const japanese = new RegExp(source, "u");
      /** @type {string[]} */
      const found = [];
      const walker = document.createTreeWalker(document.documentElement, 4 /* SHOW_TEXT */);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        // JSON-LD is data for search engines, not text on the page.
        if (node.parentElement?.localName === "script") continue;
        const text = node.textContent ?? "";
        const lang = node.parentElement?.closest("[lang]")?.getAttribute("lang");
        if (japanese.test(text) && lang !== "ja") found.push(text.trim());
      }
      for (const element of document.querySelectorAll("[aria-label], [alt], [title], meta")) {
        for (const name of ["aria-label", "alt", "title", "content"]) {
          const value = element.getAttribute(name) ?? "";
          if (japanese.test(value)) found.push(`${name}="${value}"`);
        }
      }
      return found;
    }, JAPANESE.source);
    assert.deepEqual(unmarked, []);
    await close();
  });

  test("en: Japanese themes keep the original as the title, with the translation", async () => {
    const { page, close } = await open(PAGES.en.path);
    const cards = page.locator(".grid > li");
    for (const [index, festival] of listed.entries()) {
      const title = cards.nth(index).locator("h3");
      const heading = headingOf(festival, "en");
      if (heading.translation) {
        // Count first: innerText() on a missing element waits for the timeout.
        const original = title.locator('[lang="ja"]');
        const translation = title.locator(".translation");
        assert.equal(await original.count(), 1, `round ${festival.round}`);
        assert.equal(await translation.count(), 1, `round ${festival.round}`);
        assert.equal(await original.innerText(), heading.text);
        assert.equal(await translation.innerText(), heading.translation);
      } else {
        assert.equal(await title.locator('[lang="ja"], .translation').count(), 0);
      }
    }
    await close();
  });

  test("en: links to the festival sites say they are in Japanese", async () => {
    const { page, close } = await open(PAGES.en.path);
    // Links within this page ("#archive") stay in English.
    const links = page.locator('main a[href]:not([href^="#"])');
    assert.ok((await links.count()) > listed.length);
    for (const link of await links.all()) {
      assert.equal(await link.getAttribute("hreflang"), "ja", await link.getAttribute("href"));
    }
    await close();
  });

  test("ja: shows no translations", async () => {
    const { page, close } = await open(PAGES.ja.path);
    assert.equal(await page.locator(".translation").count(), 0);
    // Only the large Latin words of the section headings (Latest, Archive, Related).
    assert.equal(await page.locator("main [lang]:not(.word)").count(), 0);
    assert.deepEqual(
      await page.locator("main .word").evaluateAll((words) => words.map((word) => word.lang)),
      ["en", "en"],
    );
    await close();
  });
});

/** @param {string} text */
function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
