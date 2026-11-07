// Serves dist/ with a local Apache httpd laid out like the Sakura server and
// checks the response headers that dist/.htaccess produces:
//
//   <tmp>/www/.htaccess          the parent file on the server (noindex by host name)
//   <tmp>/www/archive/           DocumentRoot: dist/ with its .htaccess
//   <tmp>/www/archive/78th/      a stand-in for a past festival site (inline script)
//   <tmp>/www/archive/errorpage/ a stand-in for the static error pages
//
// Needs Apache httpd 2.4 (macOS ships one at /usr/sbin/httpd; on Debian and
// Ubuntu, the apache2 package). Run after `pnpm build`.
//
// Usage: node scripts/check-htaccess.mjs [distDir]

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ARCHIVE_HOST } from "./lib/htaccess.mjs";

const dist = resolve(process.argv[2] ?? "dist");
if (!existsSync(join(dist, ".htaccess"))) {
  console.error("FAIL dist/.htaccess is missing. Run `pnpm build` first.");
  process.exit(1);
}

/** Where each platform keeps httpd, its modules and its MIME types. */
const PLATFORMS = [
  {
    httpd: "/usr/sbin/httpd",
    modules: "/usr/libexec/apache2",
    mimeTypes: "/private/etc/apache2/mime.types",
  },
  { httpd: "/usr/sbin/apache2", modules: "/usr/lib/apache2/modules", mimeTypes: "/etc/mime.types" },
];
const platform = PLATFORMS.find(
  (candidate) => existsSync(candidate.httpd) && existsSync(candidate.modules),
);
if (!platform) {
  console.error("FAIL Apache httpd 2.4 was not found (see the comment at the top of this file).");
  process.exit(1);
}

/** The modules the Sakura server has for this purpose. */
const MODULES = [
  "mpm_prefork",
  "unixd",
  "authz_core",
  "log_config",
  "mime",
  "dir",
  "setenvif",
  "headers",
  "filter",
  "deflate",
];

// The parent ~/www/.htaccess on the server, reduced to the part that matters
// here (checked 2026-11-07): it sets noindex for the legacy hosts.
const PARENT_HTACCESS = `
<IfModule mod_setenvif.c>
    SetEnvIf Host "^(about|archive|blog|form|link)\\.setagayafes\\.org$" legacy_host_noindex
</IfModule>
<IfModule mod_headers.c>
    Header always set X-Robots-Tag "noindex, noimageindex" env=legacy_host_noindex
</IfModule>
`;

async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  const address = server.address();
  await new Promise((done) => server.close(() => done(undefined)));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

/**
 * @param {number} port
 * @param {string} path
 * @param {string} host
 * @returns {Promise<{ status: number, headers: import("node:http").IncomingHttpHeaders, body: string }>}
 */
