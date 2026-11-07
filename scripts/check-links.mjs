// Checks online the links that the build cannot check offline: the archived
// festival sites on this host (/78th/, /tfa/, ...) and links to other hosts.
// Run before deploying, after `pnpm build`. Not run in CI: the result depends
// on other people's servers.
//
// - 2xx (after redirects) is ok
// - 401, 403, 429 and 999 mean the host refused an automated client; they are
//   reported as "could not verify" and do not fail the check (X and Instagram
//   often answer this way). Open those links in a browser
// - anything else (404, 410, 5xx, DNS or TLS errors, timeouts) fails
//
// Usage: node scripts/check-links.mjs [distDir]

import { join } from "node:path";
import { listFiles, report } from "./lib/rules.mjs";
import { checkDistLinks } from "./lib/site.mjs";

const dist = process.argv[2] ?? join(process.cwd(), "dist");
const files = await listFiles(dist);
if (files.length === 0) {
  console.error(`FAIL ${dist} is empty or missing. Run \`pnpm build\` first.`);
  process.exit(1);
}

const links = await checkDistLinks(dist, files);
report("links to this site point to files in dist/ or to archived sites", links.broken);

const UNVERIFIABLE = new Set([401, 403, 429, 999]);
const TIMEOUT_MS = 15_000;
const HEADERS = { "user-agent": "setagayafes-archive link check", accept: "text/html,*/*" };

/**
 * @param {string} url
 * @returns {Promise<{ url: string, status: number | null, error?: string }>}
 */
async function probe(url) {
  try {
    // HEAD first; some servers answer HEAD wrongly, so retry once with GET.
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      await response.body?.cancel();
    }
    return { url, status: response.status };
  } catch (error) {
    const cause = /** @type {{ cause?: { code?: string } }} */ (error).cause?.code;
    return { url, status: null, error: cause ?? String(error) };
  }
}

/**
 * Runs the probes a few at a time, to stay polite to the servers.
 *
 * @param {string[]} urls
 */
async function probeAll(urls) {
  /** @type {Awaited<ReturnType<typeof probe>>[]} */
  const results = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        results.push(await probe(url));
      }
    }),
  );
  return results.sort((a, b) => a.url.localeCompare(b.url));
}

for (const [title, urls] of /** @type {const} */ ([
  ["archived sites on this host answer", links.server],
  ["links to other hosts answer", links.external],
])) {
  const results = await probeAll(urls);
  const failed = results
    .filter(({ status }) => status === null || (status >= 300 && !UNVERIFIABLE.has(status)))
    .map(({ url, status, error }) => `${url}: ${status ?? error}`);
  report(`${title} (${results.length})`, failed);
  for (const { url, status } of results) {
    if (status !== null && UNVERIFIABLE.has(status)) {
      console.log(`     could not verify ${url}: ${status} (open it in a browser)`);
    }
  }
}
