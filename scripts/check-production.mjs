// Checks the production host after a deployment (docs/ops/deploy.md): the
// same header checks as the local Apache (scripts/lib/header-checks.mjs), plus
// what only the real server does (the http-to-https redirect, the noindex of
// the parent ~/www/.htaccess). Read-only: it only sends GET requests.
//
// Usage: node scripts/check-production.mjs

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { runHeaderChecks } from "./lib/header-checks.mjs";
import { ARCHIVE_HOST } from "./lib/htaccess.mjs";

const INITIAL_DOMAIN = "setagayafes.sakura.ne.jp";

/**
 * @param {string} url
 * @param {Record<string, string>} [requestHeaders]
 * @returns {Promise<import("./lib/header-checks.mjs").Response>}
 */
function fetchRaw(url, requestHeaders = {}) {
  const request = url.startsWith("https:") ? httpsRequest : httpRequest;
  return new Promise((done, fail) => {
    const req = request(
      url,
      {
        headers: { ...requestHeaders, "user-agent": "setagayafes-archive deploy check" },
        timeout: 15_000,
      },
      (response) => {
        /** @type {Buffer[]} */
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          done({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            raw: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timeout: ${url}`)));
    req.on("error", fail);
    req.end();
  });
}

/** @type {import("./lib/header-checks.mjs").Get} */
const get = (path, host = ARCHIVE_HOST, requestHeaders = {}) =>
  fetchRaw(`https://${host}${path}`, requestHeaders);

// The asset names change with every build, so read them from the live page.
const top = await get("/");
const avif = top.body.match(/\/_astro\/[^"'\s,]+\.avif/)?.[0];
const jpeg = top.body.match(
  /property="og:image" content="https:\/\/[^/]+(\/_astro\/[^"]+\.jpeg)"/,
)?.[1];
if (!avif || !jpeg) {
  console.error("FAIL the top page has no /_astro/*.avif or no og:image. Is the new top deployed?");
  process.exit(1);
}

let failed = await runHeaderChecks({
  get,
  assets: { avif, jpeg },
  pastSite: "/78th/",
  initialDomain: { host: INITIAL_DOMAIN, path: "/archive/" },
});

// Kept as 302 by the server's control panel, with HSTS (docs/design/htaccess.md).
try {
  const { status, headers } = await fetchRaw(`http://${ARCHIVE_HOST}/`);
  assert.equal(status, 302);
  assert.equal(headers.location, `https://${ARCHIVE_HOST}/`);
  console.log("ok   http:// redirects to https:// (302, by the control panel)");
} catch (error) {
  failed++;
  console.error(`FAIL http:// redirect\n     ${/** @type {Error} */ (error).message}`);
}

if (failed > 0) {
  console.error(
    `\n${failed} check(s) failed. Roll back if the site is broken (docs/ops/deploy.md).`,
  );
  process.exit(1);
}
