// Tests for scripts/lib/add-festival.mjs: the form "新しい回を追加" (Issue #77).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runInNewContext } from "node:vm";
import { latestFestival } from "../src/data/festivals.ts";
import {
  addToCaptureTargets,
  addToData,
  addToTests,
  describeFestival,
  parseAnswers,
  renderEntry,
} from "./lib/add-festival.mjs";

const root = join(import.meta.dirname, "..");

/** @param {Partial<import("./lib/add-festival.mjs").FormAnswers>} [changes] */
const answers = (changes = {}) => ({
  round: "98",
  startDate: "2027-11-13",
  endDate: "2027-11-14",
  themeJa: "花火",
  themeEn: "Fireworks",
  commonTheme: "ともに進もう",
  status: "通常",
  reasonJa: "",
  reasonEn: "",
  settleSeconds: "3",
  ...changes,
});

/** @param {Partial<import("./lib/add-festival.mjs").FormAnswers>} [changes] */
function ok(changes) {
  const result = parseAnswers(answers(changes), 97);
  assert.ok("festival" in result, JSON.stringify(result));
  return result.festival;
}

/** @param {Partial<import("./lib/add-festival.mjs").FormAnswers>} changes */
function errors(changes) {
  const result = parseAnswers(answers(changes), 97);
  assert.ok("errors" in result, "expected errors");
  return result.errors.join("\n");
}

describe("parseAnswers", () => {
  test("turns the answers into the next festival", () => {
    assert.deepEqual(ok(), {
      round: 98,
      folder: "98th",
      dates: { start: "2027-11-13", end: "2027-11-14" },
      theme: { ja: "花火", en: "Fireworks" },
      translated: true,
      commonTheme: "ともに進もう",
      status: "held",
      statusReason: undefined,
      settleSeconds: 3,
    });
  });

  test("accepts 第98回 and stray spaces", () => {
    const festival = ok({ round: " 第98回 ", themeJa: "  花火  " });
    assert.equal(festival.round, 98);
    assert.equal(festival.theme.ja, "花火");
  });

  test("only the next round can be added", () => {
    assert.match(errors({ round: "99" }), /「回」は 98 です/);
    assert.match(errors({ round: "97" }), /「回」は 98 です/);
    assert.match(errors({ round: "九十八" }), /数字で/);
  });

  test("checks the dates", () => {
    assert.match(errors({ startDate: "2027/11/13" }), /2027-11-13 の形/);
    assert.match(errors({ endDate: "2027-02-30" }), /ない日付/);
    assert.match(errors({ startDate: "2027-11-14", endDate: "2027-11-13" }), /より前/);
    assert.match(errors({ startDate: "2026-11-13", endDate: "2026-11-14" }), /2027 年の開催/);
  });

  test("the Japanese theme is required, the English is not", () => {
    assert.match(errors({ themeJa: " " }), /キャンパステーマ（日本語）/);
    const festival = ok({ themeEn: "" });
    assert.deepEqual(festival.theme, { ja: "花火", en: "花火" });
    assert.equal(festival.translated, false);
  });

  test("a cancelled festival needs a reason, and only it may have one", () => {
    assert.match(errors({ status: "中止" }), /中止の理由（日本語）/);
    assert.deepEqual(ok({ status: "中止", reasonJa: "台風のため中止" }).statusReason, {
      ja: "台風のため中止",
      en: "台風のため中止",
    });
    assert.match(errors({ reasonJa: "理由" }), /中止のときだけ/);
    assert.match(errors({ status: "延期" }), /開催の形/);
  });

  test("checks the waiting time", () => {
    assert.equal(ok({ settleSeconds: "" }).settleSeconds, 3);
    assert.equal(ok({ settleSeconds: "15" }).settleSeconds, 15);
    assert.match(errors({ settleSeconds: "0" }), /撮影まで待つ秒数/);
    assert.match(errors({ settleSeconds: "61" }), /撮影まで待つ秒数/);
    assert.match(errors({ settleSeconds: "1.5" }), /撮影まで待つ秒数/);
  });

  test("reports every problem at once", () => {
    const result = parseAnswers(answers({ round: "", startDate: "", themeJa: "" }), 97);
    assert.ok("errors" in result);
    assert.ok(result.errors.length >= 3, result.errors.join("\n"));
  });
});

describe("renderEntry", () => {
  test("writes the entry in the same layout as the others", () => {
    assert.equal(
      renderEntry(ok()),
      [
        "  {",
        "    round: 98,",
        '    dates: { start: "2027-11-13", end: "2027-11-14" },',
        '    theme: { ja: "花火", en: "Fireworks" },',
        '    commonTheme: "ともに進もう",',
        '    status: "held",',
        "  },",
        "",
      ].join("\n"),
    );
  });

  test("quotes and backslashes stay text, never code", () => {
    const themeJa = 'A"B\\C`${process.exit(1)}`';
    const entry = renderEntry(ok({ themeJa, themeEn: "" }));
    const value = runInNewContext(`(${entry.trim().replace(/,$/, "")})`);
    assert.equal(value.theme.ja, themeJa);
    assert.equal(value.theme.en, themeJa);
  });

  test("writes the reason of a cancelled festival", () => {
    const entry = renderEntry(
      ok({ status: "中止", reasonJa: "台風のため中止", reasonEn: "Typhoon" }),
    );
    assert.match(
      entry,
      /status: "cancelled",\n {4}statusReason: \{\n {6}ja: "台風のため中止",\n {6}en: "Typhoon",\n {4}\},/,
    );
  });
});

describe("the edits fit the files as they are now", () => {
  // Built from the real latest round, so that these keep working every year.
  const next = latestFestival().round + 1;
  const result = parseAnswers(
    answers({
      round: String(next),
      startDate: `${next + 1929}-11-13`,
      endDate: `${next + 1929}-11-14`,
      settleSeconds: "15",
    }),
    latestFestival().round,
  );
  assert.ok("festival" in result);
  const { festival } = result;

  test("src/data/festivals.ts gets one entry at the end", async () => {
    const source = await readFile(join(root, "src/data/festivals.ts"), "utf8");
    const after = addToData(source, festival);
    assert.equal(after.length, source.length + renderEntry(festival).length);
    assert.match(after, new RegExp(`round: ${next},[\\s\\S]*\\] as const satisfies`));
  });

  test("scripts/festivals.test.mjs gets the round and the folder", async () => {
    const source = await readFile(join(root, "scripts/festivals.test.mjs"), "utf8");
    const after = addToTests(source, festival);
    assert.match(after, new RegExp(`^const LATEST_ROUND = ${next};$`, "m"));
    assert.match(after, new RegExp(`"${festival.folder}",\\n\\]; // prettier-ignore`));
    assert.equal(addToTests(after, festival), after);
  });

  test("scripts/lib/capture-targets.mjs gets a waiting time only when it is longer", async () => {
    const source = await readFile(join(root, "scripts/lib/capture-targets.mjs"), "utf8");
    assert.match(
      addToCaptureTargets(source, festival),
      new RegExp(`${next}: \\{ settleMs: 15000 \\},\\n\\};`),
    );
    assert.equal(addToCaptureTargets(source, { ...festival, settleSeconds: 3 }), source);
  });

  test("the table for the pull request names the folder and the missing translation", () => {
    const table = describeFestival({
      ...festival,
      translated: false,
      theme: { ja: "花火", en: "花火" },
    });
    assert.match(table, new RegExp(`/${festival.folder}/`));
    assert.match(table, /未入力/);
  });
});
