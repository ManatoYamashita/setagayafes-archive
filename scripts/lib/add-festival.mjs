// Adds one festival to the data from the answers of a form (Issue #77): the
// GitHub Actions workflow "新しい回を追加" (.github/workflows/add-festival.yml)
// runs scripts/add-festival.mjs, which uses these functions.
//
// The person filling in the form is expected not to be an engineer, so every
// error message is in Japanese and says what to fix in the form.
//
// The edits are plain text insertions at fixed places, so that the files stay
// as a person would write them:
//   - src/data/festivals.ts: one entry at the end of FESTIVALS
//   - scripts/festivals.test.mjs: LATEST_ROUND and SERVER_FOLDERS
//   - scripts/lib/capture-targets.mjs: OVERRIDES, only when the capture has to
//     wait longer than the default
// Field rules: docs/data/festivals.md.

import { ordinalOf, yearOf } from "../../src/data/festivals.ts";

/** The status choices of the form, as shown to the person, and their values. */
export const STATUS_CHOICES = Object.freeze({
  通常: "held",
  オンラインのみ: "online",
  "対面＋オンライン": "hybrid",
  中止: "cancelled",
});

/** Same as DEFAULT_SETTLE_MS in scripts/lib/capture-targets.mjs. */
export const DEFAULT_SETTLE_SECONDS = 3;
const MAX_SETTLE_SECONDS = 60;
const MAX_TEXT_LENGTH = 120;

/**
 * @typedef {object} FormAnswers
 * @property {string} round
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} themeJa
 * @property {string} [themeEn]
 * @property {string} [commonTheme]
 * @property {string} status One of the keys of STATUS_CHOICES.
 * @property {string} [reasonJa]
 * @property {string} [reasonEn]
 * @property {string} [settleSeconds]
 */

/**
 * @typedef {object} NewFestival
 * @property {number} round
 * @property {string} folder e.g. "98th"
 * @property {{ start: string, end: string }} dates
 * @property {{ ja: string, en: string }} theme
 * @property {boolean} translated False when the English was left empty.
 * @property {string | undefined} commonTheme
 * @property {"held" | "online" | "hybrid" | "cancelled"} status
 * @property {{ ja: string, en: string } | undefined} statusReason
 * @property {number} settleSeconds
 */

/** @param {string | undefined} value */
const clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();

/**
 * @param {string} value
 * @param {string} label
 * @param {string[]} errors
 */
function checkText(value, label, errors) {
  if (value.length > MAX_TEXT_LENGTH) {
    errors.push(`「${label}」が長すぎます（${MAX_TEXT_LENGTH}文字まで）`);
  }
}

/**
 * @param {string} value
 * @param {string} label
 * @param {string[]} errors
 * @returns {Date | undefined}
 */
function parseDate(value, label, errors) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    errors.push(`「${label}」は 2027-11-13 の形で入れてください（入っていた値: ${value || "空"}）`);
    return undefined;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    errors.push(`「${label}」の ${value} は、ない日付です`);
    return undefined;
  }
  return date;
}

/**
 * Checks the answers and turns them into a festival entry.
 *
 * @param {FormAnswers} answers
 * @param {number} latestRound The round of the latest festival in the data.
 * @returns {{ festival: NewFestival } | { errors: string[] }}
 */
