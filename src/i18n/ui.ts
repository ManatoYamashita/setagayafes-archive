// The words of the archive top page in each language: Japanese at "/",
// English at "/en/". Facts about the festivals (themes, names, dates) are in
// src/data/; this file holds only the page's own wording.
//
// Node also reads this file (unbundled) in the end-to-end tests: keep it to
// syntax that type stripping can handle, and import with the ".ts" extension.

import { ordinalOf, titleOf, type Festival, type Lang } from "../data/festivals.ts";

export const LANGS = ["ja", "en"] as const satisfies readonly Lang[];

/** The top page of each language. */
export const HOME_PATHS = { ja: "/", en: "/en/" } as const satisfies Record<Lang, `/${string}`>;

/** Each language's name, written in that language (for the language switch). */
export const LANG_NAMES = { ja: "日本語", en: "English" } as const satisfies Record<Lang, string>;

/** The other language, for the language switch. */
export function otherLang(lang: Lang): Lang {
  return lang === "ja" ? "en" : "ja";
}

interface Words {
  readonly siteName: string;
  /** Meta description. `first` is the oldest festival in the archive. */
  readonly description: (first: { round: number; year: number }) => string;
  /** Alt text of the link-preview (Open Graph) image: a festival site's top page. */
  readonly ogImageAlt: (round: string, festivalName: string) => string;
  readonly menu: string;
  readonly menuLabel: string;
  readonly footerMenuLabel: string;
  readonly socialLabel: string;
  readonly close: string;
  /** Links to the page's sections in the header. */
  readonly sectionsLabel: string;
  readonly navLatest: string;
  readonly navArchive: string;
  readonly navRelated: string;
  /** Before the organiser's name at the right end of the header. */
  readonly runBy: string;
  /**
   * The large Latin word of each section heading, and the short vertical label
   * beside it. The vertical labels are Japanese only; English leaves them empty.
   */
  readonly latestWord: string;
  readonly latestVertical: string;
  readonly archiveWord: string;
  readonly archiveVertical: string;
  readonly relatedWord: string;
  readonly relatedVertical: string;
  /** Names the hero's picker of the latest festivals. */
  readonly heroPicker: string;
  /** The hero's link to a festival's site: visible text, then hidden words naming the round. */
  readonly visitLabel: string;
  readonly visitTarget: (round: string) => string;
  readonly archive: string;
  readonly archiveIntro: string;
  readonly filterLegend: string;
  readonly filterAll: string;
  readonly showing: (count: number) => string;
  /** Appended to dates that are inferred rather than stated by the site. */
  readonly estimated: string;
  readonly relatedSites: string;
  /** Shown instead of a link while a related site is being prepared. */
  readonly comingSoon: string;
  readonly footerNote: string;
  /** Closes a sentence: "。" in Japanese, "." in English. */
  readonly fullStop: string;
  /** Between two sentences: nothing in Japanese, a space in English. */
  readonly sentenceGap: string;
}

export const UI = {
  ja: {
    siteName: "世田谷祭アーカイブ",
    description: ({ round, year }) =>
      `東京都市大学（旧 武蔵工業大学）の学園祭、世田谷祭の過去のWebサイトの一覧です。第${round}回（${year}年）からの各回のサイトを、公開当時のまま残しています。`,
    ogImageAlt: (round, festivalName) => `${round}${festivalName}の公式サイトのトップページ`,
    menu: "MENU",
    menuLabel: "世田谷祭の公式サイトとSNS",
    footerMenuLabel: "世田谷祭の公式サイトとSNS（フッター）",
    socialLabel: "世田谷祭のSNS",
    close: "閉じる",
    sectionsLabel: "ページ内の移動",
    navLatest: "最新",
    navArchive: "アーカイブ",
    navRelated: "関連サイト",
    runBy: "運営",
    latestWord: "Latest",
    latestVertical: "最新の回",
    archiveWord: "Archive",
    archiveVertical: "過去の回",
    relatedWord: "Related",
    relatedVertical: "関連サイト",
    heroPicker: "表示する回",
    visitLabel: "サイトを見る",
    visitTarget: (round) => `（${round}）`,
    archive: "アーカイブ",
    archiveIntro:
      "東京都市大学（旧 武蔵工業大学）の学園祭、世田谷祭の公式サイトを、各回の公開当時のまま残しています。",
    filterLegend: "時代で絞り込む",
    filterAll: "すべて",
    showing: (count) => `${count}件を表示中`,
    estimated: "（推定）",
    relatedSites: "関連サイト",
    comingSoon: "公開準備中",
    footerNote:
      "各回のサイトは公開当時のまま保存しています。掲載している日程・連絡先・リンク先は、当時のものです。",
    fullStop: "。",
    sentenceGap: "",
  },
  en: {
    siteName: "Setagaya Festival Archive",
    description: ({ round, year }) =>
      `Past websites of the Setagaya Festival, the school festival of Tokyo City University (formerly Musashi Institute of Technology). Every festival's site since the ${ordinalOf(round)} (${year}) is kept as it was published.`,
    ogImageAlt: (round, festivalName) =>
      `The top page of the official site of the ${round} ${festivalName}`,
    menu: "MENU",
    menuLabel: "Setagaya Festival official site and social media",
    footerMenuLabel: "Setagaya Festival official site and social media (footer)",
    socialLabel: "Setagaya Festival on social media",
    close: "Close",
    sectionsLabel: "On this page",
    navLatest: "Latest",
    navArchive: "Archive",
    navRelated: "Related sites",
    runBy: "Run by",
    latestWord: "Latest",
    latestVertical: "",
    archiveWord: "Archive",
    archiveVertical: "",
    relatedWord: "Related",
    relatedVertical: "",
    heroPicker: "Festival to show",
    visitLabel: "Visit the site",
    visitTarget: (round) => ` of the ${round} festival`,
    archive: "Archive",
    archiveIntro:
      "The official sites of the Setagaya Festival, the school festival of Tokyo City University (formerly Musashi Institute of Technology), each kept as it was published. The sites are in Japanese.",
    filterLegend: "Filter by era",
    filterAll: "All",
    showing: (count) => `Showing ${count} ${count === 1 ? "festival" : "festivals"}`,
    estimated: " (estimated)",
    relatedSites: "Related sites",
    comingSoon: "Coming soon",
    footerNote:
      "Each festival’s site is kept as it was published. The dates, contacts and links on those sites are from that time.",
    fullStop: ".",
    sentenceGap: " ",
  },
} as const satisfies Record<Lang, Words>;

/** A festival's round as written in each language: "第97回" / "97th". */
export function roundLabel(round: number, lang: Lang): string {
  return lang === "ja" ? `第${round}回` : ordinalOf(round);
}

/**
 * A festival's heading. Japanese themes keep their original wording as the
 * title on "/en/" too, followed by the English rendering (Issue #1). Themes
 * written in Latin script are the same in both languages and get no
 * translation; an unknown theme falls back to the festival's name.
 */
export function headingOf(
  festival: Festival,
  lang: Lang,
): { readonly text: string; readonly lang: Lang; readonly translation?: string } {
  const { theme } = festival;
  if (!theme || lang === "ja" || theme.ja === theme.en)
    return { text: titleOf(festival, lang), lang };
  return { text: theme.ja, lang: "ja", translation: theme.en };
}
