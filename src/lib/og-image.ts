// The link-preview (Open Graph) image. The original is a fixed design
// (src/assets/og/ogp.jpg, 1920x1080) committed with its metadata stripped;
// the 1200x630 JPEG is made from it at build time and never committed.

import { getImage } from "astro:assets";
import original from "../assets/og/ogp.jpg";

/** Size of the Open Graph image, as recommended by the major SNS. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/**
 * The Open Graph image (JPEG, 1200x630). The 16:9 original is cropped evenly
 * from the top and bottom; the logo, the title and the URL stay inside.
 */
export function ogImage() {
  return getImage({
    src: original,
    ...OG_IMAGE_SIZE,
    fit: "cover",
    position: "center",
    format: "jpeg",
    quality: 80,
  });
}
