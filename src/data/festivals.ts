// Every festival listed on the archive top page.
//
// Only facts that differ from one festival to the next are stored here. The
// year, the university (era), the festival's name and the link path follow
// fixed rules and are derived by the functions below. Adding a new festival is
// one entry at the end of FESTIVALS.
//
// Source of truth: Issue #1 (the table of rounds, dates and themes). Each
// theme is written exactly as on the festival's own site. Field definitions
// and sources are in docs/data/festivals.md.
//
// This file is read by Astro and, unbundled, by Node scripts (Node strips the
// types). Keep it free of imports other than `import type`, and of syntax that
// type stripping cannot handle (enums, namespaces, parameter properties).

export type Lang = "ja" | "en";
export type Localized = Readonly<Record<Lang, string>>;

/** ISO 8601 calendar date, e.g. "2026-10-31". */
export type IsoDate = `${number}-${number}-${number}`;

/**
 * - held: held on campus as usual
 * - online: held online only
 * - hybrid: held on campus and online
 * - cancelled: not held
 */
export type Status = "held" | "online" | "hybrid" | "cancelled";

export type Era = "musashi" | "tcu";

export interface Festival {
  readonly round: number;
  readonly dates: {
    readonly start: IsoDate;
    readonly end: IsoDate;
    /** True when the dates are inferred rather than stated by the site. */
    readonly estimated?: true;
  };
  /**
   * The campus theme. `ja` is the original wording; `en` is its English
   * rendering. Themes already written in Latin script are the same in both.
   * null when the theme is unknown.
   */
  readonly theme: Localized | null;
  /** The university-wide festival theme. Kept for the record; not shown on cards. */
  readonly commonTheme?: string;
  readonly status: Status;
  /** Why the festival was cancelled or changed. */
  readonly statusReason?: Localized;
  /**
   * Set only when the festival's site is not in the archive's own folder
   * (see pathOf). The default link is the folder on this host.
   */
  readonly externalLink?: {
    readonly url: string;
    readonly label: Localized;
  };
}

export const FESTIVALS = [
  {
    round: 75,
    // Inferred from the alt text of the logo on the draft page.
    dates: { start: "2004-11-22", end: "2004-11-24", estimated: true },
    theme: null,
    status: "held",
  },
  {
    round: 76,
    // Shown after an ensō brush image on the site.
    dates: { start: "2005-11-18", end: "2005-11-20" },
    theme: { ja: "[wa]", en: "[wa]" },
    status: "held",
  },
  {
    round: 77,
    dates: { start: "2006-11-24", end: "2006-11-26" },
    theme: { ja: "虹", en: "Rainbow" },
    status: "held",
  },
  {
    round: 78,
    dates: { start: "2007-11-23", end: "2007-11-25" },
    theme: { ja: "縁", en: "Bonds" },
    status: "held",
  },
  {
    round: 79,
    // The theme appears only inside an image ("LAST MUSASHI").
    dates: { start: "2008-11-22", end: "2008-11-24" },
    theme: { ja: "ありがとう", en: "Thank You" },
    status: "held",
  },
  {
    round: 80,
    dates: { start: "2009-11-21", end: "2009-11-23" },
    theme: { ja: "on", en: "on" },
    status: "held",
  },
  {
    round: 81,
    // The theme appears only inside an image.
    dates: { start: "2010-11-21", end: "2010-11-23" },
    theme: { ja: "つながり", en: "Connections" },
    status: "held",
  },
  {
    round: 82,
    dates: { start: "2011-11-20", end: "2011-11-22" },
    theme: { ja: "都市大、新発見。", en: "Discover TCU Anew." },
    status: "held",
  },
  {
    round: 83,
    dates: { start: "2012-11-24", end: "2012-11-25" },
    theme: { ja: "僕らの手で夢をかたちに", en: "Shaping Dreams with Our Own Hands" },
    commonTheme: "みらいを、つくる。",
    status: "held",
  },
  {
    round: 84,
    dates: { start: "2013-11-23", end: "2013-11-24" },
    theme: { ja: "新しい可能性に出会う", en: "Meeting New Possibilities" },
    commonTheme: "みらいを、つくる。",
    status: "held",
  },
  {
    round: 85,
    // The site's top page shows the 86th festival's dates; the correct dates
    // are in its meta description.
    dates: { start: "2014-11-01", end: "2014-11-02" },
    theme: { ja: "好奇心を、形に。", en: "Giving Shape to Curiosity." },
    commonTheme: "みらいを、つくる。",
    status: "held",
  },
  {
    round: 86,
    dates: { start: "2015-10-31", end: "2015-11-01" },
    theme: { ja: "“Hello World”", en: "“Hello World”" },
    status: "held",
  },
  {
    round: 87,
    // The site no longer exists. It was at setagayafes.org/87/ (WordPress) and
    // only its text survives on the Wayback Machine. Capture before the
    // festival: https://web.archive.org/web/20160627184610/http://setagayafes.org/87/
    dates: { start: "2016-10-29", end: "2016-10-30" },
    theme: { ja: "極祭色", en: "Brilliant Festival Colors" },
    commonTheme: "“新しい”をずっと",
    status: "held",
    externalLink: {
      url: "https://web.archive.org/web/20161101171330/http://setagayafes.org/87/",
      label: { ja: "Wayback Machine（外部サイト）", en: "Wayback Machine (external site)" },
    },
  },
  {
    round: 88,
    dates: { start: "2017-11-04", end: "2017-11-05" },
    theme: { ja: "ContiNew", en: "ContiNew" },
    commonTheme: "“新しい”をずっと",
    status: "held",
  },
  {
    round: 89,
    dates: { start: "2018-11-03", end: "2018-11-04" },
    theme: { ja: "究（きわみ）", en: "Kiwami: The Pinnacle" },
    commonTheme: "“新しい”をずっと",
    status: "held",
  },
  {
    round: 90,
    dates: { start: "2019-11-02", end: "2019-11-03" },
    theme: { ja: "COSMOS", en: "COSMOS" },
    commonTheme: "調和",
    status: "cancelled",
    statusReason: {
      ja: "台風19号の被災のため中止",
      en: "Cancelled after damage from Typhoon Hagibis",
    },
  },
  {
    round: 91,
    dates: { start: "2020-11-07", end: "2020-11-08" },
    theme: { ja: "CIRCLE", en: "CIRCLE" },
    commonTheme: "調和",
    status: "cancelled",
    statusReason: {
      ja: "新型コロナウイルス感染症の拡大のため中止",
      en: "Cancelled due to the COVID-19 pandemic",
    },
  },
  {
    round: 92,
    dates: { start: "2021-11-06", end: "2021-11-07" },
    theme: { ja: "パレット", en: "Palette" },
    commonTheme: "調和",
    status: "online",
  },
  {
    round: 93,
    // The first festival after merging with the Todoroki Festival.
    dates: { start: "2022-11-05", end: "2022-11-06" },
    theme: { ja: "JOY!NT", en: "JOY!NT" },
    commonTheme: "つなぐ。つながる。つなげる。",
    status: "hybrid",
  },
  {
    round: 94,
    dates: { start: "2023-11-04", end: "2023-11-05" },
    theme: { ja: "百花繚乱", en: "A Hundred Flowers in Bloom" },
    commonTheme: "つなぐ。つながる。つなげる。",
    status: "held",
  },
  {
    round: 95,
    dates: { start: "2024-11-02", end: "2024-11-03" },
    theme: { ja: "星月夜", en: "Starry Night" },
    commonTheme: "つなぐ。つながる。つなげる。",
    status: "held",
  },
  {
    round: 96,
    // Links to the static copy at /96th/, not the old 96th.setagayafes.org host.
    dates: { start: "2025-11-01", end: "2025-11-02" },
    theme: { ja: "CITRINE", en: "CITRINE" },
    commonTheme: "より良い学園祭へ、ともに進もう",
    status: "held",
  },
  {
    round: 97,
    dates: { start: "2026-10-31", end: "2026-11-01" },
    theme: { ja: "カラクリ", en: "Karakuri: Clockwork" },
    commonTheme: "期待を超える瞬間へ、ともに進もう",
    status: "held",
  },
] as const satisfies readonly Festival[];

