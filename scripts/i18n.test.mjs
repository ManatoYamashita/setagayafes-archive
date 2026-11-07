// Tests for the page's wording in each language (src/i18n/ui.ts).
// Run with `pnpm test`. Node reads the TypeScript file directly (type stripping).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FESTIVALS, festivalNameOf } from "../src/data/festivals.ts";
import {
  HOME_PATHS,
  LANGS,
  LANG_NAMES,
  UI,
  headingOf,
  otherLang,
  roundLabel,
} from "../src/i18n/ui.ts";

/** Hiragana, katakana and kanji: text that only a Japanese reader can read. */
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/** @param {number} round */
const festival = (round) => {
  const found = FESTIVALS.find((item) => item.round === round);
  assert.ok(found, `festival ${round}`);
  return found;
};

describe("languages", () => {
  test("Japanese is at / and English at /en/", () => {
    assert.deepEqual(LANGS, ["ja", "en"]);
    assert.deepEqual(HOME_PATHS, { ja: "/", en: "/en/" });
  });

  test("the switch names the other language in that language", () => {
    assert.equal(otherLang("ja"), "en");
    assert.equal(otherLang("en"), "ja");
    assert.equal(LANG_NAMES.ja, "日本語");
    assert.equal(LANG_NAMES.en, "English");
  });
});

describe("UI", () => {
  test("both languages have the same words", () => {
    assert.deepEqual(Object.keys(UI.en).toSorted(), Object.keys(UI.ja).toSorted());
  });

  test("the English words contain no Japanese", () => {
    const en = UI.en;
    const texts = {
      ...Object.fromEntries(Object.entries(en).filter(([, value]) => typeof value === "string")),
      description: en.description({ round: 75, year: 2004 }),
      heroLead: en.heroLead("97th", "Setagaya Festival"),
      visit: en.visit("97th"),
      showing: en.showing(22),
    };
    assert.deepEqual(Object.keys(texts).toSorted(), Object.keys(en).toSorted());
    for (const [key, text] of Object.entries(texts)) assert.doesNotMatch(text, JAPANESE, key);
  });

  test("the description names the oldest festival", () => {
    assert.match(UI.ja.description({ round: 75, year: 2004 }), /第75回（2004年）/);
    assert.match(UI.en.description({ round: 75, year: 2004 }), /since the 75th \(2004\)/);
  });

  test("the English count is singular for one festival", () => {
    assert.equal(UI.en.showing(1), "Showing 1 festival");
    assert.equal(UI.en.showing(22), "Showing 22 festivals");
    assert.equal(UI.ja.showing(22), "22件を表示中");
  });
});

describe("roundLabel", () => {
  test("is 第N回 in Japanese and an ordinal in English", () => {
    assert.equal(roundLabel(97, "ja"), "第97回");
    assert.equal(roundLabel(97, "en"), "97th");
    assert.equal(roundLabel(81, "en"), "81st");
    assert.equal(roundLabel(82, "en"), "82nd");
    assert.equal(roundLabel(83, "en"), "83rd");
  });
});

describe("headingOf", () => {
  test("Japanese shows the original theme only", () => {
    assert.deepEqual(headingOf(festival(77), "ja"), { text: "虹", lang: "ja" });
  });

  test("English keeps a Japanese theme as the title, with its translation", () => {
    assert.deepEqual(headingOf(festival(77), "en"), {
      text: "虹",
      lang: "ja",
      translation: "Rainbow",
    });
  });

  test("a theme in Latin script is shown once, in English", () => {
    assert.deepEqual(headingOf(festival(90), "en"), { text: "COSMOS", lang: "en" });
  });

  test("an unknown theme falls back to the festival's name", () => {
    assert.deepEqual(headingOf(festival(75), "en"), {
      text: festivalNameOf(75).en,
      lang: "en",
    });
    assert.deepEqual(headingOf(festival(75), "ja"), { text: "MI-TECH祭", lang: "ja" });
  });

  test("every English heading is either English or marked as Japanese", () => {
    for (const item of FESTIVALS) {
      const heading = headingOf(item, "en");
      if (heading.lang === "en") {
        assert.doesNotMatch(heading.text, JAPANESE, `round ${item.round}`);
      } else {
        assert.ok(heading.translation, `round ${item.round} has a translation`);
        assert.doesNotMatch(heading.translation, JAPANESE, `round ${item.round}`);
      }
    }
  });
});
