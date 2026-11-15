// Tests for the error pages' words (src/i18n/errors.ts). The built pages are
// checked in a browser by e2e/errors.e2e.mjs.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ERROR_CODES,
  ERROR_UI,
  LATEST_FESTIVAL_URL,
  REASON_PHRASES,
  SPECIFIC_ERROR_CODES,
  errorMessageOf,
  errorPagePath,
  errorPageTitle,
} from "../src/i18n/errors.ts";

/** Hiragana, katakana, kanji and full-width forms: none may appear in an English string. */
const JAPANESE = /[぀-ヿ㐀-鿿＀-￯]/;

describe("error pages", () => {
  test("cover the 33 codes from 400 to 511, once each and in order", () => {
    assert.equal(ERROR_CODES.length, 33);
    assert.deepEqual(
      [...ERROR_CODES],
      [...ERROR_CODES].toSorted((a, b) => a - b),
    );
    assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length);
    assert.ok(ERROR_CODES.every((code) => code >= 400 && code <= 511));
  });

  test("are published as /errors/NNN.html", () => {
    assert.equal(errorPagePath(404), "/errors/404.html");
  });

  test("give their own words to 403, 404, 410, 500 and 503 only", () => {
    assert.deepEqual(SPECIFIC_ERROR_CODES, [403, 404, 410, 500, 503]);
    const shared = (/** @type {number} */ low, /** @type {number} */ high) =>
      ERROR_CODES.filter(
        (code) => code >= low && code < high && !SPECIFIC_ERROR_CODES.includes(code),
      ).map((code) => errorMessageOf(code));
    const client = shared(400, 500);
    const server = shared(500, 600);
    assert.ok(
      client.every((message) => message === client[0]),
      "one message for 4xx",
    );
    assert.ok(
      server.every((message) => message === server[0]),
      "one message for 5xx",
    );
    assert.notDeepEqual(client[0], server[0]);
    const specific = SPECIFIC_ERROR_CODES.map((code) => errorMessageOf(code).ja.title);
    assert.equal(new Set([...specific, client[0]?.ja.title, server[0]?.ja.title]).size, 7);
  });

  test("use the 404 words decided in Issue #70", () => {
    assert.deepEqual(errorMessageOf(404), {
      ja: {
        title: "お探しのページは見つかりませんでした",
        lead: "URL が変わったか、ページが削除された可能性があります。",
      },
      en: {
        title: "Page not found",
        lead: "The address may have changed, or the page may have been removed.",
      },
    });
    assert.deepEqual(ERROR_UI, {
      ja: { home: "過去の世田谷祭の一覧へ", latest: "最新の世田谷祭（公式サイト）へ" },
      en: { home: "Browse past festivals", latest: "Latest festival (official site)" },
    });
    assert.equal(LATEST_FESTIVAL_URL, "https://setagayafes.org/");
  });

  for (const code of ERROR_CODES) {
    test(`${code}: words in both languages, English without Japanese`, () => {
      const { ja, en } = errorMessageOf(code);
      for (const text of [ja.title, ja.lead, en.title, en.lead]) assert.ok(text.length > 0);
      for (const text of [en.title, en.lead, REASON_PHRASES[code]]) {
        assert.doesNotMatch(text, JAPANESE, text);
      }
      assert.match(errorPageTitle(code), new RegExp(`^${code} ${ja.title}（${en.title}）｜`));
    });
  }
});
