// Rules shared by the guard scripts. Each rule is a pure function so that the
// tests in scripts/guards.test.mjs can feed it fixtures.
// The reasons behind every rule are in docs/rules/conventions.md.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { attribute, decodeCharacterReferences, startTags } from "./html.mjs";

/**
 * File names that must never be published (copied to public/ or dist/).
 * Database dumps, backups, logs, spreadsheets and server-side code have all
 * been found in the public folder of this host before.
 */
const FORBIDDEN_FILE_PATTERNS = [
  // Before the ".db" rule, so that Thumbs.db is reported for what it is.
  { pattern: /(^|\/)(Thumbs\.db|desktop\.ini)$/i, reason: "Windows folder metadata" },
  { pattern: /\.sql(\.[a-z0-9]+)?$/i, reason: "database dump" },
  { pattern: /\.(dump|db|sqlite3?)$/i, reason: "database file" },
  { pattern: /\.(bak|backup|old|orig|save|swp|tmp)$/i, reason: "backup or temporary file" },
  { pattern: /~$/, reason: "editor backup file" },
  { pattern: /\.log(\.[a-z0-9]+)?$/i, reason: "log file" },
  // Apache-style logs have no extension: access_log, access_log_20261105, error_log.
  { pattern: /(^|\/)(ssl_)?(access|error|request)[._-]?log/i, reason: "log file" },
  { pattern: /\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i, reason: "archive (possible backup)" },
  { pattern: /\.svgz$/i, reason: "compressed SVG (its markup cannot be checked)" },
  { pattern: /\.(xls|xlsx|csv|tsv)$/i, reason: "spreadsheet (possible personal data)" },
  { pattern: /\.(php|phtml|cgi|pl|py|sh|shtml?|stm|asp|aspx|jsp)$/i, reason: "server-side code" },
  { pattern: /(^|\/)\.env(\..*)?$/i, reason: "environment file" },
  { pattern: /(^|\/)\.DS_Store$/, reason: "macOS metadata" },
  // FrontPage keeps author and PC account names in _vti_cnf/ and _vti_pvt/.
  { pattern: /(^|\/)_vti_[a-z]+(\/|$)/i, reason: "FrontPage metadata" },
  { pattern: /(^|\/)\.git(\/|$)/, reason: "git metadata" },
];

/**
 * Extensions a browser parses as HTML, XML or SVG, where a script can run.
 * Checked by content rather than rejected, so that any of them can be published
 * once it is script-free.
 */
export const MARKUP_EXTENSIONS = /\.(html?|xht(ml)?|shtml?|svg|xml|xslt?)$/i;

/** Integrations and packages that would put a UI runtime in the browser. */
const UI_RUNTIME_PACKAGES = [
  /^@astrojs\/(react|preact|vue|svelte|solid-js|alpinejs|lit)$/,
  /^(react|react-dom|preact|vue|svelte|solid-js|alpinejs|lit)$/,
];

/**
 * @param {string} path Path relative to the published root, with "/" separators.
 * @returns {string | null} The reason the file is forbidden, or null.
 */
export function forbiddenFileReason(path) {
  // The pre-compressed top pages (scripts/lib/precompress.mjs). guard-dist.mjs
  // checks that each one inflates to the page next to it.
  if (/(^|\/)index\.html\.gz$/.test(path)) return null;
  for (const { pattern, reason } of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(path)) return reason;
  }
  return null;
}

/**
 * The one script tag the source may hold: JSON-LD, written exactly as
 * `<script type="application/ld+json" set:html={name} />`. The value must be a
 * plain variable, so the data is built (and escaped) in TypeScript, not in
 * the template. Whether the value was escaped is checked in the built HTML,
 * by findClientCodeInHtml.
 */
const JSON_LD_SOURCE_TAG =
  /^<script type="application\/ld\+json" set:html=\{[A-Za-z_$][\w$]*\} \/>$/;

/**
 * Finds Astro hydration directives and script tags in a source file.
 * Comments are not stripped on purpose: a commented-out `client:load` is
 * still a sign that someone is about to ship JavaScript.
 *
 * @param {string} source
 * @returns {string[]} Human-readable findings.
 */
export function findClientCodeInSource(source) {
  /** @type {string[]} */
  const findings = [];
  for (const match of source.matchAll(/\bclient:[a-z]+/g)) {
    findings.push(`hydration directive "${match[0]}"`);
  }
  for (const match of source.matchAll(/<script\b[^>]*>/gi)) {
    if (JSON_LD_SOURCE_TAG.test(match[0])) continue;
    findings.push(`script tag "${match[0]}"`);
  }
  return findings;
}

/** Attributes whose value the browser may navigate to or load as a URL. */
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "background",
]);

