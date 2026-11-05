// The captured top pages of the festival sites (src/assets/captures/), and
// the images made from them at build time. The originals come from
// `pnpm capture` (scripts/capture.mjs); the AVIF thumbnails and the OGP JPEG
// are never committed, so the display sizes can change without capturing again.

import type { ImageMetadata } from "astro";
import { getImage } from "astro:assets";

const files = import.meta.glob<ImageMetadata>("../assets/captures/*.{png,jpg}", {
  eager: true,
  import: "default",
});

/** Festival number -> original image. File names start with the number ("81st.png"). */
const captures = new Map<number, ImageMetadata>();
for (const [path, image] of Object.entries(files)) {
  const match = /\/(\d+)(?:st|nd|rd|th)\.(?:png|jpg)$/.exec(path);
  if (!match) throw new Error(`unexpected file in src/assets/captures/: ${path}`);
  captures.set(Number(match[1]), image);
}

/**
 * Props for `<Image>` and `<Picture>` that every thumbnail shares. The
 * captures are cropped from the top, where each site has its title.
 * Width, height, `widths` and `sizes` are left to the layout.
 */
export const CAPTURE_IMAGE_PROPS = {
  format: "avif",
  fit: "cover",
  position: "top",
} as const;

/** Size of the Open Graph image, as recommended by the major SNS. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export function hasCapture(number: number): boolean {
  return captures.has(number);
}

/** @throws When the festival has not been captured yet (run `pnpm capture <number>`). */
export function captureOf(number: number): ImageMetadata {
  const image = captures.get(number);
  if (!image) {
    throw new Error(`no capture for festival ${number}: run \`pnpm capture ${number}\``);
  }
  return image;
}

/** The Open Graph image (JPEG, 1200x630) made from a festival's capture. */
export function ogImageOf(number: number) {
  return getImage({
    src: captureOf(number),
    ...OG_IMAGE_SIZE,
    fit: "cover",
    position: "top",
    format: "jpeg",
    quality: 80,
  });
}
