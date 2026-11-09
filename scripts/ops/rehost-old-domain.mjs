// Points the absolute URLs of a past festival site at its copy on the archive
// host (Issue #3). The festival sites lived at https://setagayafes.org/<round>/;
// that domain now serves the latest festival, so those URLs load the wrong site
// (blocked by the browser as ORB, or a 404 there).
//
// Runs on a local mirror of the site's text files, never on the server:
//
//   node scripts/ops/rehost-old-domain.mjs <round> <mirror-dir> <files.txt> <out-dir>
//
//   <mirror-dir>  the site's text files (.htm, .html, .css, .js, .xml, .json)
//   <files.txt>   every file of the site on the server, one path per line,
//                 relative to the site folder (to know what exists there)
//   <out-dir>     changed files are written here with the same relative paths
//
// Prints a JSON report: how many URLs were pointed where, and the ones whose
// target does not exist on the archive (still pointed at the archive, so the
// browser no longer loads the other site).
//
// The static copies were made with HTTrack, which saves "style.css?ver=2.1.0"
// as "style3c94.css" (a hash of the query). The copy's own references keep the
// query ("style3c94.css?ver=2.1.0"), so the table from the original name and
// query to the saved name is built from those references.

import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { listFiles } from "../lib/rules.mjs";

const [round, mirror, filesTxt, out] = process.argv.slice(2);
if (!round || !mirror || !filesTxt || !out) {
  console.error("usage: rehost-old-domain.mjs <round> <mirror-dir> <files.txt> <out-dir>");
  process.exit(1);
}

const ARCHIVE = "https://archive.setagayafes.org";
const TEXT = /\.(html?|css|js|xml|json)$/i;