/**
 * Finds anything in built HTML that would run JavaScript in the browser.
 *
 * Tags and attributes are read with a tokenizer (scripts/lib/html.mjs), not
 * matched as text, so that `data-type="..."`, a ">" inside a quoted value or
 * attributes separated by "/" are read the way a browser reads them.
 *
 * JSON-LD is data, not code, so `<script type="application/ld+json">` is
 * allowed. Only an exact `type` value is accepted (ASCII case-insensitive, no
 * surrounding whitespace), and only the first `type` attribute counts, as in
 * the browser.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function findClientCodeInHtml(html) {
  /** @type {string[]} */
  const findings = [];
  for (const tag of startTags(html)) {
    if (tag.name === "script") {
      const type = attribute(tag, "type");
      if (type === undefined || type.toLowerCase() !== "application/ld+json") {
        findings.push(`script tag "${tag.source}"`);
      } else {
        const problem = jsonLdTextProblem(tag.text ?? "");
        if (problem) findings.push(`JSON-LD in "${tag.source}": ${problem}`);
      }
    }
    for (const { name, value } of tag.attributes) {
      if (name.startsWith("on")) {
        findings.push(`inline event handler "${name}" in "${tag.source}"`);
      } else if (URL_ATTRIBUTES.has(name) && isScriptUrl(value)) {
        findings.push(`script URL in "${name}" of "${tag.source}"`);
      } else if (name === "srcdoc") {
        for (const finding of findClientCodeInHtml(decodeCharacterReferences(value))) {
          findings.push(`srcdoc of "<${tag.name}>": ${finding}`);
        }
      }
    }
  }
  return findings;
}

/**
 * Why the text of a JSON-LD script element is unsafe, or null.
 * The source writes "<" as \u003c (src/lib/seo.ts), so a "<" here means a
 * value was not escaped: "</script" would have ended the element early (the
 * rest no longer parses as JSON), and "<!--" changes how the browser finds
 * the end tag.
 *
 * @param {string} text
 * @returns {string | null}
 */
function jsonLdTextProblem(text) {
  if (text.includes("<")) return 'contains "<" (write it as \\u003c)';
  try {
    JSON.parse(text);
  } catch {
    return "is not valid JSON";
  }
  return null;
}

/**
 * True when a URL attribute value runs script on navigation. The browser
 * decodes character references, strips leading and trailing control
 * characters and spaces, and removes tabs and newlines anywhere in the URL
 * before reading the scheme, so this does the same.
 *
 * @param {string} rawValue
 * @returns {boolean}
 */
function isScriptUrl(rawValue) {
  const url = decodeCharacterReferences(rawValue)
    // eslint-disable-next-line no-control-regex
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "")
    .replace(/[\t\n\r]/g, "");
  return /^(javascript|vbscript):/i.test(url) || /^data:\s*text\/html/i.test(url);
}

/**
 * SSH destinations on the Sakura servers ("<account>@<server>.sakura.ne.jp"). The
 * repository is public, so connection details stay out of it
 * (docs/rules/conventions.md, 8); docs use the Host alias "setagayafes-archive".
 */
const SAKURA_DESTINATION = /[a-z0-9._-]+@(?:[a-z0-9-]+\.)+sakura\.ne\.jp\b/gi;

/**
 * @param {string} text
 * @returns {string[]} The SSH destinations found, as written.
 */
export function findServerDestinations(text) {
  return [...text.matchAll(SAKURA_DESTINATION)].map((match) => match[0]);
}

/**
 * @param {Record<string, unknown>} packageJson
 * @returns {string[]} Names of UI runtime packages found in any dependency list.
 */
export function findUiRuntimePackages(packageJson) {
  const names = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ].flatMap((field) => Object.keys(/** @type {object} */ (packageJson[field] ?? {})));
  return names.filter((name) => UI_RUNTIME_PACKAGES.some((pattern) => pattern.test(name)));
}

/**
 * Lists every file under a directory, including dotfiles.
 *
 * @param {string} root
 * @returns {Promise<string[]>} Paths relative to root, with "/" separators.
 */
export async function listFiles(root) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(relative(root, full).split(sep).join("/"));
    }
  }
  await walk(root);
  return files.sort();
}

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
export function readText(path) {
  return readFile(path, "utf8");
}

/**
 * Prints findings and sets a failing exit code when there are any.
 *
 * @param {string} title
 * @param {string[]} findings
 */
export function report(title, findings) {
  if (findings.length === 0) {
    console.log(`ok   ${title}`);
    return;
  }
  process.exitCode = 1;
  console.error(`FAIL ${title}`);
  for (const finding of findings) console.error(`  - ${finding}`);
}
