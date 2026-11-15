// The .htaccess for the archive host's root folder (~/www/archive on the
// Sakura server). It is generated after `astro build` (scripts/build-htaccess.mjs)
// and published with dist/, so the repository is the only source of it.
//
// The root .htaccess applies to every past festival site below it (/78th/, ...),
// and those sites use inline scripts and third-party embeds. So the security
// headers are set only for the paths this repository publishes, matched with
// <If> on the request path. <If> sections are merged after every directory's
// settings (including the parent ~/www/.htaccess), which also lets this file
// take back the parent's noindex for the top pages.
// The reasons are in docs/rules/conventions.md (section 3) and
// docs/design/htaccess.md.

import { createHash } from "node:crypto";
import { ERROR_CODES, ERROR_PAGE_DIR, errorPagePath } from "../../src/i18n/errors.ts";

export { ERROR_CODES };

/** The host name of the archive. HSTS is sent only for this host. */
export const ARCHIVE_HOST = "archive.setagayafes.org";

/** Sent with everything this repository publishes. */
export const COMMON_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
});

/** One year, for HSTS and for the hashed files in /_astro/. */
const ONE_YEAR = 31_536_000;

/**
 * The CSP source expressions that allow the inline <style> elements of an HTML
 * document. Astro inlines the page's CSS (build.inlineStylesheets: "always"),
 * so each <style> is allowed by its hash instead of 'unsafe-inline'.
 * <style> is a raw text element: its content ends at the first "</style".
 *
 * @param {string} html
 * @returns {string[]} e.g. ["'sha256-…'"]
 */
export function styleHashesOf(html) {
  return [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style/gi)].map(
    ([, css]) =>
      `'sha256-${createHash("sha256")
        .update(css ?? "", "utf8")
        .digest("base64")}'`,
  );
}

/**
 * The Content-Security-Policy of the top pages: nothing is allowed except the
 * page's own images, its inline styles and requests to its own host.
 *
 * @param {readonly string[]} styleHashes From styleHashesOf().
 * @returns {string}
 */
