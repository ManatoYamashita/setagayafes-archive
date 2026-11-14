// Serves dist/ with a local Apache httpd laid out like the Sakura server and
// checks the response headers that dist/.htaccess produces:
//
//   <tmp>/www/.htaccess          the parent file on the server (noindex by host name)
//   <tmp>/www/archive/           the archive host's DocumentRoot: dist/ with its .htaccess
//   <tmp>/www/archive/78th/      a stand-in for a past festival site (inline script)
//   <tmp>/www/archive/errorpage/ a stand-in for the static error pages
//
// Needs Apache httpd 2.4 (macOS ships one at /usr/sbin/httpd; on Debian and
// Ubuntu, the apache2 package). Run after `pnpm build`.
//
// Usage: node scripts/check-htaccess.mjs [distDir]

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runHeaderChecks } from "./lib/header-checks.mjs";
import { ARCHIVE_HOST } from "./lib/htaccess.mjs";

/** The Sakura server's initial domain, which reaches every folder under ~/www. */
const INITIAL_DOMAIN = "setagayafes.sakura.ne.jp";

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
  "rewrite",
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
 * @param {Record<string, string>} [requestHeaders]
 * @returns {Promise<import("./lib/header-checks.mjs").Response>}
 */
function get(port, path, host = ARCHIVE_HOST, requestHeaders = {}) {
  return new Promise((done, fail) => {
    const headers = { ...requestHeaders, host };
    const req = request({ host: "127.0.0.1", port, path, headers }, (response) => {
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
    // Name-based hosts, as on the server: the archive host serves ~/www/archive,
    // the initial domain serves ~/www (so the archive is at /archive/ there).
    `<VirtualHost 127.0.0.1:${port}>`,
    `  ServerName ${ARCHIVE_HOST}`,
    `  DocumentRoot "${archive}"`,
    "</VirtualHost>",
    `<VirtualHost 127.0.0.1:${port}>`,
    `  ServerName ${INITIAL_DOMAIN}`,
    `  DocumentRoot "${www}"`,
    "</VirtualHost>",
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

  const astro = await readdir(join(dist, "_astro"));
  const avif = astro.find((name) => name.endsWith(".avif"));
  const jpeg = astro.find((name) => name.endsWith(".jpeg"));
  if (!avif || !jpeg) throw new Error("dist/_astro/ has no .avif or no .jpeg");

  failed = await runHeaderChecks({
    get: (path, host, requestHeaders) => get(port, path, host, requestHeaders),
    assets: { avif: `/_astro/${avif}`, jpeg: `/_astro/${jpeg}` },
    pastSite: "/78th/",
    initialDomain: { host: INITIAL_DOMAIN, path: "/archive/" },
    notFoundBody: /<title>404<\/title>/,
    // mod_deflate is loaded here, so a gzip response alone does not prove the
    // rewrite: the bytes must be the build's own .gz files.
    precompressed: {
      "/": await readFile(join(dist, "index.html.gz")),
      "/en/": await readFile(join(dist, "en", "index.html.gz")),
    },
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
