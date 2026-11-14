// Tests for scripts/lib/precompress.mjs. A real Apache serving the .gz files
// is checked by scripts/check-htaccess.mjs (`pnpm check:htaccess`).

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, test } from "node:test";
import { gunzipSync } from "node:zlib";
import { PRECOMPRESSED, gzip, precompressedProblem } from "./lib/precompress.mjs";
import { forbiddenFileReason } from "./lib/rules.mjs";

const page = Buffer.from("<!doctype html><title>世田谷祭</title>".repeat(50));

describe("PRECOMPRESSED", () => {
  test("covers the HTML pages only", () => {
    for (const path of ["index.html", "en/index.html"]) assert.ok(PRECOMPRESSED.test(path), path);
    for (const path of ["robots.txt", "sitemap.xml", "index.html.gz", "favicon.svg"]) {
      assert.ok(!PRECOMPRESSED.test(path), path);
    }
  });
});

describe("gzip", () => {
  test("inflates back to the page, and is the same bytes every time", () => {
    const compressed = gzip(page);
    assert.deepEqual(gunzipSync(compressed), page);
    assert.deepEqual(gzip(page), compressed);
    assert.ok(compressed.length < page.length / 3);
  });
});

describe("precompressedProblem", () => {
  test("accepts a copy of the file next to it", () => {
    assert.equal(precompressedProblem(gzip(page), page), null);
  });
  test("rejects a stale, broken or orphaned copy", () => {
    assert.match(String(precompressedProblem(gzip(Buffer.from("old")), page)), /differs/);
    assert.match(String(precompressedProblem(Buffer.from("not gzip"), page)), /not valid gzip/);
    assert.match(String(precompressedProblem(gzip(page), undefined)), /no uncompressed/);
  });
});

describe("forbiddenFileReason", () => {
  test("allows the pre-compressed pages but still rejects other archives", () => {
    assert.equal(forbiddenFileReason("index.html.gz"), null);
    assert.equal(forbiddenFileReason("en/index.html.gz"), null);
    for (const path of ["backup.gz", "index.html.bak.gz", "site.sql.gz", "index.htm.gz"]) {
      assert.notEqual(forbiddenFileReason(path), null, path);
    }
  });
});