export function parseAnswers(answers, latestRound) {
  /** @type {string[]} */
  const errors = [];

  const roundText = clean(answers.round).replace(/^第|回$/g, "");
  const round = /^\d+$/.test(roundText) ? Number(roundText) : NaN;
  if (!Number.isInteger(round)) {
    errors.push(`「回」は数字で入れてください（例: ${latestRound + 1}）`);
  } else if (round !== latestRound + 1) {
    errors.push(
      `「回」は ${latestRound + 1} です。今の一覧の最新は第${latestRound}回で、次の回しか足せません（入っていた値: ${round}）`,
    );
  }

  const startText = clean(answers.startDate);
  const endText = clean(answers.endDate);
  const start = parseDate(startText, "開催日（初日）", errors);
  const end = parseDate(endText, "開催日（最終日）", errors);
  if (start && end && start > end) {
    errors.push("「開催日（最終日）」が「開催日（初日）」より前になっています");
  }
  if (start && Number.isInteger(round) && start.getUTCFullYear() !== yearOf(round)) {
    errors.push(
      `第${round}回は ${yearOf(round)} 年の開催のはずですが、「開催日（初日）」が ${start.getUTCFullYear()} 年です`,
    );
  }

  const themeJa = clean(answers.themeJa);
  const themeEn = clean(answers.themeEn);
  if (!themeJa)
    errors.push("「キャンパステーマ（日本語）」を入れてください。サイトに書かれたとおりに入れます");
  checkText(themeJa, "キャンパステーマ（日本語）", errors);
  checkText(themeEn, "キャンパステーマ（英語）", errors);

  const commonTheme = clean(answers.commonTheme);
  checkText(commonTheme, "共通テーマ", errors);

  const statusLabel = clean(answers.status);
  const status = STATUS_CHOICES[/** @type {keyof typeof STATUS_CHOICES} */ (statusLabel)];
  if (!status)
    errors.push(`「開催の形」は ${Object.keys(STATUS_CHOICES).join("・")} から選んでください`);

  const reasonJa = clean(answers.reasonJa);
  const reasonEn = clean(answers.reasonEn);
  if (status === "cancelled" && !reasonJa) {
    errors.push("「開催の形」が中止のときは、「中止の理由（日本語）」を入れてください");
  }
  if (status && status !== "cancelled" && (reasonJa || reasonEn)) {
    errors.push("「中止の理由」は、「開催の形」が中止のときだけ入れます");
  }
  checkText(reasonJa, "中止の理由（日本語）", errors);
  checkText(reasonEn, "中止の理由（英語）", errors);

  const settleText = clean(answers.settleSeconds) || String(DEFAULT_SETTLE_SECONDS);
  const settleSeconds = /^\d+$/.test(settleText) ? Number(settleText) : NaN;
  if (!Number.isInteger(settleSeconds) || settleSeconds < 1 || settleSeconds > MAX_SETTLE_SECONDS) {
    errors.push(`「撮影まで待つ秒数」は 1〜${MAX_SETTLE_SECONDS} の数字で入れてください`);
  }

  if (errors.length > 0) return { errors };
  return {
    festival: {
      round,
      folder: ordinalOf(round),
      dates: { start: startText, end: endText },
      theme: { ja: themeJa, en: themeEn || themeJa },
      translated: themeEn !== "",
      commonTheme: commonTheme || undefined,
      status: /** @type {NewFestival["status"]} */ (status),
      statusReason: status === "cancelled" ? { ja: reasonJa, en: reasonEn || reasonJa } : undefined,
      settleSeconds,
    },
  };
}

/** A TypeScript string literal. JSON strings are valid TypeScript strings. */
const literal = JSON.stringify;

/**
 * The entry for src/data/festivals.ts, in the same layout as the others.
 *
 * @param {NewFestival} festival
 */
export function renderEntry(festival) {
  const lines = [
    "  {",
    `    round: ${festival.round},`,
    `    dates: { start: ${literal(festival.dates.start)}, end: ${literal(festival.dates.end)} },`,
    `    theme: { ja: ${literal(festival.theme.ja)}, en: ${literal(festival.theme.en)} },`,
  ];
  if (festival.commonTheme) lines.push(`    commonTheme: ${literal(festival.commonTheme)},`);
  lines.push(`    status: ${literal(festival.status)},`);
  if (festival.statusReason) {
    lines.push(
      "    statusReason: {",
      `      ja: ${literal(festival.statusReason.ja)},`,
      `      en: ${literal(festival.statusReason.en)},`,
      "    },",
    );
  }
  lines.push("  },");
  return `${lines.join("\n")}\n`;
}

/**
 * Inserts `addition` right before the only occurrence of `marker`.
 *
 * @param {string} source
 * @param {string} marker
 * @param {string} addition
 * @param {string} file For the error message.
 */
