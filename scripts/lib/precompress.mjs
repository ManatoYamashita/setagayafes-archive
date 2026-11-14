// Pre-compressed copies of the top pages. The Sakura server has no
// mod_deflate, so the HTML would go out uncompressed; instead the build writes
// index.html.gz next to each index.html, and dist/.htaccess serves it to
// clients that accept gzip (docs/design/htaccess.md).

import { Buffer } from "node:buffer";
import { constants, gunzipSync, gzipSync } from "node:zlib";

/** The files that get a .gz copy: the HTML pages (the big ones). */
export const PRECOMPRESSED = /(^|\/)index\.html$/;

/**
 * gzip at the highest level. gzipSync writes no file name and a zero mtime,
 * so the same page always gives the same bytes.
 *
 * @param {Uint8Array} data
 * @returns {Buffer}
 */
export function gzip(data) {
  return gzipSync(data, { level: constants.Z_BEST_COMPRESSION });
}

/**
 * Why a .gz file in dist/ is wrong, or null.
 *
 * @param {Uint8Array} compressed The .gz file.
 * @param {Uint8Array | undefined} original The file without ".gz", if it exists.
 * @returns {string | null}
 */
export function precompressedProblem(compressed, original) {
  if (original === undefined) return "has no uncompressed original next to it";
  let inflated;
  try {
    inflated = gunzipSync(compressed);
  } catch {
    return "is not valid gzip";
  }
  return Buffer.compare(inflated, original) === 0 ? null : "differs from its original";
}
