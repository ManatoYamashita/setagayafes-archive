// Reads PNG chunks, and removes a PNG's metadata without touching its pixels.
// Used for pictures handed over by hand (scripts/import-capture.mjs): design
// tools write XMP (iTXt) and EXIF (eXIf), which can name the author's account
// and software. The image data is inflated and deflated again at the highest
// level, so the file also gets a little smaller; the pixels stay the same.

import { Buffer } from "node:buffer";
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Chunks kept besides IHDR, PLTE, IDAT and IEND: the ones that change how the
 * colors are shown. Everything else (text, EXIF, time, physical size, ...) goes.
 */
const KEPT_ANCILLARY = new Set(["tRNS", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB"]);

/** Chunks that carry metadata. A committed original must have none of them. */
export const METADATA_CHUNKS = Object.freeze(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/**
 * @param {Uint8Array} data
 * @returns {{ type: string, data: Buffer }[]}
 * @throws When the data is not a well-formed PNG.
 */
export function pngChunks(data) {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG");
  }
  /** @type {{ type: string, data: Buffer }[]} */
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("broken PNG: truncated chunk");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("broken PNG: chunk runs past the end");
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset = end;
    if (type === "IEND") break;
  }
  if (chunks[0]?.type !== "IHDR" || chunks.at(-1)?.type !== "IEND") {
    throw new Error("broken PNG: must start with IHDR and end with IEND");
  }
  return chunks;
}

/**
 * @param {Uint8Array} data
 * @returns {{ width: number, height: number }}
 */
export function pngSize(data) {
  const [header] = pngChunks(data);
  return { width: header.data.readUInt32BE(0), height: header.data.readUInt32BE(4) };
}

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Removes the metadata chunks and deflates the image data again at level 9.
 * The filtered scanlines are kept as they are, so the pixels do not change.
 *
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function optimizePng(data) {
  const chunks = pngChunks(data);
  const scanlines = inflateSync(
    Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)),
  );
  const out = [SIGNATURE];
  let wroteData = false;
  for (const { type, data: body } of chunks) {
    if (type === "IDAT") {
      if (!wroteData) out.push(chunk("IDAT", deflateSync(scanlines, { level: 9, memLevel: 9 })));
      wroteData = true;
    } else if (["IHDR", "PLTE", "IEND"].includes(type) || KEPT_ANCILLARY.has(type)) {
      out.push(chunk(type, body));
    }
  }
  return new Uint8Array(Buffer.concat(out));
}
