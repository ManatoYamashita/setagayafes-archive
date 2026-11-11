// The preview dialog of a festival's site (src/components/SitePreview.astro)
// and the buttons that open it (src/components/PreviewActions.astro).

import type { Festival } from "../data/festivals.ts";

/** The id of a festival's preview popover; the buttons target it. */
export function previewIdOf(round: number): string {
  return `preview-${round}`;
}

/**
 * Whether a festival's site can be previewed: only sites on this host. A site
 * elsewhere (the 87th, on the Wayback Machine) is outside frame-src 'self'.
 */
export function hasPreview(festival: Festival): boolean {
  return !("externalLink" in festival) || festival.externalLink === undefined;
}
