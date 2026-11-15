// Checks the production host in a real browser after a deployment
// (docs/ops/deploy.md, step 5): the pages open, the top pages load with no
// error, the MENU and the era filter work, and a missing URL shows the 404
// error page (/errors/404.html) with its styles. Read-only: it only opens pages.
// Kept apart from check-production.mjs so that one runs without a browser.
//
// Usage: node scripts/check-production-browser.mjs

import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ARCHIVE_HOST } from "./lib/htaccess.mjs";
import {
  eraLabel,
  eraRadio,
  menuButton,
  menuCloseButton,
  siteMenu,
  visibleCards,
  watchProblems,
} from "./lib/page-parts.mjs";

const ORIGIN = `https://${ARCHIVE_HOST}`;
const TOP_PAGES = ["/", "/en/"];
const PAST_SITES = ["/78th/", "/96th/"];
const TIMEOUT = 15_000;

let failed = 0;

/**
 * @param {string} name
 * @param {() => Promise<void>} run
 * @returns {Promise<boolean>} Whether it passed.
 */
async function check(name, run) {
  try {
    await run();
    console.log(`ok   ${name}`);
    return true;
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n     ${/** @type {Error} */ (error).message}`);
    return false;
  }
}

const browser = await chromium.launch();
try {
  // One page at a time: the host is shared.
  for (const path of [...TOP_PAGES, ...PAST_SITES]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: "setagayafes-archive deploy check",
    });
    context.setDefaultTimeout(TIMEOUT);
    const page = await context.newPage();
    const problems = watchProblems(page);
    try {
      const opened = await check(`${path} returns 200`, async () => {
        const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: "load" });
        assert.equal(response?.status(), 200);
      });
      if (!opened || !TOP_PAGES.includes(path)) continue;

      await check(`${path} has no console error and no failed request`, async () => {
        // Lazy images load only when scrolled to.
        await page.locator("footer").scrollIntoViewIfNeeded();
        await page.waitForLoadState("networkidle");
        assert.deepEqual(problems, []);
      });

      if (path === "/") {
        await check("/ MENU opens and closes", async () => {
          await menuButton(page).click();
          await siteMenu(page).waitFor({ state: "visible" });
          await menuCloseButton(page).click();
          await siteMenu(page).waitFor({ state: "hidden" });
        });

        await check("/ the era filter changes the number of cards", async () => {
          const all = await visibleCards(page).count();
          assert.ok(all > 0, "no card is shown");
          for (const era of /** @type {const} */ (["musashi", "tcu"])) {
            await eraLabel(page, era).click();
            assert.equal(await eraRadio(page, era).isChecked(), true, `${era} is not picked`);
            const count = await visibleCards(page).count();
            assert.ok(count > 0 && count < all, `${era}: ${count} of ${all} cards`);
          }
          await eraLabel(page, "all").click();
          assert.equal(await visibleCards(page).count(), all);
        });
      }
    } finally {
      await context.close();
    }
  }

  // The 404 page at a missing URL: status 404, the inlined styles applied (a
  // CSP hash that does not match would leave it unstyled), nothing else failing.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "setagayafes-archive deploy check",
  });
  context.setDefaultTimeout(TIMEOUT);
  const page = await context.newPage();
  const problems = watchProblems(page);
  const missing = "/no-such-page/";
  try {
    await check(`${missing} shows the 404 error page, styled, with status 404`, async () => {
      const response = await page.goto(`${ORIGIN}${missing}`, { waitUntil: "load" });
      assert.equal(response?.status(), 404);
      assert.equal(await page.locator(".code").textContent(), "404");
      // Runs in the page; reached through the element, as this file has no browser globals.
      const family = await page
        .locator(".code")
        .evaluate(
          (element) => element.ownerDocument.defaultView?.getComputedStyle(element).fontFamily,
        );
      assert.match(family, /^Futura/, "the inlined CSS is applied");
      await page.locator("footer").scrollIntoViewIfNeeded();
      await page.waitForLoadState("networkidle");
      // The document's own 404 is expected; anything else is not.
      const others = problems.filter(
        (problem) =>
          problem !== `404 ${ORIGIN}${missing}` &&
          !/the server responded with a status of 404/.test(problem),
      );
      assert.deepEqual(others, []);
    });
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

if (failed > 0) {
  console.error(
    `\n${failed} check(s) failed. Roll back if the site is broken (docs/ops/deploy.md).`,
  );
  process.exit(1);
}
console.log("\nAll browser checks passed.");
