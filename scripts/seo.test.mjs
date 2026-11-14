// Tests for the search-engine metadata (src/lib/seo.ts): URLs, the sitemap
// and robots.txt, and the committed original of the Open Graph image.
// Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { URL, fileURLToPath } from "node:url";
import { metadataSegments, stripJpegMetadata } from "./lib/jpeg.mjs";
import {
  OG_LOCALES,
  ROBOTS_DISALLOW,
  alternatesOf,
  jsonLdText,
  pageUrl,
  robotsTxt,
  sitemapXml,
  websiteJsonLd,
} from "../src/lib/seo.ts";

const SITE = new URL("https://archive.setagayafes.org");

describe("JSON-LD", () => {
  test("no value can end the script element or open a comment in it", () => {
    const data = { name: "</script><script>alert(1)</script>", note: "<!-- a < b -->" };
    const text = jsonLdText(data);
    assert.equal(text.includes("<"), false);
    assert.deepEqual(JSON.parse(text), data);
  });

  test("names the site in each language, with the home page as its URL", () => {
    assert.deepEqual(JSON.parse(websiteJsonLd("en", SITE)), {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Setagaya Festival Archive",
      alternateName: ["世田谷祭アーカイブ"],
      url: "https://archive.setagayafes.org/",
      inLanguage: "en",
    });
  });
});

describe("URLs", () => {
  test("each language has its own top page", () => {
    assert.equal(pageUrl("ja", SITE), "https://archive.setagayafes.org/");
    assert.equal(pageUrl("en", SITE), "https://archive.setagayafes.org/en/");
  });

  test("the alternates list both languages, with Japanese as the default", () => {
    assert.deepEqual(alternatesOf(SITE), [
      { hreflang: "ja", href: "https://archive.setagayafes.org/" },
      { hreflang: "en", href: "https://archive.setagayafes.org/en/" },
      { hreflang: "x-default", href: "https://archive.setagayafes.org/" },
    ]);
  });

  test("Open Graph locales are language_TERRITORY", () => {
    assert.deepEqual(OG_LOCALES, { ja: "ja_JP", en: "en_US" });
  });
});

describe("sitemap", () => {
  const xml = sitemapXml(SITE);

  test("lists exactly the two top pages", () => {
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
    assert.deepEqual(locs, [
      "https://archive.setagayafes.org/",
      "https://archive.setagayafes.org/en/",
    ]);
  });

  test("gives every URL all its language versions", () => {
    for (const url of xml.split("<url>").slice(1)) {
      for (const { hreflang, href } of alternatesOf(SITE)) {
        assert.ok(
          url.includes(`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`),
          hreflang,
        );
      }
    }
  });

  test("declares the sitemap and xhtml namespaces", () => {
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /);
    assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
    assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  });
});

describe("robots.txt", () => {
  const lines = robotsTxt(SITE).split("\n");

  test("keeps the rule of the host's previous robots.txt", () => {
    assert.ok(lines.includes("Disallow: /errorpage/"));
  });

  test("blocks nothing else, so crawlers can still read the festival sites' noindex", () => {
    const disallowed = lines.filter((line) => line.startsWith("Disallow:"));
    assert.deepEqual(
      disallowed,
      ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    );
    assert.ok(!disallowed.includes("Disallow: /"));
  });

  test("points to the sitemap with an absolute URL", () => {
    assert.ok(lines.includes("Sitemap: https://archive.setagayafes.org/sitemap.xml"));
  });
});

// The original is published with the repository. Design tools write the
// author's name and their own ids into XMP (Canva did), so it must be committed
// already stripped: `stripJpegMetadata` from scripts/lib/jpeg.mjs.
describe("src/assets/og/", async () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src/assets/og");
  const files = await readdir(dir);

  test("holds only the original JPEG", () => {
    assert.deepEqual(files, ["ogp.jpg"]);
  });

  for (const file of files) {
    test(`${file} carries no metadata`, async () => {
      const bytes = new Uint8Array(await readFile(join(dir, file)));
      const ids = metadataSegments(bytes).map(({ marker, id }) => `${marker.toString(16)} ${id}`);
      assert.ok(
        ids.every((id) => /^e0 JFIF|^e2 ICC_PROFILE|^ee Adobe/.test(id)),
        `metadata left in ${file}: ${ids.join(", ")}`,
      );
      assert.deepEqual(stripJpegMetadata(bytes), bytes);
    });
  }
});
