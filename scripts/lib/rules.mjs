// Rules shared by the guard scripts. Each rule is a pure function so that the
// tests in scripts/guards.test.mjs can feed it fixtures.
// The reasons behind every rule are in docs/rules/conventions.md.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * File names that must never be published (copied to public/ or dist/).
 * Database dumps, backups, logs, spreadsheets and server-side code have all
 * been found in the public folder of this host before.
 */
const FORBIDDEN_FILE_PATTERNS = [
  { pattern: /\.sql(\.[a-z0-9]+)?$/i, reason: "database dump" },
  { pattern: /\.(dump|db|sqlite3?)$/i, reason: "database file" },
  { pattern: /\.(bak|backup|old|orig|save|swp|tmp)$/i, reason: "backup or temporary file" },
  { pattern: /~$/, reason: "editor backup file" },
  { pattern: /\.log(\.[a-z0-9]+)?$/i, reason: "log file" },
  { pattern: /\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i, reason: "archive (possible backup)" },
  { pattern: /\.(xls|xlsx|csv|tsv)$/i, reason: "spreadsheet (possible personal data)" },
  { pattern: /\.(php|phtml|cgi|pl|py|sh)$/i, reason: "server-side code" },
  { pattern: /(^|\/)\.env(\..*)?$/i, reason: "environment file" },
  { pattern: /(^|\/)\.DS_Store$/, reason: "macOS metadata" },
  { pattern: /(^|\/)\.git(\/|$)/, reason: "git metadata" },
];

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
  for (const { pattern, reason } of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(path)) return reason;
  }
  return null;
}

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
    findings.push(`script tag "${match[0]}"`);
  }
  return findings;
}

/**
 * Finds anything in built HTML that would run JavaScript in the browser.
 * JSON-LD blocks are data, not code, so they are allowed.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function findClientCodeInHtml(html) {
  /** @type {string[]} */
  const findings = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    if (/\btype\s*=\s*["']?application\/ld\+json["']?/i.test(match[0])) continue;
    findings.push(`script tag "${match[0]}"`);
  }
  for (const match of html.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)) {
    findings.push(`inline event handler "${match[1]}"`);
  }
  for (const match of html.matchAll(
    /\b(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi,
  )) {
    findings.push(`javascript: URL "${match[0]}"`);
  }
  return findings;
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
