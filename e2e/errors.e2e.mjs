// End-to-end tests of the error pages (/errors/NNN.html), run against the
// built dist/ in Chromium under the Content-Security-Policy that dist/.htaccess
// sends them. Run with `pnpm test:e2e` after `pnpm build`.
//
// The server shows these pages in place of any failed URL, so they are also
// opened at made-up paths deep in the site: everything they load must still be
// found, and the status must stay the error's own (no soft 404).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, test } from "node:test";
import { URL } from "node:url";
import { chromium } from "playwright";
import { watchProblems } from "../scripts/lib/page-parts.mjs";
import { errorCsp, isErrorPage, styleHashesOf } from "../scripts/lib/htaccess.mjs";
import {
  ERROR_CODES,
  REASON_PHRASES,
  SPECIFIC_ERROR_CODES,
  errorMessageOf,
} from "../src/i18n/errors.ts";
import { serve } from "./lib/server.mjs";

/** Budgets in bytes, the same as the top pages' (docs/rules/conventions.md, 6). */
const BUDGET = { initial: 200_000, total: 1_000_000 };

/** The pages to look at closely: every page with its own words, and a shared one of each class. */
const SAMPLES = [...SPECIFIC_ERROR_CODES, 400, 502];

/** @type {Awaited<ReturnType<typeof serve>>} */
let server;
/** @type {import("playwright").Browser} */
let browser;

