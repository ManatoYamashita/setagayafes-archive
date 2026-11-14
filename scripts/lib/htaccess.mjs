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

/** The host name of the archive. HSTS is sent only for this host. */
export const ARCHIVE_HOST = "archive.setagayafes.org";

/**
 * Status codes that have a static error page in /errorpage/ on the server
 * (NNN.html, written when the WordPress sites were made static: Issue #2).
 */
export const ERROR_CODES = Object.freeze([
  400, 401, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421, 422,
  423, 424, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
]);

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

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regular expressions (PCRE, also valid in JavaScript) for the request paths
 * that belong to this repository, made from the published files.
 *
 * - `pages`: the HTML pages, with and without "index.html" ("/" and "/index.html"),
 *   and their pre-compressed copies ("/index.html.gz")
 * - `own`: every published file, and every folder only this repository uses
 *   (the past festival folders never collide with them: guard-source.mjs)
 * - `immutable`: files whose names carry a content hash (/_astro/)
 *
 * @param {readonly string[]} files Paths relative to dist/, with "/" separators.
 * - `precompressed`: the HTML pages that have a .gz copy, by their "index.html" path
 *
 * @returns {{ pages: string, own: string, immutable: string, precompressed: string }}
 */
export function pathPatterns(files) {
  const published = files.filter((file) => file !== ".htaccess");
  const pages = published
    .filter((file) => file === "index.html" || file.endsWith("/index.html"))
    // index.html.gz: the pre-compressed page that the rewrite below serves
    // for "/" and "/index.html" (an internal redirect, so <If> sees this path).
    .map(
      (file) => `${escapeRegExp(file.slice(0, -"index.html".length))}(?:index\\.html(?:\\.gz)?)?`,
    )
    .toSorted();
  const folders = [
    ...new Set(published.filter((file) => file.includes("/")).map((file) => file.split("/")[0])),
  ];
  const rootFiles = published.filter((file) => !file.includes("/"));
  const own = [
    ...rootFiles.map(escapeRegExp),
    ...folders.map((folder) => `${escapeRegExp(folder ?? "")}/.*`),
  ].toSorted();
  const precompressed = published
    .filter((file) => file.endsWith("index.html") && published.includes(`${file}.gz`))
    .map(escapeRegExp)
    .toSorted();
  return {
    pages: `^/(?:${pages.join("|")})$`,
    // An empty list must match nothing, not every path.
    precompressed: precompressed.length > 0 ? `^/(?:${precompressed.join("|")})$` : "^(?!)",
    // "/" itself is the top page; the empty alternative matches it.
    own: `^/(?:|${own.join("|")})$`,
    immutable: "^/_astro/[^/]+$",
  };
}

/**
 * The whole .htaccess.
 *
 * @param {{ files: readonly string[], styleHashes: readonly string[] }} input
 *   `files`: everything in dist/; `styleHashes`: from every HTML page.
 * @returns {string}
 */
export function buildHtaccess({ files, styleHashes }) {
  const { pages, own, immutable, precompressed } = pathPatterns(files);
  const common = Object.entries(COMMON_HEADERS).map(
    ([name, value]) => `  Header always set ${name} "${value}"`,
  );
  return [
    "# archive.setagayafes.org: the root .htaccess (~/www/archive/.htaccess).",
    "# Generated by scripts/build-htaccess.mjs from the setagayafes-archive repository.",
    "# Do not edit it on the server: change the repository and deploy again.",
    "# Why each part is here: docs/design/htaccess.md",
    "",
    "# Error pages: the static pages in /errorpage/ (the PHP versions are retired).",
    ...ERROR_CODES.map((code) => `ErrorDocument ${code} /errorpage/${code}.html`),
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
    // The same URL answers gzip or plain HTML (the rewrite below).
    "  Header merge Vary Accept-Encoding",
    "</If>",
    `<If "%{REQUEST_URI} =~ m#${precompressed.replace(/\$$/, "\\.gz$")}#">`,
    "  ForceType text/html",
    "  Header set Content-Encoding gzip",
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
    "# Pre-compressed top pages: the server has no mod_deflate, so the build writes",
    "# index.html.gz next to each page. A client that accepts gzip gets it (an",
    "# internal redirect: the URL stays the same); others get index.html.",
    '# "/" reaches the rules as /index.html, through DirectoryIndex. The paths are',
    "# matched on REQUEST_URI because past festival folders without rewrite rules",
    "# of their own inherit these. The .gz files are not served by their own URL.",
    "<IfModule mod_rewrite.c>",
    "<IfModule mod_headers.c>",
    "RewriteEngine On",
    "RewriteCond %{ENV:REDIRECT_STATUS} ^$",
    `RewriteCond %{REQUEST_URI} ${precompressed.replace(/\$$/, "\\.gz$")}`,
    "RewriteRule ^ - [R=404,L]",
    "RewriteCond %{HTTP:Accept-Encoding} \\bgzip\\b",
    `RewriteCond %{REQUEST_URI} ${precompressed}`,
    "RewriteCond %{REQUEST_FILENAME}.gz -f",
    "RewriteRule ^ %{REQUEST_URI}.gz [L]",
    "</IfModule>",
    "</IfModule>",
    "",
    "# Compression, where the server has mod_deflate (it had none when measured).",
    "<IfModule mod_deflate.c>",
    `<If "%{REQUEST_URI} =~ m#${own}# && ! %{REQUEST_URI} =~ m#\\.gz$#">`,
    "  AddOutputFilterByType DEFLATE text/html text/plain application/xml image/svg+xml",
    "</If>",
    "</IfModule>",
    "",
  ].join("\n");
}
