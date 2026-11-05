// Removes metadata (EXIF, XMP, IPTC, comments, embedded previews) from a JPEG
// without re-encoding it. Used for photos that are committed to the
// repository, so that camera details and locations are never published.
//
// The image data is copied byte for byte. Only these segments are kept:
// - APP0 (JFIF header)
// - APP2 that holds an ICC profile (needed to show the colors correctly)
// - APP14 "Adobe" (tells the decoder how to read the color channels)
// - every non-APP, non-COM segment (tables, frame and scan headers, ...)
// Anything after the end-of-image marker (for example the extra pictures of
// an MPF file) is dropped.

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const APP15 = 0xef;
const COM = 0xfe;

/** Markers that stand alone, without a length field. */
function isStandalone(/** @type {number} */ marker) {
  return marker === SOI || marker === EOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {string} text
 */
function startsWithAscii(bytes, start, text) {
  if (start + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[start + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Reads the EXIF orientation (tag 0x0112 in IFD0) from an APP1 payload.
 *
 * @param {Uint8Array} payload The segment payload, after the length field.
 * @returns {number | null} 1-8, or null when the segment has no orientation.
 */
export function exifOrientation(payload) {
  if (!startsWithAscii(payload, 0, "Exif\0\0")) return null;
  const tiff = 6;
  if (tiff + 8 > payload.length) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const order = String.fromCharCode(payload[tiff], payload[tiff + 1]);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > payload.length) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > payload.length) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      return view.getUint16(entry + 8, little);
    }
  }
  return null;
}

/**
 * @param {Uint8Array} input A baseline or progressive JPEG.
 * @returns {Uint8Array} The same image without metadata.
 * @throws When the input is not a JPEG, is truncated, or relies on an EXIF
 *   orientation other than 1 (dropping it would show the photo rotated).
 */
export function stripJpegMetadata(input) {
  if (input[0] !== 0xff || input[1] !== SOI) throw new Error("not a JPEG (no SOI marker)");

  /** @type {Uint8Array[]} */
  const kept = [input.subarray(0, 2)];
  let offset = 2;

  for (;;) {
    if (offset + 2 > input.length) throw new Error("truncated JPEG (no EOI marker)");
    if (input[offset] !== 0xff) throw new Error(`expected a marker at byte ${offset}`);
    // Any number of 0xFF fill bytes may precede a marker.
    let markerAt = offset;
    while (input[markerAt + 1] === 0xff) markerAt++;
    const marker = input[markerAt + 1];
    offset = markerAt + 2;

    if (marker === EOI) {
      kept.push(input.subarray(markerAt, offset));
      break;
    }
    if (isStandalone(marker)) {
      kept.push(input.subarray(markerAt, offset));
      continue;
    }

    if (offset + 2 > input.length) throw new Error("truncated JPEG segment");
    const length = (input[offset] << 8) | input[offset + 1];
    const end = offset + length;
    if (length < 2 || end > input.length) throw new Error(`bad segment length at byte ${offset}`);
    const payload = input.subarray(offset + 2, end);

    let keep = true;
    if (marker === APP1) {
      const orientation = exifOrientation(payload);
      if (orientation !== null && orientation !== 1) {
        throw new Error(
          `EXIF orientation is ${orientation}; rotate the photo before stripping its metadata`,
        );
      }
      keep = false;
    } else if (marker === APP2) {
      keep = startsWithAscii(payload, 0, "ICC_PROFILE\0");
    } else if (marker === APP14) {
      keep = startsWithAscii(payload, 0, "Adobe");
    } else if ((marker > APP0 && marker <= APP15) || marker === COM) {
      keep = false;
    }
    if (keep) kept.push(input.subarray(markerAt, end));
    offset = end;

    if (marker === SOS) {
      // Entropy-coded data runs until the next marker that is not a stuffed
      // 0x00 byte or a restart marker.
      let scan = offset;
      while (scan + 1 < input.length) {
        if (input[scan] === 0xff) {
          const next = input[scan + 1];
          if (next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        scan++;
      }
      if (scan + 1 >= input.length) throw new Error("truncated JPEG (scan data runs to the end)");
      kept.push(input.subarray(offset, scan));
      offset = scan;
    }
  }

  const output = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of kept) {
    output.set(part, at);
    at += part.length;
  }
  return output;
}

/**
 * Lists the APPn and COM segments of a JPEG, for tests and checks.
 *
 * @param {Uint8Array} input
 * @returns {{ marker: number, id: string }[]} Marker and the first ASCII bytes of the payload.
 */
export function metadataSegments(input) {
  /** @type {{ marker: number, id: string }[]} */
  const found = [];
  let offset = 2;
  while (offset + 4 <= input.length && input[offset] === 0xff) {
    const marker = input[offset + 1];
    if (marker === SOS || marker === EOI) break;
    const length = (input[offset + 2] << 8) | input[offset + 3];
    if ((marker >= APP0 && marker <= APP15) || marker === COM) {
      const payload = input.subarray(offset + 4, offset + 2 + length);
      found.push({
        marker,
        id: String.fromCharCode(...payload.subarray(0, 12)).replace(/[^\x20-\x7e]/g, "."),
      });
    }
    offset += 2 + length;
  }
  return found;
}
