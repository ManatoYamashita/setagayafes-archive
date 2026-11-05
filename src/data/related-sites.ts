// Related sites listed below the festival grid.
// Source of truth: Issue #1 ("関連サイト"). Field definitions are in
// docs/data/festivals.md.

import type { IsoDate, Localized } from "./festivals.ts";

export interface RelatedSite {
  readonly id: string;
  readonly name: Localized;
  /** Festival dates, when the site is for a festival. */
  readonly dates?: { readonly start: IsoDate; readonly end: IsoDate };
  /** The year the site dates from, when it has no festival dates. */
  readonly year?: number;
  /** Folder on this host. */
  readonly path: `/${string}/`;
  /**
   * The Issue that must be closed before the site is linked. Until then the
   * site is listed without a link.
   */
  readonly blockedBy?: number;
}

export const RELATED_SITES = [
  {
    id: "todoroki-2011",
    name: { ja: "第3回 TCU等々力祭", en: "3rd TCU Todoroki Festival" },
    // Held on the same day as the 82nd Setagaya Festival.
    dates: { start: "2011-11-20", end: "2011-11-20" },
    path: "/todoroki/2011/",
    // Still served by WordPress. Linked once it is made static (Issue #2).
    blockedBy: 2,
  },
  {
    id: "todoroki-2012",
    name: { ja: "第4回 等々力祭", en: "4th Todoroki Festival" },
    // "平成24年11月24日(土)～25日(日)" on the festival's own site.
    dates: { start: "2012-11-24", end: "2012-11-25" },
    path: "/todoroki/2012/",
    blockedBy: 2,
  },
  {
    id: "committee-2011",
    name: {
      ja: "東京都市大学 世田谷祭運営委員会（旧サイト）",
      en: "Tokyo City University Setagaya Festival Committee (former site)",
    },
    // The site's update log runs through 2011.
    year: 2011,
    path: "/tfa/",
  },
] as const satisfies readonly RelatedSite[];