function get(port, path, host = ARCHIVE_HOST) {
  return new Promise((done, fail) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () =>
        done({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", fail);
    req.end();
  });
}

const root = await mkdtemp(join(tmpdir(), "setagayafes-htaccess-"));
const www = join(root, "www");
const archive = join(www, "archive");
const port = await freePort();

await mkdir(join(archive, "78th"), { recursive: true });
await mkdir(join(archive, "errorpage"), { recursive: true });
await writeFile(join(www, ".htaccess"), PARENT_HTACCESS);
await cp(dist, archive, { recursive: true });
await writeFile(
  join(archive, "78th", "index.html"),
  "<!doctype html><title>78th</title><script>document.title = 'ran'</script>",
);
await writeFile(join(archive, "errorpage", "404.html"), "<!doctype html><title>404</title>");
await writeFile(
  join(root, "httpd.conf"),
  [
    `ServerRoot "${root}"`,
    `Listen 127.0.0.1:${port}`,
    // Debian and Ubuntu build some of them in (mpm, unixd, log_config): load only
    // the ones that exist as files.
    ...MODULES.filter((name) => existsSync(`${platform.modules}/mod_${name}.so`)).map(
      (name) => `LoadModule ${name}_module "${platform.modules}/mod_${name}.so"`,
    ),
    `TypesConfig "${platform.mimeTypes}"`,
    `PidFile "${join(root, "httpd.pid")}"`,
    `ErrorLog "${join(root, "error.log")}"`,
    "ServerName localhost",
    `DocumentRoot "${archive}"`,
    `<Directory "${www}">`,
    "  AllowOverride All",
    "  Require all granted",
    "</Directory>",
    "DirectoryIndex index.html",
    "",
  ].join("\n"),
);

// In its own process group: when httpd stops, it signals its whole group, which
// would otherwise include this script.
const httpd = spawn(platform.httpd, ["-f", join(root, "httpd.conf"), "-DFOREGROUND"], {
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
});

let failed = 0;
/**
 * @param {string} name
 * @param {() => Promise<void>} check
 */
async function check(name, check) {
  try {
    await check();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n     ${/** @type {Error} */ (error).message.split("\n")[0]}`);
  }
}

try {
  for (let attempt = 0; ; attempt++) {
    try {
      await get(port, "/");
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await sleep(100);
    }
  }

  const avif = (await readdir(join(dist, "_astro"))).find((name) => name.endsWith(".avif"));
  const jpeg = (await readdir(join(dist, "_astro"))).find((name) => name.endsWith(".jpeg"));

  for (const path of ["/", "/index.html", "/en/", "/en/index.html"]) {
    await check(`${path}: indexable, with the page's security headers`, async () => {
      const { status, headers } = await get(port, path);
      assert.equal(status, 200);
      assert.equal(headers["x-robots-tag"], undefined, "no noindex");
      assert.match(String(headers["content-security-policy"]), /script-src 'none'/);
      assert.match(String(headers["content-security-policy"]), /style-src 'sha256-/);
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
      assert.match(String(headers["permissions-policy"]), /camera=\(\)/);
      assert.equal(headers["cross-origin-opener-policy"], "same-origin");
      assert.equal(headers["strict-transport-security"], "max-age=31536000");
      assert.equal(headers["cache-control"], "no-cache");
    });
  }

  await check("/_astro/*.avif: cached for a year, noindex, no CSP", async () => {
    const { status, headers } = await get(port, `/_astro/${avif}`);
    assert.equal(status, 200);
    assert.equal(headers["content-type"], "image/avif");
    assert.equal(headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
    assert.equal(headers["content-security-policy"], undefined);
  });

  await check("/_astro/*.jpeg (Open Graph image): image/jpeg", async () => {
    const { status, headers } = await get(port, `/_astro/${jpeg}`);
    assert.equal(status, 200);
    assert.equal(headers["content-type"], "image/jpeg");
  });

  for (const [path, type] of [
    ["/robots.txt", /^text\/plain/],
    ["/sitemap.xml", /^(application|text)\/xml/],
    ["/favicon.svg", /^image\/svg\+xml/],
  ]) {
    await check(`${path}: own file, noindex, no CSP`, async () => {
      const { status, headers } = await get(port, String(path));
      assert.equal(status, 200);
      assert.match(String(headers["content-type"]), /** @type {RegExp} */ (type));
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
      assert.equal(headers["content-security-policy"], undefined);
    });
  }

  await check("/78th/ (a past festival site): untouched except noindex and HSTS", async () => {
    const { status, headers } = await get(port, "/78th/");
    assert.equal(status, 200);
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
    assert.equal(headers["strict-transport-security"], "max-age=31536000");
    for (const name of [
      "content-security-policy",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
      "cache-control",
    ]) {
      assert.equal(headers[name], undefined, `no ${name}`);
    }
  });

  await check("a missing page: the static 404 page, noindex", async () => {
    const { status, headers, body } = await get(port, "/no-such-page/");
    assert.equal(status, 404);
    assert.match(body, /<title>404<\/title>/);
    assert.equal(headers["x-robots-tag"], "noindex, noimageindex");
  });

  await check("/enx/ and /index.html.bak do not count as the top pages", async () => {
    for (const path of ["/enx/", "/index.html.bak", "/en/../78th/"]) {
      const { headers } = await get(port, path);
      assert.equal(headers["content-security-policy"], undefined, path);
    }
  });

  await check("another host name (the server's initial domain): no HSTS", async () => {
    const { headers } = await get(port, "/", "setagayafes.sakura.ne.jp");
    assert.equal(headers["strict-transport-security"], undefined);
  });

  await check("the inline style hash matches the page", async () => {
    const [{ body }, { headers }] = await Promise.all([get(port, "/"), get(port, "/")]);
    const { styleHashesOf } = await import("./lib/htaccess.mjs");
    for (const hash of styleHashesOf(body)) {
      assert.ok(String(headers["content-security-policy"]).includes(hash), hash);
    }
  });
} finally {
  httpd.kill("SIGTERM");
  await new Promise((done) => httpd.on("exit", done));
  if (failed > 0) {
    console.error(await readFile(join(root, "error.log"), "utf8").catch(() => ""));
  }
  await rm(root, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
