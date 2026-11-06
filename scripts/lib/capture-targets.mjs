// What the capture script (scripts/capture.mjs) photographs, and how.
// Every festival site is captured under the same conditions so that the
// thumbnails line up in the grid. Only the waiting time may differ.
//
// Which festivals exist, and where their sites are, comes from the festivals
// data (src/data/festivals.ts), so adding a festival there is all it takes to
// capture it. Node reads the TypeScript file directly (type stripping).

import { FESTIVALS, ordinalOf, pathOf } from "../../src/data/festivals.ts";

/** Base URL of the archive host. Each festival lives in pathOf(round), e.g. /81st/. */
export const ARCHIVE_ORIGIN = "https://archive.setagayafes.org";

/** Output folder for the original images, relative to the project root. */
export const CAPTURE_DIR = "src/assets/captures";

/**
 * Browser conditions shared by every capture. 1280 CSS px is wide enough for
 * the modern sites' desktop layout, and the 800px-wide sites of 2004-2011 still
 * sit in the middle of it. The scale factor of 2 keeps the thumbnails sharp on
 * high-density screens.
 */
export const CAPTURE_CONDITIONS = Object.freeze({
  viewport: Object.freeze({ width: 1280, height: 800 }),
  deviceScaleFactor: 2,
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  colorScheme: /** @type {const} */ ("light"),
});

/** Time to wait after the page has loaded, for fades and late images. */
const DEFAULT_SETTLE_MS = 3000;

/**
 * Festivals that need something other than the defaults. Every key must be a
 * round in the festivals data (checked by scripts/capture.test.mjs).
 *
 * @type {Readonly<Record<number, { settleMs?: number, photo?: string }>>}
 */
export const OVERRIDES = {
  // No site survives; the archive top has always shown this photo instead.
  87: { photo: `${ARCHIVE_ORIGIN}/img/87th.JPG` },
  // An opening loader covers the page for about 10 seconds.
  94: { settleMs: 13000 },
};

/**
 * @typedef {{ kind: "site", number: number, slug: string, url: string, file: string, settleMs: number }} SiteTarget
 * @typedef {{ kind: "photo", number: number, slug: string, url: string, file: string }} PhotoTarget
 * @typedef {SiteTarget | PhotoTarget} CaptureTarget
 */

/** @param {number} round */
function festivalOf(round) {
  return FESTIVALS.find((festival) => festival.round === round);
}

/**
 * @param {number} number A round in the festivals data.
 * @returns {CaptureTarget}
 * @throws When the round is not in the data, or when its site is not on this
 *   host and no photo stands in for it.
 */
export function captureTarget(number) {
  const festival = festivalOf(number);
  if (!festival) {
    throw new Error(
      `festival ${number} is not in src/data/festivals.ts; add it there before capturing`,
    );
  }
  const slug = ordinalOf(number);
  const override = OVERRIDES[number] ?? {};
  if (override.photo) {
    return { kind: "photo", number, slug, url: override.photo, file: `${slug}.jpg` };
  }
  if ("externalLink" in festival) {
    throw new Error(
      `festival ${number} has no site on this host (it links to ${festival.externalLink.url}); ` +
        "give it a photo in OVERRIDES",
    );
  }
  return {
    kind: "site",
    number,
    slug,
    url: `${ARCHIVE_ORIGIN}${pathOf(number)}`,
    file: `${slug}.png`,
    settleMs: override.settleMs ?? DEFAULT_SETTLE_MS,
  };
}

/** @returns {number[]} Every round in the festivals data, oldest first. */
export function allFestivalNumbers() {
  return FESTIVALS.map((festival) => festival.round).sort((a, b) => a - b);
}

/**
 * Reads the festival numbers given on the command line. Accepts "94" and
 * "94th". With no arguments, every festival in the data is selected.
 * Whether a number is in the data is checked by captureTarget.
 *
 * @param {string[]} args
 * @returns {number[]}
 */
export function parseFestivalArgs(args) {
  if (args.length === 0) return allFestivalNumbers();
  return args.map((arg) => {
    const match = /^(\d+)(st|nd|rd|th)?$/i.exec(arg.trim());
    if (!match) throw new Error(`not a festival number: "${arg}"`);
    const number = Number(match[1]);
    if (match[2] && ordinalOf(number) !== arg.trim().toLowerCase()) {
      throw new Error(`wrong ordinal suffix: "${arg}" (expected "${ordinalOf(number)}")`);
    }
    return number;
  });
}
