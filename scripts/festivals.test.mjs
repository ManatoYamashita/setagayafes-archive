// Tests for the festival data (src/data/festivals.ts, src/data/related-sites.ts).
// Run with `pnpm test`. Node reads the TypeScript files directly (type stripping).
//
// The expectations below are copied from Issue #1, the source of truth. When
// a festival is added, add its folder to SERVER_FOLDERS and bump LATEST_ROUND.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ERA_NAMES,
  FESTIVALS,
  STATUS_LABELS,
  eraOf,
  festivalNameOf,
  latestFestival,
  linkOf,
  ordinalOf,
  pathOf,
  titleOf,
  yearOf,
} from "../src/data/festivals.ts";
import { RELATED_SITES } from "../src/data/related-sites.ts";

const FIRST_ROUND = 75;
const LATEST_ROUND = 97;

/**
 * Festival folders in the archive's public folder on the server
 * (`ls ~/www/archive`, 2026-11-06). The 87th has none.
 */
const SERVER_FOLDERS = [
  "75th", "76th", "77th", "78th", "79th", "80th", "81st", "82nd", "83rd", "84th", "85th",
  "86th", "88th", "89th", "90th", "91st", "92nd", "93rd", "94th", "95th", "96th", "97th",
]; // prettier-ignore

/**
 * @param {string} iso
 * @returns {Date}
 */
function parseDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  assert.ok(!Number.isNaN(date.getTime()), `${iso} is not a date`);
  assert.equal(date.toISOString().slice(0, 10), iso, `${iso} is not a calendar date`);
  return date;
}

describe("FESTIVALS", () => {
  test("lists every round from the 75th to the latest, once and in order", () => {
    const rounds = FESTIVALS.map((festival) => festival.round);
    const expected = Array.from(
      { length: LATEST_ROUND - FIRST_ROUND + 1 },
      (_, i) => FIRST_ROUND + i,
    );
    assert.deepEqual(rounds, expected);
  });

  for (const festival of FESTIVALS) {
    describe(ordinalOf(festival.round), () => {
      test("dates are calendar dates in the festival's year, start <= end, at most 3 days", () => {
        const start = parseDate(festival.dates.start);
        const end = parseDate(festival.dates.end);
        assert.equal(start.getUTCFullYear(), yearOf(festival.round));
        const days = (end.getTime() - start.getTime()) / 86_400_000;
        assert.ok(days >= 0 && days <= 2, `spans ${days + 1} days`);
      });

      test("theme has both languages; a Latin-script theme is the same in both", () => {
        if (festival.theme === null) return;
        assert.ok(festival.theme.ja.length > 0 && festival.theme.en.length > 0);
        // Hiragana, katakana and kanji mean the theme needs an English rendering.
        const isJapanese = /[぀-ヿ㐀-鿿]/.test(festival.theme.ja);
        if (isJapanese) assert.notEqual(festival.theme.en, festival.theme.ja);
        else assert.equal(festival.theme.en, festival.theme.ja);
      });

      test("a status reason is given only for a cancelled festival", () => {
        assert.equal("statusReason" in festival, festival.status === "cancelled");
      });

      test("links to its folder on the server, or to an external page when it has none", () => {
        const folder = ordinalOf(festival.round);
        if (SERVER_FOLDERS.includes(folder)) {
          assert.equal("externalLink" in festival, false);
          assert.equal(linkOf(festival), `/${folder}/`);
        } else {
          assert.ok("externalLink" in festival, `no folder ${folder} and no external link`);
        }
      });
    });
  }

  test("only the 75th has an unknown theme and estimated dates", () => {
    assert.deepEqual(
      FESTIVALS.filter((festival) => festival.theme === null).map((festival) => festival.round),
      [75],
    );
    assert.deepEqual(
      FESTIVALS.filter((festival) => "estimated" in festival.dates).map(
        (festival) => festival.round,
      ),
      [75],
    );
  });

  test("statuses match Issue #1", () => {
    const notHeld = Object.fromEntries(
      FESTIVALS.filter((festival) => festival.status !== "held").map((festival) => [
        festival.round,
        festival.status,
      ]),
    );
    assert.deepEqual(notHeld, { 90: "cancelled", 91: "cancelled", 92: "online", 93: "hybrid" });
  });

  test("the 87th links to the Wayback Machine capture after the festival", () => {
    const the87th = FESTIVALS.find((festival) => festival.round === 87);
    assert.equal(
      the87th && linkOf(the87th),
      "https://web.archive.org/web/20161101171330/http://setagayafes.org/87/",
    );
  });

  test("the 96th links to the static copy, not the old host", () => {
    const the96th = FESTIVALS.find((festival) => festival.round === 96);
    assert.equal(the96th && linkOf(the96th), "/96th/");
  });

  test("the latest festival is the hero", () => {
    assert.equal(latestFestival().round, LATEST_ROUND);
  });

  test("every status that needs a tag has one in both languages", () => {
    assert.equal(STATUS_LABELS.held, null);
    for (const status of /** @type {const} */ (["online", "hybrid", "cancelled"])) {
      assert.ok(STATUS_LABELS[status].ja && STATUS_LABELS[status].en);
    }
  });
});