export function pageCsp(styleHashes) {
  const styles = [...new Set(styleHashes)].toSorted();
  return [
    "default-src 'none'",
    "script-src 'none'",
    `style-src ${styles.length > 0 ? styles.join(" ") : "'none'"}`,
    "img-src 'self'",
    // Lets tools fetch this host's own files from inside the page: Lighthouse
    // reads robots.txt that way and fails its SEO audit without it. No script
    // can run (script-src 'none'), so nothing else uses it.
    "connect-src 'self'",
    // The preview dialog shows a festival's site, on this host, in an iframe.
    // The iframe is sandboxed without allow-same-origin, so the site's own
    // scripts cannot reach this page (Issue #30).
    "frame-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * The Content-Security-Policy of the error pages (/errors/NNN.html). Narrower
 * than the top pages': they have no preview iframe, and Lighthouse is not run
 * on them, so frame-src and connect-src stay at 'none'.
 *
 * @param {readonly string[]} styleHashes From styleHashesOf() of the error pages.
 * @returns {string}
 */
export function errorCsp(styleHashes) {
  const styles = [...new Set(styleHashes)].toSorted();
  return [
    "default-src 'none'",
    "script-src 'none'",
    `style-src ${styles.length > 0 ? styles.join(" ") : "'none'"}`,
    // The favicon and the credit logo in the footer.
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regular expressions (PCRE, also valid in JavaScript) for the request paths
 * that belong to this repository, made from the published files.
 *
 * - `pages`: the HTML pages, with and without "index.html" ("/" and "/index.html")
 * - `own`: every published file, and every folder only this repository uses
 *   (the past festival folders never collide with them: guard-source.mjs)
 * - `immutable`: files whose names carry a content hash (/_astro/)
 * - `errors`: the error pages (/errors/NNN.html)
 *
 * @param {readonly string[]} files Paths relative to dist/, with "/" separators.
 * @returns {{ pages: string, own: string, immutable: string, errors: string }}
 */
export function pathPatterns(files) {
  const published = files.filter((file) => file !== ".htaccess");
  const pages = published
    .filter((file) => file === "index.html" || file.endsWith("/index.html"))
    .map((file) => `${escapeRegExp(file.slice(0, -"index.html".length))}(?:index\\.html)?`)
    .toSorted();
  const folders = [
    ...new Set(published.filter((file) => file.includes("/")).map((file) => file.split("/")[0])),
  ];
  const rootFiles = published.filter((file) => !file.includes("/"));
  const own = [
    ...rootFiles.map(escapeRegExp),
    ...folders.map((folder) => `${escapeRegExp(folder ?? "")}/.*`),
  ].toSorted();
  return {
    pages: `^/(?:${pages.join("|")})$`,
    // "/" itself is the top page; the empty alternative matches it.
    own: `^/(?:|${own.join("|")})$`,
    immutable: "^/_astro/[^/]+$",
    errors: `^${escapeRegExp(ERROR_PAGE_DIR)}[0-9]{3}\\.html$`,
  };
}

/**
 * Whether a file in dist/ is an error page, e.g. "errors/404.html".
 *
 * @param {string} file
 */
export function isErrorPage(file) {
  return new RegExp(pathPatterns([]).errors).test(`/${file}`);
}

/**
 * The whole .htaccess.
 *
 * @param {{
 *   files: readonly string[],
 *   styleHashes: readonly string[],
 *   errorStyleHashes: readonly string[],
 * }} input
 *   `files`: everything in dist/; `styleHashes`: from the top pages;
 *   `errorStyleHashes`: from the error pages.
 * @returns {string}
 */
export function buildHtaccess({ files, styleHashes, errorStyleHashes }) {
  const missing = ERROR_CODES.filter((code) => !files.includes(errorPagePath(code).slice(1)));
  if (missing.length > 0) {
    // ErrorDocument would point at a file that is not there, and the server
    // would answer with its bare built-in message instead.
    throw new Error(`no error page for ${missing.join(", ")} in dist/`);
  }
  const { pages, own, immutable, errors } = pathPatterns(files);
  const common = Object.entries(COMMON_HEADERS).map(
    ([name, value]) => `  Header always set ${name} "${value}"`,
  );
  return [
    "# archive.setagayafes.org: the root .htaccess (~/www/archive/.htaccess).",
    "# Generated by scripts/build-htaccess.mjs from the setagayafes-archive repository.",
    "# Do not edit it on the server: change the repository and deploy again.",
    "# Why each part is here: docs/design/htaccess.md",
    "",
    "# Error pages, published from this repository. The response keeps the",
    "# original status (a missing page is still a 404). The previous pages in",
    "# /errorpage/ stay on the server: pointing these lines back restores them.",
    ...ERROR_CODES.map((code) => `ErrorDocument ${code} ${errorPagePath(code)}`),
    "",
    "<IfModule mod_headers.c>",
    "",
    "# Search engines index only the top pages. Everything else on this host,",
    "# including every past festival site, stays noindex. The parent",
    "# ~/www/.htaccess also sets the header for this host; <If> runs after it,",
    "# so the unset below wins for the top pages.",
    `<If "%{REQUEST_URI} =~ m#${pages}#">`,
    "  Header always unset X-Robots-Tag",
    "</If>",
    "<Else>",
    '  Header always set X-Robots-Tag "noindex, noimageindex"',
    "</Else>",
    "",
    "# Security headers and caching, only for what this repository publishes.",
    `<If "%{REQUEST_URI} =~ m#${own}#">`,
    ...common,
    "</If>",
    `<If "%{REQUEST_URI} =~ m#${pages}#">`,
    `  Header always set Content-Security-Policy "${pageCsp(styleHashes)}"`,
    '  Header set Cache-Control "no-cache"',
    "</If>",
    "# ErrorDocument hands the request over internally, and <If> then sees the",
    "# error page's path in REQUEST_URI, not the URL that failed (measured on",
    "# Apache 2.4: docs/design/htaccess.md). So the error pages are matched by",
    "# their own path, whatever URL they are shown for.",
    `<If "%{REQUEST_URI} =~ m#${errors}#">`,
    `  Header always set Content-Security-Policy "${errorCsp(errorStyleHashes)}"`,
    '  Header always set Cache-Control "no-cache"',
    "</If>",
    `<If "%{REQUEST_URI} =~ m#${immutable}#">`,
    `  Header set Cache-Control "public, max-age=${ONE_YEAR}, immutable"`,
    "</If>",
    "",
    "# HSTS for this host only, without includeSubDomains (other setagayafes.org",
    "# hosts are not ready for it). Not sent through the server's initial domain.",
    `<If "%{HTTP_HOST} == '${ARCHIVE_HOST}'">`,
    `  Header always set Strict-Transport-Security "max-age=${ONE_YEAR}"`,
    "</If>",
    "",
    "</IfModule>",
    "",
    "# Compression, where the server has mod_deflate (it had none when measured).",
    "<IfModule mod_deflate.c>",
    `<If "%{REQUEST_URI} =~ m#${own}#">`,
    "  AddOutputFilterByType DEFLATE text/html text/plain application/xml image/svg+xml",
    "</If>",
    "</IfModule>",
    "",
  ].join("\n");
}
