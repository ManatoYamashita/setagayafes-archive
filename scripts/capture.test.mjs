// Tests for the capture targets and the JPEG metadata removal. Run with `pnpm test`.

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { FESTIVALS, pathOf } from "../src/data/festivals.ts";
import { RELATED_SITES } from "../src/data/related-sites.ts";
import {
  ARCHIVE_ORIGIN,
  CAPTURE_DIR,
  OVERRIDES,
  RELATED_CAPTURE_DIR,
  allFestivalNumbers,
  allRelatedIds,
  captureTarget,
  parseCaptureArgs,
  parseFestivalArgs,
  relatedTarget,
} from "./lib/capture-targets.mjs";
import { exifOrientation, metadataSegments, stripJpegMetadata } from "./lib/jpeg.mjs";
import { METADATA_CHUNKS, optimizePng, pngChunks, pngSize } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("parseFestivalArgs", () => {
  test("selects every festival in the data when no argument is given", () => {
    const rounds = FESTIVALS.map((festival) => festival.round).sort((a, b) => a - b);
    assert.deepEqual(parseFestivalArgs([]), rounds);
  });

  test("accepts numbers and slugs", () => {
    assert.deepEqual(parseFestivalArgs(["94", "97th", "81ST"]), [94, 97, 81]);
  });

  test("rejects a wrong suffix and other text", () => {
    assert.throws(() => parseFestivalArgs(["81th"]), /expected "81st"/);
    assert.throws(() => parseFestivalArgs(["../etc"]), /not a festival number/);
    assert.throws(() => parseFestivalArgs(["97th/"]), /not a festival number/);
  });
});

describe("captureTarget", () => {
  test("every festival in the data can be captured", () => {
    for (const number of allFestivalNumbers()) {
      assert.doesNotThrow(() => captureTarget(number), `festival ${number}`);
    }
  });

  test("every site URL is the festival's folder in the data", () => {
    for (const number of allFestivalNumbers()) {
      const target = captureTarget(number);
      if (target.kind === "site") assert.equal(target.url, `${ARCHIVE_ORIGIN}${pathOf(number)}`);
    }
  });

  test("refuses a festival that is not in the data yet", () => {
    const next = Math.max(...allFestivalNumbers()) + 1;
    assert.throws(() => captureTarget(next), /not in src\/data\/festivals\.ts/);
  });

  test("every override is for a festival in the data", () => {
    const rounds = new Set(allFestivalNumbers());
    for (const key of Object.keys(OVERRIDES)) {
      assert.ok(rounds.has(Number(key)), `OVERRIDES has ${key}, which is not in the data`);
    }
  });

  test("a site is captured from its folder on the archive host", () => {
    assert.deepEqual(captureTarget(81), {
      kind: "site",
      number: 81,
      slug: "81st",
      url: `${ARCHIVE_ORIGIN}/81st/`,
      dir: CAPTURE_DIR,
      file: "81st.png",
      settleMs: 3000,
    });
  });

  test("the 94th waits for its opening loader", () => {
    const target = captureTarget(94);
    assert.equal(target.kind, "site");
    assert.ok(target.kind === "site" && target.settleMs > 10_000);
  });

  test("the 87th, which has no site, uses the photo", () => {
    const target = captureTarget(87);
    assert.equal(target.kind, "photo");
    assert.equal(target.file, "87th.jpg");
  });

  test("the 97th is the picture handed over by the owner, never captured", () => {
    assert.deepEqual(captureTarget(97), {
      kind: "supplied",
      number: 97,
      slug: "97th",
      url: null,
      dir: CAPTURE_DIR,
      file: "97th.png",
    });
  });
});