before(async () => {
  const hashes = [];
  for (const code of ERROR_CODES) {
    const file = `errors/${code}.html`;
    assert.ok(isErrorPage(file));
    hashes.push(...styleHashesOf(await readFile(`dist/${file}`, "utf8")));
  }
  const csp = errorCsp(hashes);
  server = await serve("dist", {
    headers: (pathname) =>
      isErrorPage(pathname.slice(1)) ? { "content-security-policy": csp } : {},
    notFoundPage: "/errors/404.html",
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Opens a page and collects CSP violations and other problems. The document's
 * own error status is expected and not counted.
 *
 * @param {string} path
 * @param {{ width?: number, height?: number }} [viewport]
 */
async function open(path, { width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const problems = watchProblems(page);
  /** @type {string[]} */
  const violations = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  const response = await page.goto(`${server.url}${path}`, { waitUntil: "load" });
  const status = response?.status() ?? 0;
  // The browser also logs the document's own status as a console error. A
  // file the page fails to load still shows up as its own "404 <url>" entry.
  const own = [
    `${status} ${server.url}${path}`,
    `console: Failed to load resource: the server responded with a status of ${status} (Not Found)`,
  ];
  const otherProblems = () => {
    const rest = [...problems];
    for (const entry of own) {
      const index = rest.indexOf(entry);
      if (index !== -1) rest.splice(index, 1);
    }
    return rest;
  };
  return { context, page, status, violations, otherProblems };
}

describe("every error page", () => {
  for (const code of ERROR_CODES) {
    test(`/errors/${code}.html: no script, no CSP violation, both languages, both links`, async () => {
      const { context, page, violations, otherProblems } = await open(`/errors/${code}.html`);
      try {
        await page.locator("footer").scrollIntoViewIfNeeded();
        await page.waitForLoadState("networkidle");
        assert.deepEqual(violations, []);
        assert.deepEqual(otherProblems(), []);
        assert.equal(await page.locator("script").count(), 0);

        const { ja, en } = errorMessageOf(code);
        assert.equal(await page.locator("html").getAttribute("lang"), "ja");
        assert.equal(await page.locator(".code").textContent(), String(code));
        assert.equal(await page.locator('.reason[lang="en"]').textContent(), REASON_PHRASES[code]);
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.locator("h1 .ja").textContent(), ja.title);
        assert.equal(await page.locator('h1 [lang="en"]').textContent(), en.title);
        assert.equal(await page.locator(".lead p:not([lang])").textContent(), ja.lead);
        assert.equal(await page.locator('.lead p[lang="en"]').textContent(), en.lead);

        const main = page.locator("main");
        assert.equal(await main.locator("a.primary").getAttribute("href"), "/");
        assert.equal(
          await main.locator("a.secondary").getAttribute("href"),
          "https://setagayafes.org/",
        );
        assert.equal(await page.locator("header a").getAttribute("href"), "/");

        assert.equal(
          await page.locator('meta[name="robots"]').getAttribute("content"),
          "noindex, noimageindex",
        );
        assert.equal(await page.locator('link[rel="canonical"], link[hreflang]').count(), 0);
        // No language switch: the page already carries both languages.
        assert.equal(await page.locator("a[hreflang]").count(), 0);
        // Every URL the page uses works from any failed URL.
        for (const value of await page
          .locator("[href], [src], [srcset]")
          .evaluateAll((elements) =>
            elements.flatMap((element) =>
              ["href", "src", "srcset"].map((name) => element.getAttribute(name) ?? ""),
            ),
          )) {
          if (value === "") continue;
          for (const url of value.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "")) {
            assert.match(url, /^(?:\/|https:\/\/)/, `absolute: ${url}`);
          }
        }
      } finally {
        await context.close();
      }
    });
  }
});

describe("the error pages' CSP check", () => {
  test("a changed style is blocked (the check works)", async () => {
    const strict = await serve("dist", {
      headers: () => ({ "content-security-policy": errorCsp(["'sha256-AAAA'"]) }),
    });
    const page = await browser.newPage();
    try {
      /** @type {string[]} */
      const violations = [];
      page.on("console", (message) => {
        if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
      });
      await page.goto(`${strict.url}/errors/404.html`, { waitUntil: "load" });
      assert.ok(violations.length > 0);
    } finally {
      await page.close();
      await strict.close();
    }
  });
});

describe("the 404 page at a missing URL", () => {
  for (const path of ["/no-such-page/", "/a/b/c/no-such-page.html"]) {
    test(`${path}: status 404, styled, with its favicon and footer image`, async () => {
      const { context, page, status, violations, otherProblems } = await open(path);
      try {
        assert.equal(status, 404, "no soft 404");
        assert.equal(await page.locator(".code").textContent(), "404");
        await page.locator("footer").scrollIntoViewIfNeeded();
        await page.waitForLoadState("networkidle");
        assert.deepEqual(violations, []);
        assert.deepEqual(otherProblems(), []);
        const look = await page.locator(".code").evaluate((element) => {
          const style = window.getComputedStyle(element);
          return { family: style.fontFamily, size: Number.parseFloat(style.fontSize) };
        });
        assert.match(look.family, /^Futura/, "the display font from the inlined CSS");
        assert.ok(look.size >= 112, `the number is the large figure (${look.size}px)`);
        const broken = await page.evaluate(
          () => [...document.images].filter((image) => image.naturalWidth === 0).length,
        );
        assert.equal(broken, 0, "no broken image");
        const favicon = await page.request.get(
          new URL((await page.locator('link[rel="icon"]').getAttribute("href")) ?? "", page.url())
            .href,
        );
        assert.equal(favicon.status(), 200);
      } finally {
        await context.close();
      }
    });
  }

  test("the primary button goes to the list of past festivals", async () => {
    const { context, page } = await open("/a/b/no-such-page/");
    try {
      await page.locator("a.primary").click();
      await page.waitForURL(`${server.url}/`);
      assert.equal((await page.locator(".grid > li").count()) > 0, true);
    } finally {
      await context.close();
    }
  });
});

describe("error page layout", () => {
  for (const code of SAMPLES) {
    for (const width of [320, 390, 1280]) {
      test(`/errors/${code}.html at ${width}px: no sideways scroll, the links stay large`, async () => {
        const { context, page } = await open(`/errors/${code}.html`, { width, height: 800 });
        try {
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          assert.equal(overflow, 0);
          for (const selector of ["a.primary", "a.secondary", "header a"]) {
            const box = await page.locator(selector).boundingBox();
            assert.ok(box && box.height >= 44, `${selector} is at least 44px tall`);
          }
        } finally {
          await context.close();
        }
      });
    }
  }

  test("keeps the reading order: number, heading, text, then the two links", async () => {
    const { context, page } = await open("/errors/404.html", { width: 320, height: 640 });
    try {
      const tops = await Promise.all(
        [".code", "h1", ".lead", "a.primary", "a.secondary"].map(
          async (selector) => (await page.locator(selector).boundingBox())?.y ?? -1,
        ),
      );
      assert.deepEqual(
        tops,
        tops.toSorted((a, b) => a - b),
      );
    } finally {
      await context.close();
    }
  });
});

describe("error page budget", () => {
  for (const viewport of [
    { width: 320, height: 640, deviceScaleFactor: 2 },
    { width: 412, height: 823, deviceScaleFactor: 1.75 },
    { width: 1440, height: 900, deviceScaleFactor: 2 },
  ]) {
    test(`/no-such-page/ at ${viewport.width}px @${viewport.deviceScaleFactor}x: whole page <= ${BUDGET.initial / 1000} KB`, async (context) => {
      const browserContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
      });
      const page = await browserContext.newPage();
      /** @type {Promise<number>[]} */
      const sizes = [];
      page.on("response", (response) =>
        sizes.push(
          response.body().then(
            (body) => body.length,
            () => 0,
          ),
        ),
      );
      try {
        await page.goto(`${server.url}/no-such-page/`, { waitUntil: "load" });
        await page.locator("footer").scrollIntoViewIfNeeded();
        await page.waitForLoadState("networkidle");
        const total = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
        context.diagnostic(`${(total / 1000).toFixed(1)} KB in ${sizes.length} requests`);
        // The whole page, scrolled to the end, already fits the first view's budget.
        assert.ok(total <= BUDGET.initial, `${total} bytes`);
        assert.ok(total <= BUDGET.total);
      } finally {
        await browserContext.close();
      }
    });
  }
});
