// Link checks for the build output. Pure functions over file contents, so the
// tests in scripts/links.test.mjs can feed them fixtures.
//
// Every URL in dist/ falls into one of three groups:
// - internal: on this site and built into dist/ (pages, images, sitemap...)
// - server: on this host but outside this repository: the archived festival
//   sites (/78th/, /tfa/, ...), which stay on the server as they are
// - external: on another host (the festival committee, SNS, Wayback Machine)
//
// Internal links are checked offline on every build. Server and external
// links need the network and are checked by `pnpm check:links`.

import { URL } from "node:url";
import { attribute, decodeCharacterReferences, startTags } from "./html.mjs";

/** Attributes that hold one URL. */
const URL_ATTRIBUTES = ["href", "src", "poster", "action", "formaction", "data", "cite"];

/** Attributes that hold a list of image candidates ("url 640w, url 2x"). */
const SRCSET_ATTRIBUTES = ["srcset", "imagesrcset"];

/** `<meta>` whose content is a URL that crawlers and link previews fetch. */
const URL_META = new Set([
  "og:url",
  "og:image",
  "og:image:url",
  "og:image:secure_url",
  "twitter:image",
]);

/**
 * @typedef {{ url: string, where: string }} Link
 *   The raw URL as written, and where it was found (for the report).
 */

/**
 * Lists the URLs in an HTML (or XML) document, with character references
 * decoded as the browser does.
 *
 * @param {string} html
 * @returns {Link[]}
 */
export function linksInMarkup(html) {
  /** @type {Link[]} */
  const links = [];
  for (const tag of startTags(html)) {
    const add = (/** @type {string} */ name, /** @type {string} */ value) => {
      const url = decodeCharacterReferences(value).trim();
      if (url !== "") links.push({ url, where: `<${tag.name} ${name}>` });
    };
    for (const name of URL_ATTRIBUTES) {
      const value = attribute(tag, name);
      if (value !== undefined) add(name, value);
    }
    for (const name of SRCSET_ATTRIBUTES) {
      const value = attribute(tag, name);
      if (value === undefined) continue;
      for (const candidate of decodeCharacterReferences(value).split(",")) {
        const [url] = candidate.trim().split(/\s+/);
        if (url) add(name, url);
      }
    }
    if (tag.name === "meta") {
      const key = (attribute(tag, "property") ?? attribute(tag, "name") ?? "").toLowerCase();
      const content = attribute(tag, "content");
      if (URL_META.has(key) && content !== undefined) add(`content (${key})`, content);
    }
  }
  // Sitemaps keep their URLs in text, not in attributes.
  for (const match of html.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) {
    links.push({ url: decodeCharacterReferences(match[1] ?? ""), where: "<loc>" });
  }
  return links;
}

/**
 * Lists the sitemap URLs in a robots.txt.
 *
 * @param {string} text
 * @returns {Link[]}
 */
export function linksInRobotsTxt(text) {
  return [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((match) => ({
    url: match[1] ?? "",
    where: "Sitemap:",
  }));
}

/**
 * Lists the `id` values of a document, for checking `#fragment` links.
 *
 * @param {string} html
 * @returns {Set<string>}
 */
export function idsIn(html) {
  const ids = new Set();
  for (const tag of startTags(html)) {
    const id = attribute(tag, "id");
    if (id !== undefined) ids.add(decodeCharacterReferences(id));
  }
  return ids;
}

/**
 * The URL a file in dist/ is served at: "en/index.html" → "/en/".
 *
 * @param {string} file Path relative to dist/, with "/" separators.
 * @returns {string}
 */
export function servedPath(file) {
  return `/${file}`.replace(/(^|\/)index\.html$/, "$1");
}

/**
 * The file in dist/ that answers a path, the way Apache does with
 * `DirectoryIndex index.html`: "/en/" → "en/index.html".
 *
 * @param {string} path Decoded URL path, starting with "/".
 * @returns {string}
 */
export function fileForPath(path) {
  return (path.endsWith("/") ? `${path}index.html` : path).slice(1);
}

/**
 * @typedef {object} LinkReport
 * @property {string[]} broken Internal links with no target, as "file: where url (reason)".
 * @property {string[]} server Absolute URLs of archived sites on this host that are linked.
 * @property {string[]} external Absolute URLs on other hosts that are linked.
 */

/**
 * Checks every link in dist/.
 *
 * @param {object} options
 * @param {Map<string, string>} options.documents Contents of the files that can
 *   hold links (markup and robots.txt), by path relative to dist/.
 * @param {Set<string>} options.files Every file in dist/.
 * @param {URL} options.site The site's origin, e.g. https://archive.setagayafes.org.
 * @param {string[]} options.serverPaths Folders on this host that are not built
 *   here, e.g. "/78th/". A link to the folder or anything inside it is a server link.
 * @returns {LinkReport}
 */
export function checkLinks({ documents, files, site, serverPaths }) {
  /** @type {string[]} */
  const broken = [];
  const server = new Set();
  const external = new Set();
  /** @type {Map<string, Set<string>>} */
  const idCache = new Map();
  const idsOf = (/** @type {string} */ file) => {
    let ids = idCache.get(file);
    if (!ids) {
      ids = idsIn(documents.get(file) ?? "");
      idCache.set(file, ids);
    }
    return ids;
  };

  for (const [file, content] of documents) {
    const links = file.endsWith("robots.txt") ? linksInRobotsTxt(content) : linksInMarkup(content);
    const base = new URL(servedPath(file), site);
    for (const { url: raw, where } of links) {
      const fail = (/** @type {string} */ reason) =>
        broken.push(`${file}: ${where} ${raw} (${reason})`);

      /** @type {URL} */
      let url;
      try {
        url = new URL(raw, base);
      } catch {
        fail("not a valid URL");
        continue;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue; // mailto:, tel:
      if (url.origin !== site.origin) {
        external.add(url.href);
        continue;
      }

      let path;
      try {
        path = decodeURIComponent(url.pathname);
      } catch {
        fail("malformed percent-encoding");
        continue;
      }
      if (serverPaths.some((folder) => path === folder || path.startsWith(folder))) {
        server.add(new URL(path, site).href);
        continue;
      }

      const target = fileForPath(path);
      if (!files.has(target)) {
        const hint = files.has(`${target}/index.html`) ? "; add the trailing slash" : "";
        fail(`no such file in dist/${hint}`);
        continue;
      }
      const fragment = decodeURIComponent(url.hash.slice(1));
      if (fragment !== "" && /\.html?$/.test(target) && !idsOf(target).has(fragment)) {
        fail(`no element with id "${fragment}" in ${target}`);
      }
    }
  }

  return { broken, server: [...server].sort(), external: [...external].sort() };
}