// A 2x1 RGB PNG whose rows use filter 0, with the given extra chunks.
/** @param {[string, string][]} extra */
function tinyPng(extra = []) {
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const scanlines = Buffer.from([0, 255, 0, 0, 0, 0, 255]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("sRGB", Buffer.from([0])),
      ...extra.map(([type, text]) => chunk(type, Buffer.from(text, "latin1"))),
      chunk("IDAT", deflateSync(scanlines, { level: 0 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("optimizePng", () => {
  const withMetadata = tinyPng([
    ["iTXt", "XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>"],
    ["eXIf", "MM\0*"],
    ["tEXt", "Author\0someone"],
    ["pHYs", "123456789"],
  ]);

  test("removes the metadata chunks and keeps the color chunks", () => {
    const types = pngChunks(optimizePng(withMetadata)).map(({ type }) => type);
    assert.deepEqual(types, ["IHDR", "sRGB", "IDAT", "IEND"]);
  });

  test("keeps the pixels", () => {
    const pixels = (/** @type {Uint8Array} */ png) =>
      inflateSync(
        Buffer.concat(
          pngChunks(png)
            .filter(({ type }) => type === "IDAT")
            .map(({ data }) => data),
        ),
      );
    assert.deepEqual(pixels(optimizePng(withMetadata)), pixels(withMetadata));
    assert.deepEqual(pngSize(optimizePng(withMetadata)), { width: 2, height: 1 });
  });

  test("refuses broken input", () => {
    assert.throws(() => pngChunks(new Uint8Array([1, 2, 3])), /not a PNG/);
    assert.throws(() => pngChunks(withMetadata.subarray(0, 40)), /broken PNG/);
  });
});

describe("related sites", () => {
  test("a related site is captured from its folder into its own directory", () => {
    const site = RELATED_SITES[0];
    assert.deepEqual(relatedTarget(site.id), {
      kind: "site",
      slug: site.id,
      url: `${ARCHIVE_ORIGIN}${site.path}`,
      dir: RELATED_CAPTURE_DIR,
      file: `${site.id}.png`,
      settleMs: 3000,
    });
  });

  test("refuses an id that is not in the data", () => {
    assert.throws(() => relatedTarget("nope"), /not in src\/data\/related-sites\.ts/);
  });

  test("the command line selects festivals and related sites", () => {
    const all = parseCaptureArgs([]);
    assert.equal(all.length, allFestivalNumbers().length + allRelatedIds().length);
    assert.deepEqual(
      parseCaptureArgs(["related"]).map((target) => target.slug),
      allRelatedIds(),
    );
    const [id] = allRelatedIds();
    assert.deepEqual(
      parseCaptureArgs(["94", id ?? ""]).map((target) => target.slug),
      ["94th", id],
    );
    assert.throws(() => parseCaptureArgs(["../etc"]), /not a festival number/);
  });
});

// A minimal JPEG made of the segments that matter here. The decoder never
// sees it, so the tables and the scan data are placeholders.
/** @param {number} marker @param {number[] | string} payload */
function segment(marker, payload) {
  const bytes = typeof payload === "string" ? [...payload].map((c) => c.charCodeAt(0)) : payload;
  const length = bytes.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...bytes];
}

/** EXIF payload ("MM" byte order) with only the orientation tag in IFD0. */
function exif(/** @type {number} */ orientation) {
  return [
    ...[..."Exif\0\0"].map((c) => c.charCodeAt(0)),
    ...[0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08],
    ...[0x00, 0x01],
    ...[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00],
  ];
}

const APP0 = segment(0xe0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
const ICC = segment(0xe2, "ICC_PROFILE\0\x01\x01profile");
const ADOBE = segment(0xee, "Adobe\0\x64\0\0\0\0\x01");
const DQT = segment(0xdb, [0x00, ...Array(64).fill(1)]);
const SOS = segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
// Scan data with a stuffed 0xFF00 and a restart marker, which are not segments.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

/** @param {number[][]} parts */
const jpeg = (...parts) => new Uint8Array(parts.flat());

describe("stripJpegMetadata", () => {
  const clean = jpeg(SOI, APP0, ICC, ADOBE, DQT, SOS, SCAN, EOI);

  test("removes EXIF, XMP, IPTC, comments, MPF and trailing data", () => {
    const input = jpeg(
      SOI,
      APP0,
      segment(0xe1, exif(1)),
      segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>"),
      ICC,
      segment(0xe2, "MPF\0preview"),
      segment(0xed, "Photoshop 3.0\0iptc"),
      segment(0xfe, "camera owner"),
      ADOBE,
      DQT,
      SOS,
      SCAN,
      EOI,
      [0xff, 0xd8, 0x99, 0x99], // a second picture appended after EOI
    );
    assert.deepEqual(stripJpegMetadata(input), clean);
  });

  test("keeps a clean JPEG byte for byte", () => {
    assert.deepEqual(stripJpegMetadata(clean), clean);
  });

  test("handles metadata between the scans of a progressive JPEG", () => {
    const input = jpeg(SOI, APP0, DQT, SOS, SCAN, segment(0xfe, "note"), SOS, SCAN, EOI);
    assert.deepEqual(stripJpegMetadata(input), jpeg(SOI, APP0, DQT, SOS, SCAN, SOS, SCAN, EOI));
  });

  test("refuses a photo that relies on its EXIF orientation", () => {
    const input = jpeg(SOI, segment(0xe1, exif(6)), DQT, SOS, SCAN, EOI);
    assert.throws(() => stripJpegMetadata(input), /orientation is 6/);
  });

  test("refuses broken input", () => {
    assert.throws(() => stripJpegMetadata(new Uint8Array([0x89, 0x50])), /not a JPEG/);
    assert.throws(() => stripJpegMetadata(jpeg(SOI, APP0)), /truncated/);
    assert.throws(() => stripJpegMetadata(jpeg(SOI, DQT, SOS, SCAN)), /truncated/);
    assert.throws(() => stripJpegMetadata(jpeg(SOI, [0xff, 0xdb, 0x7f, 0xff])), /bad segment/);
  });

  test("reads the EXIF orientation", () => {
    assert.equal(exifOrientation(new Uint8Array(exif(1))), 1);
    assert.equal(exifOrientation(new Uint8Array(exif(8))), 8);
    assert.equal(exifOrientation(new Uint8Array(Buffer.from("http://ns.adobe.com/"))), null);
  });
});

describe(`${CAPTURE_DIR}/`, async () => {
  const dir = join(root, CAPTURE_DIR);
  const files = await readdir(dir);

  test("has one original for every festival, and nothing else", () => {
    const expected = allFestivalNumbers()
      .map((number) => captureTarget(number).file)
      .sort();
    assert.deepEqual([...files].sort(), expected);
  });
  for (const file of files.filter((name) => name.endsWith(".png"))) {
    test(`${file} carries no metadata`, async () => {
      const types = pngChunks(new Uint8Array(await readFile(join(dir, file)))).map((c) => c.type);
      const left = types.filter((type) => METADATA_CHUNKS.includes(type));
      assert.deepEqual(left, [], `metadata left in ${file}`);
    });
  }
  for (const file of files.filter((name) => name.endsWith(".jpg"))) {
    test(`${file} carries no metadata`, async () => {
      const bytes = new Uint8Array(await readFile(join(dir, file)));
      const ids = metadataSegments(bytes).map(({ marker, id }) => `${marker.toString(16)} ${id}`);
      assert.ok(
        ids.every((id) => /^e0 JFIF|^e2 ICC_PROFILE|^ee Adobe/.test(id)),
        `metadata left in ${file}: ${ids.join(", ")}`,
      );
      assert.deepEqual(stripJpegMetadata(bytes), bytes);
    });
  }
});

describe(`${RELATED_CAPTURE_DIR}/`, async () => {
  const files = await readdir(join(root, RELATED_CAPTURE_DIR));

  test("has one original for every linked related site, and nothing else", () => {
    const expected = allRelatedIds()
      .map((id) => relatedTarget(id).file)
      .sort();
    assert.deepEqual([...files].sort(), expected);
  });
});
