// What the capture script (scripts/capture.mjs) photographs, and how.
// Every festival site is captured under the same conditions so that the
// thumbnails line up in the grid. Only the waiting time may differ.

/** Base URL of the archive host. Each festival lives in /{slug}/. */
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

/** The festivals on the archive. Replaced by the festivals data (Issue #1, ToDo 2). */
export const FIRST_FESTIVAL = 75;
export const LATEST_FESTIVAL = 97;

/**
 * Festivals that need something other than the defaults.
 *
 * @type {Record<number, { settleMs?: number, photo?: string }>}
 */
const OVERRIDES = {
  // No site survives; the archive top has always shown this photo instead.
  87: { photo: `${ARCHIVE_ORIGIN}/img/87th.JPG` },
  // An opening loader covers the page for about 10 seconds.
  94: { settleMs: 13000 },
};

/**
 * The folder name of a festival on the archive host: 81 -> "81st".
 *
 * @param {number} number
 * @returns {string}
 */
export function festivalSlug(number) {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`festival number must be a positive integer: ${number}`);
  }
  const lastTwo = number % 100;
  const last = number % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : last === 1
        ? "st"
        : last === 2
          ? "nd"
          : last === 3
            ? "rd"
            : "th";
  return `${number}${suffix}`;
}

/**
 * @typedef {{ kind: "site", number: number, slug: string, url: string, file: string, settleMs: number }} SiteTarget
 * @typedef {{ kind: "photo", number: number, slug: string, url: string, file: string }} PhotoTarget
 * @typedef {SiteTarget | PhotoTarget} CaptureTarget
 */

/**
 * @param {number} number
 * @returns {CaptureTarget}
 */
export function captureTarget(number) {
  const slug = festivalSlug(number);
  const override = OVERRIDES[number] ?? {};
  if (override.photo) {
    return { kind: "photo", number, slug, url: override.photo, file: `${slug}.jpg` };
  }
  return {
    kind: "site",
    number,
    slug,
    url: `${ARCHIVE_ORIGIN}/${slug}/`,
    file: `${slug}.png`,
    settleMs: override.settleMs ?? DEFAULT_SETTLE_MS,
  };
}

/** @returns {number[]} */
export function allFestivalNumbers() {
  return Array.from(
    { length: LATEST_FESTIVAL - FIRST_FESTIVAL + 1 },
    (_, index) => FIRST_FESTIVAL + index,
  );
}

/**
 * Reads the festival numbers given on the command line. Accepts "94" and
 * "94th". With no arguments, every festival is selected.
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
    if (match[2] && festivalSlug(number) !== arg.trim().toLowerCase()) {
      throw new Error(`wrong ordinal suffix: "${arg}" (expected "${festivalSlug(number)}")`);
    }
    return number;
  });
}
