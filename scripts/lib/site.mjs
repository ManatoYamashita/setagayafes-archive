// Facts about the site that the build-output checks need: its origin, and
// the folders on the same host that hold the archived sites (not built here).

import { join } from "node:path";
import { URL } from "node:url";
import { FESTIVALS, pathOf } from "../../src/data/festivals.ts";
import { RELATED_SITES } from "../../src/data/related-sites.ts";
import { checkLinks } from "./links.mjs";
import { MARKUP_EXTENSIONS, readText } from "./rules.mjs";

/** The site's origin. Must match `site` in astro.config.mjs (scripts/site.test.mjs checks). */
export const SITE = new URL("https://archive.setagayafes.org");

/**
 * Folders on this host that hold archived sites: every festival that has a
 * folder (the 87th links to the Wayback Machine instead) and every related site.
 *
 * @returns {string[]}
 */
export function archivedPaths() {
  return [
    ...FESTIVALS.filter((festival) => !("externalLink" in festival)).map((festival) =>
      pathOf(festival.round),
    ),
    ...RELATED_SITES.map((site) => site.path),
  ];
}

/**
 * Reads the files in dist/ that can hold links (markup and robots.txt) and
 * checks every link in them.
 *
 * @param {string} dist
 * @param {string[]} files Every file in dist/, relative to it.
 */
export async function checkDistLinks(dist, files) {
  /** @type {Map<string, string>} */
  const documents = new Map();
  for (const file of files.filter(
    (name) => MARKUP_EXTENSIONS.test(name) || name === "robots.txt",
  )) {
    documents.set(file, await readText(join(dist, file)));
  }
  return checkLinks({ documents, files: new Set(files), site: SITE, serverPaths: archivedPaths() });
}
