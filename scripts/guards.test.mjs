// Tests for the guard rules and scripts. Run with `pnpm test`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findClientCodeInHtml,
  findClientCodeInSource,
  findUiRuntimePackages,
  forbiddenFileReason,
} from "./lib/rules.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

describe("forbiddenFileReason", () => {
  for (const path of [
    "dump.sql",
    "backup/site.sql.gz",
    "index.html.bak",
    "top.old",
    "access_log.log",
    "error.log.1",
    "site.zip",
    "entries.xlsx",
    "answers.csv",
    "info.php",
    ".env",
    ".env.production",
    "img/.DS_Store",
    "index.html~",
  ]) {
    test(`rejects ${path}`, () => assert.notEqual(forbiddenFileReason(path), null));
  }

  for (const path of [
    "favicon.ico",
    "robots.txt",
    ".htaccess",
    "img/87th.avif",
    "og/97th.jpg",
    "en/index.html",
    "sitemap-index.xml",
    "styles.css",
  ]) {
    test(`allows ${path}`, () => assert.equal(forbiddenFileReason(path), null));
  }
});

describe("findClientCodeInSource", () => {
  test("finds hydration directives", () => {
    assert.equal(findClientCodeInSource("<Menu client:load />").length, 1);
    assert.equal(findClientCodeInSource("<Menu client:visible />").length, 1);
  });
  test("finds script tags, inline or not", () => {
    assert.equal(findClientCodeInSource("<script>console.log(1)</script>").length, 1);
    assert.equal(findClientCodeInSource('<script is:inline src="/a.js"></script>').length, 1);
  });
  test("accepts plain markup", () => {
    assert.deepEqual(findClientCodeInSource("<details><summary>MENU</summary></details>"), []);
  });
});

describe("findClientCodeInHtml", () => {
  test("finds script tags", () => {
    assert.equal(
      findClientCodeInHtml('<script type="module" src="/_astro/a.js"></script>').length,
      1,
    );
  });
  test("allows JSON-LD", () => {
    assert.deepEqual(findClientCodeInHtml('<script type="application/ld+json">{}</script>'), []);
  });
  test("finds inline event handlers", () => {
    assert.equal(findClientCodeInHtml('<img src="a.avif" onerror="alert(1)">').length, 1);
  });
  test("finds javascript: URLs", () => {
    assert.equal(findClientCodeInHtml('<a href="javascript:void(0)">x</a>').length, 1);
  });
  test("accepts plain HTML", () => {
    assert.deepEqual(findClientCodeInHtml('<a href="/96th/" class="online">第96回</a>'), []);
  });
});

describe("findUiRuntimePackages", () => {
  test("finds UI runtimes in any dependency list", () => {
    assert.deepEqual(
      findUiRuntimePackages({
        dependencies: { astro: "1", "@astrojs/react": "1" },
        devDependencies: { vue: "1" },
      }),
      ["@astrojs/react", "vue"],
    );
  });
  test("accepts the current stack", () => {
    assert.deepEqual(
      findUiRuntimePackages({
        dependencies: { astro: "1", tailwindcss: "1", "@tailwindcss/vite": "1" },
      }),
      [],
    );
  });
});

describe("guard scripts", () => {
  /** @type {string[]} */
  const tempDirs = [];
  after(() => Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))));

  /**
   * @param {Record<string, string>} files
   * @returns {Promise<string>}
   */
  async function fixture(files) {
    const root = await mkdtemp(join(tmpdir(), "guard-"));
    tempDirs.push(root);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    return root;
  }

  /**
   * @param {string} script
   * @param {string} arg
   */
  function run(script, arg) {
    return spawnSync(process.execPath, [join(scriptsDir, script), arg], { encoding: "utf8" });
  }

  test("guard-source passes on a clean project", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({ dependencies: { astro: "1" } }),
      "src/pages/index.astro": "<h1>ok</h1>",
      "public/robots.txt": "User-agent: *",
    });
    assert.equal(run("guard-source.mjs", root).status, 0);
  });

  test("guard-source fails on client:*, a dump in public/ and a UI runtime", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({ dependencies: { astro: "1", "@astrojs/react": "1" } }),
      "src/pages/index.astro": "<Menu client:load />",
      "public/dump.sql": "--",
    });
    const result = run("guard-source.mjs", root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /client:load/);
    assert.match(result.stderr, /public\/dump\.sql/);
    assert.match(result.stderr, /@astrojs\/react/);
  });

  test("guard-dist passes on script-free HTML", async () => {
    const dist = await fixture({ "index.html": "<!doctype html><h1>ok</h1>" });
    assert.equal(run("guard-dist.mjs", dist).status, 0);
  });

  test("guard-dist fails on a JS file, a script tag and a log file", async () => {
    const dist = await fixture({
      "index.html": '<!doctype html><script type="module" src="/_astro/a.js"></script>',
      "_astro/a.js": "",
      "access.log": "",
    });
    const result = run("guard-dist.mjs", dist);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /_astro\/a\.js/);
    assert.match(result.stderr, /script tag/);
    assert.match(result.stderr, /access\.log/);
  });

  test("guard-dist fails when dist is missing", async () => {
    const root = await fixture({});
    assert.equal(run("guard-dist.mjs", join(root, "dist")).status, 1);
  });
});
