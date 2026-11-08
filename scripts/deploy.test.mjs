// Tests for the server-side deployment scripts (scripts/ops/deploy/), run
// against a fake home folder laid out like the Sakura server. They need `sh`,
// `zip` and `unzip`.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { listFiles } from "./lib/rules.mjs";

const DEPLOY = join(import.meta.dirname, "ops", "deploy", "remote-deploy.sh");
const ROLLBACK = join(import.meta.dirname, "ops", "deploy", "remote-rollback.sh");

/** @type {string} */
let home;
/** @type {string} */
let publicDir;

/**
 * @param {string} root
 * @param {Record<string, string>} files
 */
async function writeTree(root, files) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

/** @param {string} root */
async function snapshot(root) {
  /** @type {Record<string, string>} */
  const tree = {};
  for (const file of (await listFiles(root)).toSorted()) {
    tree[file] = await readFile(join(root, file), "utf8");
  }
  return tree;
}

/**
 * Puts a zip of `files` (and its .sha256) into the inbox.
 *
 * @param {string} name
 * @param {Record<string, string>} files
 */
async function inbox(name, files) {
  const source = await mkdtemp(join(tmpdir(), "setagayafes-zip-"));
  await writeTree(source, files);
  const zip = join(home, "archive-docs", "deploy", "inbox", name);
  await mkdir(dirname(zip), { recursive: true });
  execFileSync("zip", ["-q", "-r", "-X", zip, "."], { cwd: source });
  await rm(source, { recursive: true, force: true });
  const digest = createHash("sha256")
    .update(await readFile(zip))
    .digest("hex");
  await writeFile(`${zip}.sha256`, `${digest}  ${name}\n`);
  return zip;
}

/**
 * @param {string} script
 * @param {string} arg
 * @param {string} stamp
 */
function run(script, arg, stamp = "20261107-000000") {
  return spawnSync("sh", [script, arg], {
    env: { ...process.env, HOME: home, STAMP: stamp, PUBLIC: "" },
    encoding: "utf8",
  });
}

const BEFORE = {
  ".htaccess": "old htaccess",
  "index.html": "old top",
  "robots.txt": "old robots",
  "78th/index.html": "<script>past site</script>",
  "img/87th.JPG": "photo",
  "errorpage/404.html": "404",
};

const NEW_TOP = {
  ".htaccess": "new htaccess",
  "index.html": "new top",
  "robots.txt": "new robots",
  "sitemap.xml": "<urlset/>",
  "en/index.html": "english",
  "_astro/a.avif": "a",
};

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "setagayafes-home-"));
  publicDir = join(home, "www", "archive");
  await writeTree(publicDir, BEFORE);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("remote-deploy.sh and remote-rollback.sh", () => {
  test("deploy writes only the zip's entries and keeps the rest", async () => {
    await inbox("top.zip", NEW_TOP);
    const result = run(DEPLOY, "top.zip");
    assert.equal(result.status, 0, result.stderr);
    const after = await snapshot(publicDir);
    for (const [path, content] of Object.entries(NEW_TOP)) assert.equal(after[path], content, path);
    for (const path of ["78th/index.html", "img/87th.JPG", "errorpage/404.html"]) {
      assert.equal(after[path], BEFORE[/** @type {keyof typeof BEFORE} */ (path)], path);
    }
  });

  test("rollback restores the folder exactly", async () => {
    const before = await snapshot(publicDir);
    await inbox("top.zip", NEW_TOP);
    assert.equal(run(DEPLOY, "top.zip").status, 0);
    const result = run(ROLLBACK, "20261107-000000");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await snapshot(publicDir), before);
  });

  test("a second deployment replaces folders, so stale hashed files go away", async () => {
    await inbox("v1.zip", NEW_TOP);
    assert.equal(run(DEPLOY, "v1.zip", "20261107-000001").status, 0);
    const v2 = { ...NEW_TOP, "_astro/b.avif": "b" };
    delete (/** @type {Record<string, string>} */ (v2)["_astro/a.avif"]);
    await inbox("v2.zip", v2);
    assert.equal(run(DEPLOY, "v2.zip", "20261107-000002").status, 0);
    const after = await snapshot(publicDir);
    assert.equal(after["_astro/b.avif"], "b");
    assert.equal(after["_astro/a.avif"], undefined);

    // Rolling back the second deployment brings back the first.
    assert.equal(run(ROLLBACK, "20261107-000002").status, 0);
    assert.equal((await snapshot(publicDir))["_astro/a.avif"], "a");
  });

  test("refuses a zip that would overwrite a past festival folder", async () => {
    const before = await snapshot(publicDir);
    await inbox("bad.zip", { ...NEW_TOP, "78th/index.html": "overwritten" });
    const result = run(DEPLOY, "bad.zip");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not own: 78th/);
    assert.deepEqual(await snapshot(publicDir), before);
  });

  test("refuses to reuse a backup, so the originals' backup is never overwritten", async () => {
    await inbox("top.zip", NEW_TOP);
    assert.equal(run(DEPLOY, "top.zip").status, 0);
    const backup = join(home, "archive-docs", "deploy", "20261107-000000");
    const kept = await snapshot(backup);

    const again = run(DEPLOY, "top.zip");
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /a backup for 20261107-000000 already exists/);
    assert.deepEqual(await snapshot(backup), kept);

    // The rollback still brings back the originals.
    assert.equal(run(ROLLBACK, "20261107-000000").status, 0);
    assert.equal((await snapshot(publicDir))["index.html"], BEFORE["index.html"]);
  });

  test("refuses to replace a folder that no deployment of ours created", async () => {
    await writeTree(publicDir, { ".well-known/acme-challenge/token": "certificate" });
    const before = await snapshot(publicDir);
    await inbox("top.zip", { ...NEW_TOP, ".well-known/security.txt": "contact" });
    const result = run(DEPLOY, "top.zip");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /did not create: \.well-known/);
    assert.deepEqual(await snapshot(publicDir), before);
  });

  test("a refused deployment does not count as having created a folder", async () => {
    await inbox("bad.zip", { ...NEW_TOP, "shared/a.txt": "a", "78th/index.html": "x" });
    assert.notEqual(run(DEPLOY, "bad.zip", "20261107-000001").status, 0);
    // Someone else then makes the same folder on the server.
    await writeTree(publicDir, { "shared/theirs.txt": "theirs" });
    await inbox("top.zip", { ...NEW_TOP, "shared/a.txt": "a" });
    const result = run(DEPLOY, "top.zip", "20261107-000002");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /did not create: shared/);
    assert.equal((await snapshot(publicDir))["shared/theirs.txt"], "theirs");
  });

  test("refuses a zip whose checksum does not match", async () => {
    const before = await snapshot(publicDir);
    const zip = await inbox("top.zip", NEW_TOP);
    await writeFile(`${zip}.sha256`, `${"0".repeat(64)}  top.zip\n`);
    const result = run(DEPLOY, "top.zip");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum mismatch/);
    assert.deepEqual(await snapshot(publicDir), before);
  });
});
