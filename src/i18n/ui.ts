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

/** The festivals the archive covers, for the hero's lead. */
export interface ArchiveSpan {
  readonly first: { readonly round: number; readonly year: number };
  readonly last: { readonly round: number; readonly year: number };
  readonly count: number;
}

interface Words {
  readonly siteName: string;
  /** Meta description. `first` is the oldest festival in the archive. */
  readonly description: (first: { round: number; year: number }) => string;
  /** Alt text of the link-preview (Open Graph) image. */
  readonly ogImageAlt: string;
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
  readonly archiveWord: string;
  readonly archiveVertical: string;
  readonly relatedWord: string;
  readonly relatedVertical: string;
  /**
   * The hero's title over two lines; the second is muted. The first line is
   * given in phrases: on narrow screens it breaks between them only.
   */
  readonly heroTitle: readonly [readonly string[], string];
  /** The hero's lead: the oldest and newest festival and how many there are. */
  readonly heroLead: (span: ArchiveSpan) => string;
  /** The hero's button to the newest festival's site. */
  readonly visit: (round: string) => string;
  /** The hero's button to the list of every festival on this page. */
  readonly seeArchive: string;
  /**
   * The two buttons over a festival's picture, and their accessible names,
   * which start with the visible words and add the round.
   */
  readonly visitShort: string;
  readonly visitName: (round: string) => string;
  readonly previewButton: string;
  readonly previewName: (round: string) => string;
  /** The title of the iframe in the preview dialog. */
  readonly previewFrameTitle: (round: string) => string;
  readonly filterLegend: string;
  readonly filterAll: string;
  readonly showing: (count: number) => string;
  /** Appended to dates that are inferred rather than stated by the site. */
  readonly estimated: string;
  /** Shown instead of a link while a related site is being prepared. */
  readonly comingSoon: string;
  readonly footerNote: string;
}

export const UI = {
  ja: {
    siteName: "世田谷祭アーカイブ",
    description: ({ round, year }) =>
      `東京都市大学（旧 武蔵工業大学）の学園祭、世田谷祭の過去のWebサイトの一覧です。第${round}回（${year}年）からの各回のサイトを、公開当時のまま残しています。`,
    ogImageAlt:
      "東京都市大学のロゴの下に「過去の世田谷祭」の題字と archive.setagayafes.org の URL。その下に、過去の世田谷祭の公式サイトのトップページが3つ並ぶ",
    menu: "MENU",
    menuLabel: "世田谷祭の公式サイトとSNS",
    footerMenuLabel: "世田谷祭の公式サイトと言語の切り替え（フッター）",
    socialLabel: "世田谷祭のSNS",
    close: "閉じる",
    sectionsLabel: "ページ内の移動",
    navLatest: "最新",
    navArchive: "アーカイブ",
    navRelated: "関連サイト",
    runBy: "運営",
    archiveWord: "Archive",
    archiveVertical: "過去の回",
    relatedWord: "Related",
    relatedVertical: "関連サイト",
    heroTitle: [["東京都市大学", "世田谷祭"], "アーカイブ"],
    heroLead: ({ first, last, count }) =>
      `東京都市大学（旧 武蔵工業大学）の学園祭、世田谷祭の公式サイトを、第${first.round}回（${first.year}年）から第${last.round}回（${last.year}年）までの${count}回分、公開当時のまま保存しています。各回のテーマ・日程・企画の案内を、当時のデザインのまま見られます。中止やオンライン開催になった回のサイトも含みます。`,
    visit: (round) => `${round}のサイトを見る`,
    seeArchive: "過去の回を見る",
    visitShort: "サイトを見る",
    visitName: (round) => `サイトを見る（${round}）`,
    previewButton: "プレビュー",
    previewName: (round) => `プレビュー（${round}）`,
    previewFrameTitle: (round) => `${round}のサイトのプレビュー`,
    filterLegend: "時代で絞り込む",
    filterAll: "すべて",
    showing: (count) => `${count}件を表示中`,
    estimated: "（推定）",
    comingSoon: "公開準備中",
    footerNote:
      "各回のサイトは公開当時のまま保存しています。掲載している日程・連絡先・リンク先は、当時のものです。",
  },
  en: {
    siteName: "Setagaya Festival Archive",
    description: ({ round, year }) =>
      `Past websites of the Setagaya Festival, the school festival of Tokyo City University (formerly Musashi Institute of Technology). Every festival's site since the ${ordinalOf(round)} (${year}) is kept as it was published.`,
    ogImageAlt:
      "The Tokyo City University logo above the title “Past Setagaya Festivals” and the URL archive.setagayafes.org, with the top pages of three past Setagaya Festival sites below",
    menu: "MENU",
    menuLabel: "Setagaya Festival official site and social media",
    footerMenuLabel: "Setagaya Festival official sites and language (footer)",
    socialLabel: "Setagaya Festival on social media",
    close: "Close",
    sectionsLabel: "On this page",
    navLatest: "Latest",
    navArchive: "Archive",
    navRelated: "Related sites",
    runBy: "Run by",
    archiveWord: "Archive",
    archiveVertical: "",
    relatedWord: "Related",
    relatedVertical: "",
    heroTitle: [["Setagaya Festival"], "Archive"],
    heroLead: ({ first, last, count }) =>
      `The official sites of the Setagaya Festival, the school festival of Tokyo City University (formerly Musashi Institute of Technology), kept as they were published: ${count} festivals, from the ${ordinalOf(first.round)} (${first.year}) to the ${ordinalOf(last.round)} (${last.year}). Each site shows that year’s theme, dates and events in its original design, including the festivals that were cancelled or held online. The sites are in Japanese.`,
    visit: (round) => `Visit the ${round} festival’s site`,
    seeArchive: "See past festivals",
    visitShort: "Visit the site",
    visitName: (round) => `Visit the site: the ${round} festival`,
    previewButton: "Preview",
    previewName: (round) => `Preview: the ${round} festival’s site`,
    previewFrameTitle: (round) => `Preview of the ${round} festival’s site`,
    filterLegend: "Filter by era",
    filterAll: "All",
    showing: (count) => `Showing ${count} ${count === 1 ? "festival" : "festivals"}`,
    estimated: " (estimated)",
    comingSoon: "Coming soon",
    footerNote:
      "Each festival’s site is kept as it was published. The dates, contacts and links on those sites are from that time.",
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
