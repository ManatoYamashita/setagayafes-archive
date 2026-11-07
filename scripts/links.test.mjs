// Tests for the link checks (scripts/lib/links.mjs, scripts/lib/site.mjs).
// Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { URL } from "node:url";
import {
  checkLinks,
  fileForPath,
  idsIn,
  linksInMarkup,
  linksInRobotsTxt,
  servedPath,
} from "./lib/links.mjs";
import { SITE, archivedPaths } from "./lib/site.mjs";

const site = new URL("https://archive.example");

/**
 * @param {Record<string, string>} documents
 * @param {string[]} [otherFiles]
 */
function check(documents, otherFiles = []) {
  return checkLinks({
    documents: new Map(Object.entries(documents)),
    files: new Set([...Object.keys(documents), ...otherFiles]),
    site,
    serverPaths: ["/78th/", "/tfa/"],
  });
}

describe("linksInMarkup", () => {
  test("finds href, src, srcset candidates and URL metas", () => {
    const html = [
      '<a href="/78th/">78</a>',
      '<link rel="icon" href="/favicon.svg">',
      '<img src="/a.avif" srcset="/a-320.avif 320w, /a-640.avif 640w">',
      '<meta property="og:image" content="https://archive.example/og.jpeg">',
      '<meta name="description" content="/not-a-link">',
    ].join("");
    assert.deepEqual(
      linksInMarkup(html).map((link) => link.url),
      [
        "/78th/",
        "/favicon.svg",
        "/a.avif",
        "/a-320.avif",
        "/a-640.avif",
        "https://archive.example/og.jpeg",
      ],
    );
  });

  test("decodes character references and reads quoted values like a browser", () => {
    const urls = linksInMarkup('<a title="a>b" href="/x?a=1&amp;b=2">x</a>').map((l) => l.url);
    assert.deepEqual(urls, ["/x?a=1&b=2"]);
  });

  test("reads the <loc> of a sitemap", () => {
    const xml = "<urlset><url><loc> https://archive.example/en/ </loc></url></urlset>";
    assert.deepEqual(
      linksInMarkup(xml).map((link) => link.url),
      ["https://archive.example/en/"],
    );
  });

  test("ignores links inside comments", () => {
    assert.deepEqual(linksInMarkup('<!-- <a href="/gone/">x</a> -->'), []);
  });
});

describe("helpers", () => {
  test("robots.txt sitemaps", () => {
    assert.deepEqual(
      linksInRobotsTxt("User-agent: *\nSitemap: https://archive.example/sitemap.xml\n").map(
        (link) => link.url,
      ),
      ["https://archive.example/sitemap.xml"],
    );
  });

  test("served paths and the files that answer them", () => {
    assert.equal(servedPath("index.html"), "/");
    assert.equal(servedPath("en/index.html"), "/en/");
    assert.equal(servedPath("sitemap.xml"), "/sitemap.xml");
    assert.equal(fileForPath("/"), "index.html");
    assert.equal(fileForPath("/en/"), "en/index.html");
    assert.equal(fileForPath("/_astro/a.avif"), "_astro/a.avif");
  });

  test("ids", () => {
    assert.deepEqual(
      idsIn('<h2 id="archive-title">x</h2><p id=a>'),
      new Set(["archive-title", "a"]),
    );
  });
});

describe("checkLinks", () => {
  test("accepts links to files in dist/, archived sites and other hosts", () => {
    const result = check(
      {
        "index.html": [
          '<a href="/en/">en</a>',
          '<a href="/78th/">78</a>',
          '<a href="/tfa/old/page.html">tfa</a>',
          '<a href="https://x.com/someone">x</a>',
          '<a href="mailto:a@example.com">mail</a>',
          '<img src="/_astro/a.avif">',
          '<link rel="canonical" href="https://archive.example/">',
          '<h2 id="top">t</h2><a href="#top">top</a>',
        ].join(""),
        "en/index.html": '<a href="../">ja</a><a href="/#top">top</a>',
        "robots.txt": "Sitemap: https://archive.example/sitemap.xml",
        "sitemap.xml": "<urlset><url><loc>https://archive.example/en/</loc></url></urlset>",
      },
      ["_astro/a.avif"],
    );
    assert.deepEqual(result.broken, []);
    assert.deepEqual(result.server, [
      "https://archive.example/78th/",
      "https://archive.example/tfa/old/page.html",
    ]);
    assert.deepEqual(result.external, ["https://x.com/someone"]);
  });

  test("reports missing files, a missing trailing slash and missing fragments", () => {
    const { broken } = check({
      "index.html": [
        '<img src="/_astro/gone.avif">',
        '<a href="/en">en</a>',
        '<a href="/79th/">not archived</a>',
        '<a href="#nowhere">x</a>',
        '<meta property="og:image" content="https://archive.example/og.jpeg">',
      ].join(""),
      "en/index.html": "",
      "robots.txt": "Sitemap: https://archive.example/sitemap.xml",
    });
    assert.equal(broken.length, 6);
    assert.match(broken[0] ?? "", /\/_astro\/gone\.avif \(no such file/);
    assert.match(broken[1] ?? "", /\/en \(no such file in dist\/; add the trailing slash\)/);
    assert.match(broken[2] ?? "", /\/79th\//);
    assert.match(broken[3] ?? "", /no element with id "nowhere"/);
    assert.match(broken[4] ?? "", /og\.jpeg/);
    assert.match(broken[5] ?? "", /^robots\.txt: Sitemap: .*sitemap\.xml/);
  });
});

describe("site", () => {
  test("SITE matches `site` in astro.config.mjs", async () => {
    const config = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");
    assert.match(config, new RegExp(`site: "${SITE.origin.replaceAll(".", "\\.")}"`));
  });

  test("archived sites are every festival folder and every related site", () => {
    const paths = archivedPaths();
    assert.ok(paths.includes("/75th/"));
    assert.ok(paths.includes("/97th/"));
    assert.ok(paths.includes("/tfa/"));
    assert.ok(paths.includes("/todoroki/2011/"));
    assert.ok(!paths.includes("/87th/"), "the 87th has no folder; it links to the Wayback Machine");
  });
});