function insertBefore(source, marker, addition, file) {
  const at = source.indexOf(marker);
  if (at === -1 || source.indexOf(marker, at + 1) !== -1) {
    throw new Error(`${file}: expected exactly one "${marker.trim()}"; the file layout changed`);
  }
  return source.slice(0, at) + addition + source.slice(at);
}

/**
 * @param {string} source src/data/festivals.ts
 * @param {NewFestival} festival
 */
export function addToData(source, festival) {
  return insertBefore(
    source,
    "] as const satisfies readonly Festival[];",
    renderEntry(festival),
    "src/data/festivals.ts",
  );
}

/**
 * @param {string} source scripts/festivals.test.mjs
 * @param {NewFestival} festival
 */
export function addToTests(source, festival) {
  const latest = /^const LATEST_ROUND = \d+;$/m;
  if (!latest.test(source)) {
    throw new Error("scripts/festivals.test.mjs: LATEST_ROUND not found; the file layout changed");
  }
  const bumped = source.replace(latest, `const LATEST_ROUND = ${festival.round};`);
  const start = bumped.indexOf("const SERVER_FOLDERS = [");
  const end = bumped.indexOf("]; // prettier-ignore", start);
  if (start === -1 || end === -1) {
    throw new Error(
      "scripts/festivals.test.mjs: SERVER_FOLDERS not found; the file layout changed",
    );
  }
  if (bumped.slice(start, end).includes(`"${festival.folder}"`)) return bumped;
  return `${bumped.slice(0, end)}  "${festival.folder}",\n${bumped.slice(end)}`;
}

/**
 * Adds an OVERRIDES entry when the capture has to wait longer than the
 * default, so that a later full capture waits as long.
 *
 * @param {string} source scripts/lib/capture-targets.mjs
 * @param {NewFestival} festival
 */
export function addToCaptureTargets(source, festival) {
  if (festival.settleSeconds <= DEFAULT_SETTLE_SECONDS) return source;
  const start = source.indexOf("export const OVERRIDES = {");
  const end = source.indexOf("\n};", start);
  if (start === -1 || end === -1) {
    throw new Error(
      "scripts/lib/capture-targets.mjs: OVERRIDES not found; the file layout changed",
    );
  }
  const entry =
    `\n  // Set from the form (Issue #77): the page needs ${festival.settleSeconds} seconds to settle.` +
    `\n  ${festival.round}: { settleMs: ${festival.settleSeconds * 1000} },`;
  return source.slice(0, end) + entry + source.slice(end);
}

/**
 * The table for the pull request, in plain words.
 *
 * @param {NewFestival} festival
 */
export function describeFestival(festival) {
  const statusLabel = Object.entries(STATUS_CHOICES).find(
    ([, value]) => value === festival.status,
  )?.[0];
  const rows = [
    ["回", `第${festival.round}回（${yearOf(festival.round)}年）`],
    ["開催日", `${festival.dates.start} 〜 ${festival.dates.end}`],
    ["キャンパステーマ（日本語）", festival.theme.ja],
    [
      "キャンパステーマ（英語）",
      festival.translated ? festival.theme.en : "（未入力。英語版でも日本語のまま出ます）",
    ],
    ["共通テーマ", festival.commonTheme ?? "（なし）"],
    ["開催の形", statusLabel ?? festival.status],
  ];
  if (festival.statusReason) {
    rows.push(["中止の理由", `${festival.statusReason.ja} / ${festival.statusReason.en}`]);
  }
  rows.push(["サイトのフォルダ", `https://archive.setagayafes.org/${festival.folder}/`]);
  rows.push(["撮影まで待つ秒数", `${festival.settleSeconds} 秒`]);
  const escape = (/** @type {string} */ text) => text.replaceAll("|", "\\|");
  return [
    "| 項目 | 値 |",
    "| --- | --- |",
    ...rows.map(([key, value]) => `| ${key} | ${escape(value)} |`),
  ].join("\n");
}
