// Adds the next festival to the data from the answers of the form "新しい回を追加"
// (.github/workflows/add-festival.yml; Issue #77). The rules are in
// scripts/lib/add-festival.mjs.
//
// The answers come in environment variables, so that the workflow never puts
// them into a shell command:
//   FORM_ROUND, FORM_START_DATE, FORM_END_DATE, FORM_THEME_JA, FORM_THEME_EN,
//   FORM_COMMON_THEME, FORM_STATUS, FORM_REASON_JA, FORM_REASON_EN,
//   FORM_SETTLE_SECONDS
//
// Usage: node scripts/add-festival.mjs [--offline]
//   --offline  skip the check that the festival's folder answers on the archive host
//
// Writes src/data/festivals.ts, scripts/festivals.test.mjs and, when needed,
// scripts/lib/capture-targets.mjs. In GitHub Actions it also writes the
// round and folder to $GITHUB_OUTPUT and a table for the pull request to
// $FORM_SUMMARY_FILE.

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { latestFestival } from "../src/data/festivals.ts";
import {
  addToCaptureTargets,
  addToData,
  addToTests,
  describeFestival,
  parseAnswers,
} from "./lib/add-festival.mjs";
import { ARCHIVE_ORIGIN } from "./lib/capture-targets.mjs";

const root = process.cwd();
const offline = process.argv.includes("--offline");
const inActions = process.env.GITHUB_ACTIONS === "true";

/** @param {string} message */
function fail(message) {
  console.error(inActions ? `::error::${message}` : `FAIL ${message}`);
}

const env = process.env;
const result = parseAnswers(
  {
    round: env.FORM_ROUND ?? "",
    startDate: env.FORM_START_DATE ?? "",
    endDate: env.FORM_END_DATE ?? "",
    themeJa: env.FORM_THEME_JA ?? "",
    themeEn: env.FORM_THEME_EN,
    commonTheme: env.FORM_COMMON_THEME,
    status: env.FORM_STATUS ?? "",
    reasonJa: env.FORM_REASON_JA,
    reasonEn: env.FORM_REASON_EN,
    settleSeconds: env.FORM_SETTLE_SECONDS,
  },
  latestFestival().round,
);

if ("errors" in result) {
  for (const message of result.errors) fail(message);
  fail("フォームの入力を直して、もう一度送ってください");
  process.exit(1);
}
const { festival } = result;

if (!offline) {
  const url = `${ARCHIVE_ORIGIN}/${festival.folder}/`;
  // 0 when the host does not answer at all.
  const status = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).then(
    (response) => response.status,
    () => 0,
  );
  if (status !== 200) {
    fail(
      `第${festival.round}回のサイト（${url}）が開けません（${status || "応答なし"}）。` +
        "先に、サイトのフォルダをサーバーに置いてください（Issue #78）",
    );
    process.exit(1);
  }
  console.log(`ok   ${url} answers 200`);
}

/**
 * @param {string} path
 * @param {(source: string) => string} edit
 */
async function update(path, edit) {
  const file = join(root, path);
  const before = await readFile(file, "utf8");
  const after = edit(before);
  if (after !== before) {
    await writeFile(file, after);
    console.log(`ok   updated ${path}`);
  }
}

await update("src/data/festivals.ts", (source) => addToData(source, festival));
await update("scripts/festivals.test.mjs", (source) => addToTests(source, festival));
await update("scripts/lib/capture-targets.mjs", (source) => addToCaptureTargets(source, festival));

if (env.GITHUB_OUTPUT) {
  await appendFile(
    env.GITHUB_OUTPUT,
    `round=${festival.round}\nfolder=${festival.folder}\ntranslated=${festival.translated}\n`,
  );
}
if (env.FORM_SUMMARY_FILE) {
  await writeFile(env.FORM_SUMMARY_FILE, `${describeFestival(festival)}\n`);
}
console.log(describeFestival(festival));
