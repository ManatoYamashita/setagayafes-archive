// Fits a picture into the 16:10 box of the thumbnails without cropping it.
// The picture keeps its pixels; the missing rows (or columns) are filled by
// stretching its edge row (or column), so a gradient background runs on
// instead of ending in a flat band. Used for festivals whose thumbnail is the
// site's OGP image (1200x630) rather than a screenshot (scripts/capture.mjs).

// The callbacks passed to page.evaluate() run in the browser, where these exist.
/* global atob, btoa, Blob, createImageBitmap, OffscreenCanvas */

import { Buffer } from "node:buffer";

/** Width : height of every thumbnail box (src/components/Capture.astro). */
export const BOX_RATIO = Object.freeze({ width: 16, height: 10 });

/**
 * Where a picture of the given size sits in the smallest 16:10 canvas that
 * holds it whole. A wider picture gets rows above and below; a taller one gets
 * columns on both sides. An odd remainder goes to the bottom (or right) side.
 *
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number, x: number, y: number }}
 */
export function letterboxLayout(width, height) {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) {
    throw new Error(`not a picture size: ${width}x${height}`);
  }
  const boxHeight = Math.round((width * BOX_RATIO.height) / BOX_RATIO.width);
  if (boxHeight >= height) {
    return { width, height: boxHeight, x: 0, y: Math.floor((boxHeight - height) / 2) };
  }
  const boxWidth = Math.round((height * BOX_RATIO.width) / BOX_RATIO.height);
  return { width: boxWidth, height, x: Math.floor((boxWidth - width) / 2), y: 0 };
}

/**
 * Letterboxes an encoded picture (PNG, JPEG, WebP, ...) to 16:10 in the
 * browser, and returns it as PNG. Re-encoding through a canvas also drops the
 * picture's metadata.
 *
 * @param {import("playwright").Browser} browser
 * @param {Uint8Array} data
 * @param {string} type The picture's media type, e.g. "image/webp".
 * @returns {Promise<Uint8Array>}
 */
export async function letterboxInBrowser(browser, data, type) {
  const page = await browser.newPage();
  try {
    const size = await page.evaluate(
      async ({ base64, type }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type }));
        return { width: bitmap.width, height: bitmap.height };
      },
      { base64: Buffer.from(data).toString("base64"), type },
    );
    const layout = letterboxLayout(size.width, size.height);
    const png = await page.evaluate(
      async ({ base64, type, layout }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type }));
        const { width: w, height: h } = bitmap;
        const canvas = new OffscreenCanvas(layout.width, layout.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context");
        // Stretch exactly one edge row or column, without blending in its neighbors.
        context.imageSmoothingEnabled = false;
        const after = { x: layout.x + w, y: layout.y + h };
        if (layout.y > 0 || after.y < layout.height) {
          context.drawImage(bitmap, 0, 0, w, 1, 0, 0, w, layout.y);
          context.drawImage(bitmap, 0, h - 1, w, 1, 0, after.y, w, layout.height - after.y);
        } else {
          context.drawImage(bitmap, 0, 0, 1, h, 0, 0, layout.x, h);
          context.drawImage(bitmap, w - 1, 0, 1, h, after.x, 0, layout.width - after.x, h);
        }
        context.drawImage(bitmap, layout.x, layout.y);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        const out = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of out) binary += String.fromCharCode(byte);
        return btoa(binary);
      },
      { base64: Buffer.from(data).toString("base64"), type, layout },
    );
    return new Uint8Array(Buffer.from(png, "base64"));
  } finally {
    await page.close();
  }
}