const existing = new Set(
  (await readFile(filesTxt, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);

/**
 * The file name a URL path stands for. Text is read as latin1 (bytes), so a
 * raw UTF-8 path comes in as one character per byte; a path may also be
 * percent-encoded ("%e3%80%90…"). The server's names are UTF-8.
 *
 * @param {string} path
 */
function fileNameOf(path) {
  let name = Buffer.from(path, "latin1").toString("utf8");
  try {
    name = decodeURIComponent(name);
  } catch {
    // Not valid percent-encoding: use it as it is.
  }
  return name;
}

/** @param {string} path */
const exists = (path) => existing.has(path) || existing.has(fileNameOf(path));
const textFiles = (await listFiles(mirror)).filter((file) => TEXT.test(file));

// Files are read as latin1 so that every byte survives (some are Shift_JIS);
// the URLs themselves are ASCII.
/** @type {Map<string, string>} */
const contents = new Map();
for (const file of textFiles) contents.set(file, await readFile(join(mirror, file), "latin1"));

/**
 * HTTrack's saved names: "<dir>/<base><4 hex><.ext>?<query>" in the copy's own
 * references, resolved against the referring file.
 * Key: "<dir>/<base><.ext>?<query>" (the original), value: the saved path.
 *
 * @type {Map<string, string>}
 */
const hashed = new Map();
/** Any saved name for "<dir>/<base><.ext>", whatever its query. */
const hashedAnyQuery = new Map();
const LOCAL_HASHED =
  /(?:src|href)=["']?(?!https?:|\/\/|\/)([^"'\s>?#]*?)([0-9a-f]{4})(\.[A-Za-z0-9]+)\?([^"'\s>#]*)/g;
for (const [file, text] of contents) {
  for (const match of text.matchAll(LOCAL_HASHED)) {
    const [, stem = "", hash, ext = "", rawQuery = ""] = match;
    const saved = posix.normalize(posix.join(posix.dirname(file), `${stem}${hash}${ext}`));
    if (!existing.has(saved)) continue;
    const original = posix.normalize(posix.join(posix.dirname(file), `${stem}${ext}`));
    const query = rawQuery.replaceAll("&amp;", "&");
    hashed.set(`${original}?${query}`, saved);
    if (!hashedAnyQuery.has(original)) hashedAnyQuery.set(original, saved);
  }
}

/**
 * HTTrack writes where each page came from ("<!-- Mirrored from
 * setagayafes.org/90th/?p=275 by HTTrack ... -->"). Key: the original path and
 * query inside the site ("?p=275", "plan/science"), value: the saved file.
 *
 * @type {Map<string, string>}
 */
const mirrored = new Map();
const MIRRORED_FROM = new RegExp(
  `<!-- Mirrored from (?:www\\.)?setagayafes\\.org/${round.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\S*) by HTTrack`,
);
for (const [file, text] of contents) {
  const from = MIRRORED_FROM.exec(text)?.[1];
  if (from === undefined || !file.endsWith(".html")) continue;
  const key = from.replaceAll("&amp;", "&").replace(/\/$/, "");
  if (!mirrored.has(key)) mirrored.set(key, file);
}

/**
 * Where an old URL's path should point on the archive.
 *
 * @param {string} path Path inside the site, without the leading "/<round>/".
 * @param {string} query The query, without "?" ("" when there is none).
 * @returns {{ path: string, how: string }}
 */
function targetOf(path, query) {
  const plain = query.replaceAll("&amp;", "&");
  const pageKey = `${path.replace(/\/$/, "")}${plain ? `?${plain}` : ""}`;
  if (mirrored.has(pageKey)) {
    const file = mirrored.get(pageKey) ?? path;
    // A folder's index.html is linked as the folder, as the copy itself does.
    return {
      path: file.endsWith("index.html") && !plain ? file.slice(0, -"index.html".length) : file,
      how: "page",
    };
  }
  if (query && hashed.has(`${path}?${plain}`)) {
    return { path: hashed.get(`${path}?${plain}`) ?? path, how: "hashed" };
  }
  const hasIndex = (/** @type {string} */ folder) =>
    exists(`${folder}index.html`) || exists(`${folder}index.htm`);
  if (path === "" || path.endsWith("/"))
    return { path, how: hasIndex(path) ? "folder" : "missing" };
  if (exists(path)) return { path, how: "file" };
  // WordPress links pages without the trailing slash ("/90th/sandan").
  if (hasIndex(`${path}/`)) return { path: `${path}/`, how: "folder" };
  for (const ext of [".html", ".htm"]) {
    if (exists(`${path}${ext}`)) return { path: `${path}${ext}`, how: "page" };
  }
  if (hashedAnyQuery.has(path))
    return { path: hashedAnyQuery.get(path) ?? path, how: "hashed-other-query" };
  return { path, how: "missing" };
}

const escapedRound = round.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Plain URLs and their JSON-escaped form (https:\/\/setagayafes.org\/90th\/…).
const OLD = new RegExp(
  `(https?:)?(\\\\?/\\\\?/)(?:www\\.)?setagayafes\\.org(\\\\?/)${escapedRound}(\\\\?/)([^"'\\s<>()\\\\]*?)(?:\\?([^"'\\s<>()\\\\#]*))?(?=["'\\s<>()\\\\#]|$)`,
  "g",
);

const report = {
  round,
  files: 0,
  urls: 0,
  how: /** @type {Record<string, number>} */ ({}),
  srcsetCandidatesDropped: 0,
  srcsetAttributesRemoved: 0,
  missing: /** @type {Record<string, number>} */ ({}),
};

/** Archive URLs (as written) whose target does not exist there. */
const missingUrls = new Set();

/**
 * A browser prefers a srcset candidate to src, so a candidate that points at
 * a missing file would break an image whose src works. Drop those candidates;
 * drop the attribute when none is left (src, a local copy, is used then).
 *
 * @param {string} html
 */
function pruneSrcset(html) {
  return html.replace(/\s(srcset)=(["'])(.*?)\2/gis, (whole, _name, quote, value) => {
    const candidates = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const kept = candidates.filter((candidate) => !missingUrls.has(candidate.split(/\s+/)[0]));
    if (kept.length === candidates.length) return whole;
    report.srcsetCandidatesDropped += candidates.length - kept.length;
    if (kept.length === 0) {
      report.srcsetAttributesRemoved++;
      return "";
    }
    return ` srcset=${quote}${kept.join(", ")}${quote}`;
  });
}

for (const [file, text] of contents) {
  let changed = false;
  const next = text.replace(OLD, (_whole, _scheme, slashes, _s1, _s2, rawPath = "", rawQuery) => {
    const escaped = slashes.includes("\\");
    const path = escaped ? rawPath.replaceAll("\\/", "/") : rawPath;
    const query = rawQuery ?? "";
    const target = targetOf(path, query);
    report.urls++;
    report.how[target.how] = (report.how[target.how] ?? 0) + 1;
    if (target.how === "missing") {
      const key = `/${round}/${path}`;
      report.missing[key] = (report.missing[key] ?? 0) + 1;
    }
    changed = true;
    // A hashed name already stands for the query, but the copy keeps the query
    // in its own references too; do the same.
    let url = `${ARCHIVE}/${round}/${target.path}${query ? `?${query}` : ""}`;
    if (target.how === "missing") missingUrls.add(url);
    if (escaped) url = url.replaceAll("/", "\\/");
    return url;
  });
  if (!changed) continue;
  report.files++;
  await mkdir(dirname(join(out, file)), { recursive: true });
  await writeFile(join(out, file), /\.html?$/i.test(file) ? pruneSrcset(next) : next, "latin1");
}

report.missing = Object.fromEntries(Object.entries(report.missing).sort((a, b) => b[1] - a[1]));
console.log(JSON.stringify(report, null, 1));