/** The year a festival was held: the 1st festival was in 1930. */
export function yearOf(round: number): number {
  return round + 1929;
}

/**
 * Musashi Institute of Technology was renamed Tokyo City University on
 * 2009-04-01, so the 80th festival (2009) was the first under the new name.
 */
export function eraOf(round: number): Era {
  return round <= 79 ? "musashi" : "tcu";
}

export const ERA_NAMES = {
  musashi: { ja: "武蔵工業大学", en: "Musashi Institute of Technology" },
  tcu: { ja: "東京都市大学", en: "Tokyo City University" },
} as const satisfies Record<Era, Localized>;

/**
 * The festival's own name, which changed three times:
 * MI-TECH祭 (75th–79th) → TCU祭 (80th–81st) → TCU世田谷祭 (82nd) → 世田谷祭 (83rd–).
 */
export function festivalNameOf(round: number): Localized {
  if (round <= 79) return { ja: "MI-TECH祭", en: "MI-TECH Festival" };
  if (round <= 81) return { ja: "TCU祭", en: "TCU Festival" };
  if (round === 82) return { ja: "TCU世田谷祭", en: "TCU Setagaya Festival" };
  return { ja: "世田谷祭", en: "Setagaya Festival" };
}

/** The ordinal used in folder names: 81 → "81st", 82 → "82nd", 97 → "97th". */
export function ordinalOf(round: number): string {
  const lastTwo = round % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${round}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[round % 10] ?? "th";
  return `${round}${suffix}`;
}

/** The folder on this host that holds the festival's site, e.g. "/81st/". */
export function pathOf(round: number): `/${string}/` {
  return `/${ordinalOf(round)}/`;
}

/** The URL a card links to: the archived folder, or the external link when set. */
export function linkOf(festival: Festival): string {
  return festival.externalLink?.url ?? pathOf(festival.round);
}

/**
 * The card heading: the campus theme, or the festival's name when the theme
 * is unknown.
 */
export function titleOf(festival: Festival, lang: Lang): string {
  return festival.theme?.[lang] ?? festivalNameOf(festival.round)[lang];
}

export const STATUS_LABELS = {
  held: null,
  online: { ja: "オンライン開催", en: "Online" },
  hybrid: { ja: "対面＋オンライン", en: "In person + online" },
  cancelled: { ja: "中止", en: "Cancelled" },
} as const satisfies Record<Status, Localized | null>;

/** The most recent festival, shown in the hero. */
export function latestFestival(): Festival {
  return FESTIVALS.reduce<Festival>(
    (latest, festival) => (festival.round > latest.round ? festival : latest),
    FESTIVALS[0],
  );
}
