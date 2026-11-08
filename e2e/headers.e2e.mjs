// The top pages under the Content-Security-Policy that dist/.htaccess sends
// (scripts/lib/htaccess.mjs). A style hash that does not match the built page
// would leave it unstyled without any error in the build, so the page is
// rendered with and without the policy and compared.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import { pageCsp, styleHashesOf } from "../scripts/lib/htaccess.mjs";
import { serve } from "./lib/server.mjs";

const PAGES = [
  { path: "/", file: "dist/index.html" },
  { path: "/en/", file: "dist/en/index.html" },
];

/** @type {Awaited<ReturnType<typeof serve>>} */
let plain;
/** @type {Awaited<ReturnType<typeof serve>>} */
let withCsp;
/** @type {import("playwright").Browser} */
let browser;

before(async () => {
  const hashes = [];
  for (const { file } of PAGES) hashes.push(...styleHashesOf(await readFile(file, "utf8")));
  const csp = pageCsp(hashes);
  plain = await serve("dist");
  withCsp = await serve("dist", {
    headers: (pathname) =>
      /^\/(?:en\/)?(?:index\.html)?$/.test(pathname) ? { "content-security-policy": csp } : {},
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await plain?.close();
  await withCsp?.close();
});

/**
 * Loads a page and returns the CSP violations and a few computed styles.
 *
 * @param {string} url
 */
async function render(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  /** @type {string[]} */
  const violations = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto(url, { waitUntil: "load" });
  const styles = await page.evaluate(() =>
    ["body", "header", ".grid", ".card .title"].map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return `${selector}: missing`;
      const style = window.getComputedStyle(element);
      return `${selector}: ${style.display} ${style.backgroundColor} ${style.fontSize} ${style.gridTemplateColumns}`;
    }),
  );
  const images = await page.evaluate(
    () => [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
  );
  await page.close();
  return { violations, styles, images };
}

describe("content security policy of the top pages", () => {
  for (const { path } of PAGES) {
    test(`${path} renders the same with the policy, without violations`, async () => {
      const expected = await render(`${plain.url}${path}`);
      const actual = await render(`${withCsp.url}${path}`);
      assert.deepEqual(actual.violations, []);
      assert.deepEqual(actual.styles, expected.styles);
      assert.equal(actual.images, 0, "no broken image");
    });
  }

  // Lighthouse fetches robots.txt from inside the page with this DevTools
  // Protocol command. Under the page's CSP it needs connect-src 'self';
  // without it the SEO audit "robots.txt is not valid" fails with a CSP
  // violation (measured on production, 2026-11-08: SEO 92).
  for (const { path } of PAGES) {
    test(`${path} lets Lighthouse fetch robots.txt from inside the page`, async () => {
      const page = await browser.newPage();
      try {
        await page.goto(`${withCsp.url}${path}`, { waitUntil: "load" });
        const cdp = await page.context().newCDPSession(page);
        const { frameTree } = await cdp.send("Page.getFrameTree");
        const { resource } = await cdp.send("Network.loadNetworkResource", {
          frameId: frameTree.frame.id,
          url: `${withCsp.url}/robots.txt`,
          options: { disableCache: true, includeCredentials: false },
        });
        assert.equal(resource.success, true);
        assert.equal(resource.httpStatusCode, 200);
      } finally {
        await page.close();
      }
    });
  }

  test("a changed style is blocked (the check works)", async () => {
    const strict = await serve("dist", {
      headers: () => ({ "content-security-policy": pageCsp(["'sha256-AAAA'"]) }),
    });
    try {
      const { violations } = await render(`${strict.url}/`);
      assert.ok(violations.length > 0);
    } finally {
      await strict.close();
    }
  });
});
