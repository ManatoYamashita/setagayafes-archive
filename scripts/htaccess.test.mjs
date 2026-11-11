// Tests for scripts/lib/htaccess.mjs. The headers a real Apache returns are
// checked by scripts/check-htaccess.mjs (`pnpm check:htaccess`).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import {
  ARCHIVE_HOST,
  ERROR_CODES,
  buildHtaccess,
  pageCsp,
  pathPatterns,
  styleHashesOf,
} from "./lib/htaccess.mjs";

const FILES = [
  "index.html",
  "en/index.html",
  "_astro/97th.abc_123.avif",
  "_astro/97th.abc_456.jpeg",
  "favicon.svg",
  "robots.txt",
  "sitemap.xml",
];

const sha256 = (/** @type {string} */ text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

describe("styleHashesOf", () => {
  test("hashes the exact content of each <style>", () => {
    const html = "<style>a{color:red}</style><p>x</p><STYLE media=print>\nb{}\n</STYLE>";
    assert.deepEqual(styleHashesOf(html), [sha256("a{color:red}"), sha256("\nb{}\n")]);
  });

  test("hashes non-ASCII CSS as UTF-8", () => {
    assert.deepEqual(styleHashesOf('<style>a::after{content:"。"}</style>'), [
      sha256('a::after{content:"。"}'),
    ]);
  });

  test("ignores elements whose name only starts with style", () => {
    assert.deepEqual(styleHashesOf("<styles>x</styles>"), []);
  });
});

describe("pageCsp", () => {
  test("allows nothing but own images and the hashed inline styles", () => {
    assert.equal(
      pageCsp(["'sha256-b'", "'sha256-a'", "'sha256-b'"]),
      "default-src 'none'; script-src 'none'; style-src 'sha256-a' 'sha256-b'; img-src 'self'; " +
        "connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  test("never falls back to 'unsafe-inline'", () => {
    assert.doesNotMatch(pageCsp([]), /unsafe/);
    assert.match(pageCsp([]), /style-src 'none'/);
  });
});

describe("pathPatterns", () => {
  const patterns = pathPatterns([...FILES, ".htaccess"]);
  const pages = new RegExp(patterns.pages);
  const own = new RegExp(patterns.own);
  const immutable = new RegExp(patterns.immutable);

  test("the top pages are /, /en/ and their index.html", () => {
    for (const path of ["/", "/index.html", "/en/", "/en/index.html"]) {
      assert.ok(pages.test(path), path);
    }
  });

  test("nothing else is a top page", () => {
    for (const path of [
      "/en",
      "/enx/",
      "/en/x",
      "/78th/",
      "/78th/index.html",
      "/index.html.bak",
      "/robots.txt",
      "/_astro/97th.abc_123.avif",
    ]) {
      assert.ok(!pages.test(path), path);
    }
  });

  test("own paths are the published files and folders", () => {
    for (const path of [
      "/",
      "/index.html",
      "/en/",
      "/_astro/97th.abc_123.avif",
      "/favicon.svg",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      assert.ok(own.test(path), path);
    }
  });

  test("past festival sites and the server's own folders are not own paths", () => {
    for (const path of [
      "/78th/",
      "/96th/index.html",
      "/errorpage/404.html",
      "/img/87th.JPG",
      "/css/style.css",
      "/robots.txt.bak",
      "/.htaccess",
      "/favicon.svgz",
    ]) {
      assert.ok(!own.test(path), path);
    }
  });

  test("only /_astro/ files are cached as immutable", () => {
    assert.ok(immutable.test("/_astro/97th.abc_123.avif"));
    assert.ok(!immutable.test("/_astro/"));
    assert.ok(!immutable.test("/favicon.svg"));
  });
});

describe("buildHtaccess", () => {
  const htaccess = buildHtaccess({ files: FILES, styleHashes: ["'sha256-a'"] });

  test("serves the static error pages", () => {
    for (const code of ERROR_CODES) {
      assert.ok(htaccess.includes(`ErrorDocument ${code} /errorpage/${code}.html\n`), `${code}`);
    }
    assert.doesNotMatch(htaccess, /\.php/);
  });

  test("never sets a security header outside an <If>", () => {
    let depth = 0;
    for (const line of htaccess.split("\n")) {
      if (/^<(If|Else)\b/.test(line)) depth++;
      if (/^<\/(If|Else)>/.test(line)) depth--;
      if (/^\s*Header\b/.test(line)) assert.ok(depth > 0, line);
    }
  });

  test("keeps noindex for everything but the top pages", () => {
    assert.match(
      htaccess,
      /<If "%\{REQUEST_URI\} =~ m#[^"]+#">\n {2}Header always unset X-Robots-Tag\n<\/If>\n<Else>\n {2}Header always set X-Robots-Tag "noindex, noimageindex"\n<\/Else>/,
    );
  });

  test("sends HSTS only for the archive host, without includeSubDomains", () => {
    assert.ok(htaccess.includes(`<If "%{HTTP_HOST} == '${ARCHIVE_HOST}'">`));
    const hsts = htaccess.split("\n").filter((line) => /Strict-Transport-Security/.test(line));
    assert.deepEqual(hsts, ['  Header always set Strict-Transport-Security "max-age=31536000"']);
  });

  test("sends the page CSP with the given style hashes", () => {
    assert.ok(htaccess.includes(`Content-Security-Policy "${pageCsp(["'sha256-a'"])}"`));
  });

  test("has balanced containers", () => {
    for (const name of ["If", "Else", "IfModule"]) {
      const open = htaccess.match(new RegExp(`^<${name}[ >]`, "gm"))?.length ?? 0;
      const close = htaccess.match(new RegExp(`^</${name}>`, "gm"))?.length ?? 0;
      assert.equal(open, close, name);
    }
  });
});