describe("derived values", () => {
  test("year is round + 1929", () => {
    assert.equal(yearOf(75), 2004);
    assert.equal(yearOf(97), 2026);
  });

  test("the university was renamed between the 79th and the 80th", () => {
    assert.equal(eraOf(79), "musashi");
    assert.equal(eraOf(80), "tcu");
    assert.equal(ERA_NAMES.musashi.ja, "武蔵工業大学");
    assert.equal(ERA_NAMES.tcu.en, "Tokyo City University");
  });

  test("the festival's name changed at the 80th, 82nd and 83rd", () => {
    /** @type {Record<number, string>} */
    const expected = {
      75: "MI-TECH祭",
      79: "MI-TECH祭",
      80: "TCU祭",
      81: "TCU祭",
      82: "TCU世田谷祭",
      83: "世田谷祭",
      97: "世田谷祭",
    };
    for (const [round, name] of Object.entries(expected)) {
      assert.equal(festivalNameOf(Number(round)).ja, name, `round ${round}`);
    }
    assert.equal(festivalNameOf(97).en, "Setagaya Festival");
  });

  test("ordinals follow English rules, including 11th–13th", () => {
    /** @type {Record<number, string>} */
    const expected = {
      81: "81st",
      82: "82nd",
      83: "83rd",
      84: "84th",
      101: "101st",
      111: "111th",
      112: "112th",
      113: "113th",
      121: "121st",
    };
    for (const [round, ordinal] of Object.entries(expected)) {
      assert.equal(ordinalOf(Number(round)), ordinal);
    }
    assert.equal(pathOf(98), "/98th/");
  });

  test("the card title falls back to the festival's name when the theme is unknown", () => {
    const [the75th] = FESTIVALS;
    assert.equal(titleOf(the75th, "ja"), "MI-TECH祭");
    assert.equal(titleOf(the75th, "en"), "MI-TECH Festival");
  });
});

describe("RELATED_SITES", () => {
  test("ids and paths are unique", () => {
    assert.equal(new Set(RELATED_SITES.map((site) => site.id)).size, RELATED_SITES.length);
    assert.equal(new Set(RELATED_SITES.map((site) => site.path)).size, RELATED_SITES.length);
  });

  test("dates are calendar dates with start <= end", () => {
    for (const site of RELATED_SITES) {
      if (!("dates" in site)) continue;
      assert.ok(parseDate(site.dates.start) <= parseDate(site.dates.end), site.id);
    }
  });

  test("the Todoroki Festival sites wait for Issue #2; the committee site does not", () => {
    /** @type {Record<string, number | undefined>} */
    const blockedBy = Object.fromEntries(
      RELATED_SITES.map((site) => [site.id, "blockedBy" in site ? site.blockedBy : undefined]),
    );
    assert.deepEqual(blockedBy, {
      "todoroki-2011": 2,
      "todoroki-2012": 2,
      "committee-2011": undefined,
    });
  });
});
