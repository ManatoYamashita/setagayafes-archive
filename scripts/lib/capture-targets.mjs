// What the capture script (scripts/capture.mjs) photographs, and how.
// Every festival site is captured under the same conditions so that the
// thumbnails line up in the grid. Only the waiting time may differ.
//
// Which festivals exist, and where their sites are, comes from the festivals
// data (src/data/festivals.ts), so adding a festival there is all it takes to
// capture it. Node reads the TypeScript file directly (type stripping).

import { FESTIVALS, ordinalOf, pathOf } from "../../src/data/festivals.ts";
import { RELATED_SITES } from "../../src/data/related-sites.ts";

/** Base URL of the archive host. Each festival lives in pathOf(round), e.g. /81st/. */
export const ARCHIVE_ORIGIN = "https://archive.setagayafes.org";

/** Output folder for the festivals' original images, relative to the project root. */
export const CAPTURE_DIR = "src/assets/captures";

/** Output folder for the related sites' original images (src/data/related-sites.ts). */
export const RELATED_CAPTURE_DIR = "src/assets/related";

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
 * `photo`: a JPEG shown as it is, for a festival with no site.
 * `supplied`: a picture handed over by hand and put in place with
 * `pnpm capture:import` (scripts/import-capture.mjs). `pnpm capture` never
 * overwrites it.
 *
 * @type {Readonly<Record<number, { settleMs?: number, photo?: string, supplied?: true }>>}
 */
export const OVERRIDES = {
  // No site survives; the archive top has always shown this photo instead.
  87: { photo: `${ARCHIVE_ORIGIN}/img/87th.JPG` },
  // An opening loader covers the page for about 10 seconds.
  94: { settleMs: 13000 },
  // The owner made a 16:10 key visual to show instead of the screenshot (Issue #62).
  97: { supplied: true },
};

/**
 * `dir` is the output folder (CAPTURE_DIR or RELATED_CAPTURE_DIR); `file` is
 * the file name in it. `number` is the festival's round, absent for a related site.
 *
 * @typedef {{ kind: "site", number?: number, slug: string, url: string, dir: string, file: string, settleMs: number }} SiteTarget
 * @typedef {{ kind: "photo", number: number, slug: string, url: string, dir: string, file: string }} PhotoTarget
 * @typedef {{ kind: "supplied", number: number, slug: string, url: null, dir: string, file: string }} SuppliedTarget
 * @typedef {SiteTarget | PhotoTarget | SuppliedTarget} CaptureTarget
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
    return {
      kind: "photo",
      number,
      slug,
      url: override.photo,
      dir: CAPTURE_DIR,
      file: `${slug}.jpg`,
    };
  }
  if (override.supplied) {
    return { kind: "supplied", number, slug, url: null, dir: CAPTURE_DIR, file: `${slug}.png` };
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
    dir: CAPTURE_DIR,
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

/** @returns {string[]} The id of every related site that is linked (not blocked). */
export function allRelatedIds() {
  return RELATED_SITES.filter((site) => !("blockedBy" in site)).map((site) => site.id);
}

/**
 * A related site (src/data/related-sites.ts), captured under the same
 * conditions as the festivals. Its picture is shown in the related sites band.
 *
 * @param {string} id
 * @returns {SiteTarget}
 * @throws When the id is not in the data, or the site is not linked yet.
 */
export function relatedTarget(id) {
  const site = RELATED_SITES.find((candidate) => candidate.id === id);
  if (!site) throw new Error(`related site "${id}" is not in src/data/related-sites.ts`);
  if ("blockedBy" in site) {
    throw new Error(
      `related site "${id}" waits for Issue #${site.blockedBy}; capture it after that`,
    );
  }
  return {
    kind: "site",
    slug: id,
    url: `${ARCHIVE_ORIGIN}${site.path}`,
    dir: RELATED_CAPTURE_DIR,
    file: `${id}.png`,
    settleMs: DEFAULT_SETTLE_MS,
  };
}

/**
 * Reads the command line of `pnpm capture`. Festival numbers are read by
 * parseFestivalArgs; a related site's id selects that site, and "related"
 * selects every related site. With no arguments, everything is selected.
 *
 * @param {string[]} args
 * @returns {CaptureTarget[]}
 */
export function parseCaptureArgs(args) {
  if (args.length === 0) {
    return [...allFestivalNumbers().map(captureTarget), ...allRelatedIds().map(relatedTarget)];
  }
  const relatedIds = new Set(RELATED_SITES.map((site) => site.id));
  return args.flatMap((arg) => {
    const name = arg.trim();
    if (name === "related") return allRelatedIds().map(relatedTarget);
    if (relatedIds.has(name)) return [relatedTarget(name)];
    return parseFestivalArgs([arg]).map(captureTarget);
  });
}
