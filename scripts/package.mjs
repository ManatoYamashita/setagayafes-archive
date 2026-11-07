// Packs dist/ into the zip that is deployed to the archive host, then checks
// the zip itself: it is extracted into a temporary folder, its files are
// compared with dist/, and the extracted copy is served by a local Apache to
// check the headers of its .htaccess (scripts/check-htaccess.mjs).
// The deployment steps are in docs/ops/deploy.md.
//
// Needs the `zip` and `unzip` commands (macOS has both). Run after `pnpm build`.
//
// Usage: node scripts/package.mjs [distDir]
// Output: release/archive-top-<commit>.zip and a .sha256 file next to it.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { listFiles } from "./lib/rules.mjs";

const root = process.cwd();
const dist = resolve(process.argv[2] ?? "dist");

if (!existsSync(join(dist, ".htaccess"))) {
  console.error("FAIL dist/.htaccess is missing. Run `pnpm build` first.");
  process.exit(1);
}

/** @param {string[]} args */
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

// The commit goes into the name, so that the server copy can be traced back.
// A dirty tree is allowed for trying things out, but is marked.
const commit = git("rev-parse", "--short=7", "HEAD");
const dirty = git("status", "--porcelain") !== "";
const name = `archive-top-${commit}${dirty ? "-dirty" : ""}.zip`;
const zip = join(root, "release", name);

await mkdir(join(root, "release"), { recursive: true });
await rm(zip, { force: true });
// "." includes dotfiles (.htaccess). -X leaves out extra file attributes.
execFileSync("zip", ["-q", "-r", "-X", zip, ".", "-x", "*.DS_Store"], { cwd: dist });

/** @param {string} file */
async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

const extracted = await mkdtemp(join(tmpdir(), "setagayafes-package-"));
let failed = false;
try {
  execFileSync("unzip", ["-q", zip, "-d", extracted]);

  const expected = await listFiles(dist);
  const actual = await listFiles(extracted);
  const missing = expected.filter((file) => !actual.includes(file));
  const extra = actual.filter((file) => !expected.includes(file));
  const changed = [];
  for (const file of expected.filter((name) => actual.includes(name))) {
    if ((await sha256(join(dist, file))) !== (await sha256(join(extracted, file)))) {
      changed.push(file);
    }
  }
  if (missing.length + extra.length + changed.length > 0) {
    failed = true;
    console.error("FAIL the zip does not match dist/");
    for (const file of missing) console.error(`     missing: ${file}`);
    for (const file of extra) console.error(`     extra: ${file}`);
    for (const file of changed) console.error(`     changed: ${file}`);
  } else {
    console.log(`ok   the zip holds the same ${expected.length} files as dist/ (with .htaccess)`);
  }

  // The extracted copy, served by Apache with the server's .htaccess layout.
  const check = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-htaccess.mjs"), extracted],
    {
      stdio: "inherit",
    },
  );
  if (check.status !== 0) failed = true;
} finally {
  await rm(extracted, { recursive: true, force: true });
}

if (failed) {
  await rm(zip, { force: true });
  console.error("\nThe zip was removed. Fix the problems above and run it again.");
  process.exit(1);
}

const digest = await sha256(zip);
await writeFile(`${zip}.sha256`, `${digest}  ${name}\n`);
console.log(
  `\nrelease/${basename(zip)}\nsha256 ${digest}${dirty ? "\n(dirty: built from uncommitted changes; do not deploy)" : ""}`,
);
