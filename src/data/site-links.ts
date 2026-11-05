// Links to the festival committee's current channels, shown in the MENU and
// in the footer. Taken from the previous archive top page (2026-11-05).

import type { Localized } from "./festivals.ts";

export interface SiteLink {
  readonly label: Localized;
  readonly url: string;
}

export const SITE_LINKS = [
  { label: { ja: "公式サイト", en: "Official site" }, url: "https://setagayafes.org/" },
  { label: { ja: "公式ブログ", en: "Official blog" }, url: "https://blog.setagayafes.org/" },
  { label: { ja: "X", en: "X" }, url: "https://x.com/setagayafes_tcu" },
  {
    label: { ja: "Instagram", en: "Instagram" },
    url: "https://www.instagram.com/setagayafes_sfa/",
  },
] as const satisfies readonly SiteLink[];

/** The organiser, shown in the footer. */
export const ORGANIZER = {
  ja: "東京都市大学 世田谷祭実行委員会",
  en: "Tokyo City University Setagaya Festival Executive Committee",
} as const satisfies Localized;
