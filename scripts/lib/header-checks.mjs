// What the archive host must answer once dist/ and its .htaccess are in place.
// The same checks run against a local Apache (scripts/check-htaccess.mjs) and
// against the production host after a deployment (scripts/check-production.mjs),
// so both are held to one set of expectations.

import assert from "node:assert/strict";
import { styleHashesOf } from "./htaccess.mjs";

/**
 * @typedef {{ status: number, headers: Record<string, string | string[] | undefined>, body: string }} Response
 * @typedef {(path: string, host?: string) => Promise<Response>} Get
 *   Requests a path on the archive host (or on `host` when given).
 */

/** The headers that only the top pages and their files may carry. */
const OWN_ONLY_HEADERS = [
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
];

/**
 * Runs every check and prints one line per check.
 *
 * @param {{
 *   get: Get,
 *   assets: { avif: string, jpeg: string },
 *   pastSite: string,
 *   initialDomain: { host: string, path: string },
 *   forbiddenPath?: string,
 * }} options
 *   `assets`: paths of one card picture and the Open Graph image (/_astro/…);
 *   `pastSite`: a past festival folder, e.g. "/78th/";
 *   `initialDomain`: the archive's top page through the server's initial domain;
 *   `forbiddenPath`: a path the server refuses with 403, where there is one
 *   (only the local Apache has it).
 * @returns {Promise<number>} The number of failed checks.
 */
export async function runHeaderChecks({ get, assets, pastSite, initialDomain, forbiddenPath }) {
  let failed = 0;
  /**
   * @param {string} name
   * @param {() => Promise<void>} run
   */
  async function check(name, run) {
    try {
      await run();
      console.log(`ok   ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}\n     ${/** @type {Error} */ (error).message.split("\n")[0]}`);
    }
  }

  for (const path of ["/", "/index.html", "/en/", "/en/index.html"]) {
    await check(`${path}: indexable, with the page's security headers`, async () => {
      const { status, headers } = await get(path);
      assert.equal(status, 200);
      assert.equal(headers["x-robots-tag"], undefined, "no noindex");
      assert.match(String(headers["content-security-policy"]), /script-src 'none'/);
      assert.match(String(headers["content-security-policy"]), /style-src 'sha256-/);
      // Lighthouse fetches robots.txt from inside the page (docs/design/htaccess.md).
      assert.match(String(headers["content-security-policy"]), /connect-src 'self'/);
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
      assert.match(String(headers["permissions-policy"]), /camera=\(\)/);
      assert.equal(headers["cross-origin-opener-policy"], "same-origin");
      assert.equal(headers["strict-transport-security"], "max-age=31536000");
      assert.equal(headers["cache-control"], "no-cache");
    });
  }

  await check("the inline style hash matches the page", async () => {
    const { body, headers } = await get("/");
    const hashes = styleHashesOf(body);
    assert.ok(hashes.length > 0, "the page has inline styles");
    for (const hash of hashes) {
      assert.ok(String(headers["content-security-policy"]).includes(hash), hash);
    }
  });

  await check(`${assets.avif}: cached for a year, noindex, no CSP`, async () => {
    const { status, headers } = await get(assets.avif);
    assert.equal(status, 200);
    assert.equal(headers["content-type"], "image/avif");
    assert.equal(headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
    assert.equal(headers["content-security-policy"], undefined);
  });

  await check(`${assets.jpeg} (Open Graph image): image/jpeg`, async () => {
    const { status, headers } = await get(assets.jpeg);
    assert.equal(status, 200);
    assert.equal(headers["content-type"], "image/jpeg");
  });

  for (const [path, type] of /** @type {const} */ ([
    ["/robots.txt", /^text\/plain/],
    ["/sitemap.xml", /^(application|text)\/xml/],
    ["/favicon.svg", /^image\/svg\+xml/],
    ["/apple-touch-icon.png", /^image\/png$/],
  ])) {
    await check(`${path}: own file, noindex, no CSP`, async () => {
      const { status, headers } = await get(path);
      assert.equal(status, 200);
      assert.match(String(headers["content-type"]), type);
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
      assert.equal(headers["content-security-policy"], undefined);
    });
  }

  await check(`${pastSite} (a past festival site): untouched except noindex and HSTS`, async () => {
    const { status, headers } = await get(pastSite);
    assert.equal(status, 200);
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
    assert.equal(headers["strict-transport-security"], "max-age=31536000");
    for (const name of [...OWN_ONLY_HEADERS, "cache-control"]) {
      assert.equal(headers[name], undefined, `no ${name}`);
    }
  });

  /**
   * An error page as the server shows it in place of a failed URL: the
   * original status, the page from /errors/, its own CSP and noindex.
   *
   * @param {Response} response
   * @param {number} code
   */
  function assertErrorPage({ status, headers, body }, code) {
    assert.equal(status, code, "keeps the original status (no soft error)");
    assert.match(body, new RegExp(`<title>${code} `), `the /errors/${code}.html page`);
    assert.doesNotMatch(body, /<\?php/, "no PHP source");
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
    const csp = String(headers["content-security-policy"]);
    assert.match(csp, /script-src 'none'/);
    assert.doesNotMatch(csp, /frame-src 'self'/, "the error pages' own policy");
    const hashes = styleHashesOf(body);
    assert.ok(hashes.length > 0, "the page has inline styles");
    for (const hash of hashes) assert.ok(csp.includes(hash), `CSP allows ${hash}`);
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["cache-control"], "no-cache");
  }

  for (const path of ["/no-such-page/", "/no/such/deep/page.html", "/78th/no-such-page.html"]) {
    await check(`${path} (missing): the 404 error page, with status 404 and its CSP`, async () => {
      assertErrorPage(await get(path), 404);
    });
  }

  if (forbiddenPath) {
    await check(`${forbiddenPath} (refused): the 403 error page, with status 403`, async () => {
      assertErrorPage(await get(forbiddenPath), 403);
    });
  }

  await check("/errors/404.html (opened directly): the same policy, noindex", async () => {
    const { status, headers, body } = await get("/errors/404.html");
    assert.equal(status, 200);
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
    for (const hash of styleHashesOf(body)) {
      assert.ok(String(headers["content-security-policy"]).includes(hash), hash);
    }
  });

  // Neither exists, so the server answers with the 404 page: it carries the
  // error pages' headers, never the top pages' policy or indexing.
  await check("/enx/ and /index.html.bak do not count as the top pages", async () => {
    for (const path of ["/enx/", "/index.html.bak"]) {
      const response = await get(path);
      assertErrorPage(response, 404);
      assert.doesNotMatch(String(response.headers["content-security-policy"]), /connect-src/);
    }
  });

  await check("through the server's initial domain: noindex, no HSTS, no CSP", async () => {
    const { headers } = await get(initialDomain.path, initialDomain.host);
    assert.equal(headers["strict-transport-security"], undefined);
    assert.equal(headers["content-security-policy"], undefined);
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
  });

  return failed;
}
