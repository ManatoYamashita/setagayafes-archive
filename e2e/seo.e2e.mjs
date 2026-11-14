// End-to-end tests of what search engines and link previews read: the page
// <head>, the Open Graph image, /sitemap.xml and /robots.txt, served from the
// built dist/. Run with `pnpm test:e2e` after `pnpm build`.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import { metadataSegments } from "../scripts/lib/jpeg.mjs";
import { UI } from "../src/i18n/ui.ts";
import { serve } from "./lib/server.mjs";

const SITE = "https://archive.setagayafes.org";

const PAGES = {
  ja: {
    path: "/",
    title: "世田谷祭アーカイブ",
    locale: "ja_JP",
    otherLocale: "en_US",
    imageAlt: UI.ja.ogImageAlt,
  },
  en: {
    path: "/en/",
    title: "Setagaya Festival Archive",
    locale: "en_US",
    otherLocale: "ja_JP",
    imageAlt: UI.en.ogImageAlt,
  },
};

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
 * Reads the head of a page.
 *
 * @param {string} path
 */
async function headOf(path) {
  const page = await browser.newPage();
  await page.goto(`${server.url}${path}`);
  const head = await page.evaluate(() => {
    /** @type {Record<string, string[]>} */
    const meta = {};
    for (const element of document.querySelectorAll("meta[property], meta[name]")) {
      const key = element.getAttribute("property") ?? element.getAttribute("name") ?? "";
      (meta[key] ??= []).push(element.getAttribute("content") ?? "");
    }
    const canonical = [...document.querySelectorAll('link[rel="canonical"]')].map((link) =>
      link.getAttribute("href"),
    );
    return { meta, canonical, title: document.title };
  });
  await page.close();
  return head;
}

/**
 * Turns an absolute URL on the production host into one on the test server.
 *
 * @param {string} url
 */
function local(url) {
  assert.ok(url.startsWith(`${SITE}/`), `${url} is on ${SITE}`);
  return `${server.url}${url.slice(SITE.length)}`;
}

for (const [lang, expected] of Object.entries(PAGES)) {
  describe(`${lang}: head`, () => {
    test("has one canonical URL, its own top page", async () => {
      const { canonical, meta } = await headOf(expected.path);
      assert.deepEqual(canonical, [`${SITE}${expected.path}`]);
      assert.deepEqual(meta["og:url"], [`${SITE}${expected.path}`]);
    });

    test("has the Open Graph basics in its language", async () => {
      const { meta, title } = await headOf(expected.path);
      assert.equal(title, expected.title);
      assert.deepEqual(meta["og:type"], ["website"]);
      assert.deepEqual(meta["og:title"], [expected.title]);
      assert.deepEqual(meta["og:site_name"], [expected.title]);
      assert.deepEqual(meta["og:description"], meta["description"]);
      assert.deepEqual(meta["og:locale"], [expected.locale]);
      assert.deepEqual(meta["og:locale:alternate"], [expected.otherLocale]);
      assert.deepEqual(meta["twitter:card"], ["summary_large_image"]);
    });

    test("has a 1200x630 JPEG preview image with no metadata", async () => {
      const { meta } = await headOf(expected.path);
      const [url] = meta["og:image"] ?? [];
      assert.ok(url);
      assert.deepEqual(meta["og:image:type"], ["image/jpeg"]);
      assert.deepEqual(meta["og:image:width"], ["1200"]);
      assert.deepEqual(meta["og:image:height"], ["630"]);
      assert.deepEqual(meta["og:image:alt"], [expected.imageAlt]);

      const response = await fetch(local(url));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      const bytes = new Uint8Array(await response.arrayBuffer());

      const page = await browser.newPage();
      await page.goto(local(url));
      const size = await page.evaluate(() => {
        const image = document.images[0];
        return image && { width: image.naturalWidth, height: image.naturalHeight };
      });
      await page.close();
      assert.deepEqual(size, { width: 1200, height: 630 });

      // No EXIF or other APPn segments beyond JFIF: nothing about the capture leaks.
      const leaked = metadataSegments(bytes).filter((segment) => !segment.id.startsWith("JFIF"));
      assert.deepEqual(leaked, []);
    });
  });
}

describe("both languages share one preview image", () => {
  test("og:image is the same file on / and /en/", async () => {
    const [ja, en] = await Promise.all([headOf("/"), headOf("/en/")]);
    assert.deepEqual(ja.meta["og:image"], en.meta["og:image"]);
  });
});

describe("/sitemap.xml", () => {
  test("is well-formed XML listing the two top pages with their alternates", async () => {
    const response = await fetch(`${server.url}/sitemap.xml`);
    assert.equal(response.status, 200);
    const xml = await response.text();

    const page = await browser.newPage();
    const result = await page.evaluate((source) => {
      const document = new DOMParser().parseFromString(source, "application/xml");
      if (document.querySelector("parsererror")) return null;
      return [...document.getElementsByTagName("url")].map((url) => ({
        loc: url.getElementsByTagName("loc")[0]?.textContent,
        alternates: [...url.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "link")].map(
          (link) => `${link.getAttribute("hreflang")} ${link.getAttribute("href")}`,
        ),
      }));
    }, xml);
    await page.close();

    const alternates = [`ja ${SITE}/`, `en ${SITE}/en/`, `x-default ${SITE}/`];
    assert.deepEqual(result, [
      { loc: `${SITE}/`, alternates },
      { loc: `${SITE}/en/`, alternates },
    ]);
  });

  test("lists only pages that exist", async () => {
    for (const path of ["/", "/en/"]) {
      assert.equal((await fetch(`${server.url}${path}`)).status, 200, path);
    }
  });
});

describe("/robots.txt", () => {
  test("keeps /errorpage/ out and points to the sitemap", async () => {
    const response = await fetch(`${server.url}/robots.txt`);
    assert.equal(response.status, 200);
    const lines = (await response.text()).split("\n");
    assert.ok(lines.includes("User-agent: *"));
    assert.deepEqual(
      lines.filter((line) => line.startsWith("Disallow:")),
      ["Disallow: /errorpage/"],
    );
    assert.ok(lines.includes(`Sitemap: ${SITE}/sitemap.xml`));
  });
});
