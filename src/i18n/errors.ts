// The words of the error pages (/errors/NNN.html). The server shows one of
// them in place of any URL that fails (ErrorDocument in the generated
// .htaccess), and it cannot pick a language, so every page carries both:
// Japanese first, English second.
//
// Node also reads this file (unbundled) in the tests and in
// scripts/lib/htaccess.mjs: keep it to syntax that type stripping can handle.

import type { Lang } from "../data/festivals.ts";
import { UI } from "./ui.ts";

/**
 * The status codes that get an error page. They are the ones the server's
 * previous error pages covered (/errorpage/NNN.html: Issue #2).
 */
export const ERROR_CODES = Object.freeze([
  400, 401, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421, 422,
  423, 424, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
] as const);

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The folder the pages are published in. ErrorDocument points here. */
export const ERROR_PAGE_DIR = "/errors/";

/** Where an error page is published, e.g. "/errors/404.html". */
export function errorPagePath(code: ErrorCode): `/errors/${number}.html` {
  return `/errors/${code}.html`;
}

/** The reason phrase of each status code (RFC 9110 and the RFCs that add codes). */
export const REASON_PHRASES = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Content Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  421: "Misdirected Request",
  422: "Unprocessable Content",
  423: "Locked",
  424: "Failed Dependency",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required",
} as const satisfies Record<ErrorCode, string>;

/** A page's heading and the sentence under it. */
export interface ErrorMessage {
  readonly title: string;
  readonly lead: string;
}

type Bilingual<T> = Readonly<Record<Lang, T>>;

/**
 * The codes visitors meet most get their own words; the others share one
 * message per class (4xx: something about the request, 5xx: the server).
 */
const SPECIFIC = {
  403: {
    ja: {
      title: "このページは表示できません",
      lead: "閲覧が許可されていないページです。URL に誤りがないかをお確かめください。",
    },
    en: {
      title: "Access denied",
      lead: "You do not have permission to view this page. Please check the address.",
    },
  },
  404: {
    ja: {
      title: "お探しのページは見つかりませんでした",
      lead: "URL が変わったか、ページが削除された可能性があります。",
    },
    en: {
      title: "Page not found",
      lead: "The address may have changed, or the page may have been removed.",
    },
  },
  410: {
    ja: {
      title: "このページは公開を終了しました",
      lead: "このページは削除され、今後も表示されません。",
    },
    en: {
      title: "Page removed",
      lead: "This page has been removed and will not be available again.",
    },
  },
  500: {
    ja: {
      title: "サーバーで問題が発生しました",
      lead: "サーバーの内部でエラーが起きました。時間をおいて、もう一度お試しください。",
    },
    en: {
      title: "Something went wrong",
      lead: "An error occurred on the server. Please try again later.",
    },
  },
  503: {
    ja: {
      title: "ただいま、ご利用いただけません",
      lead: "メンテナンス中か、アクセスが集中しています。時間をおいて、もう一度お試しください。",
    },
    en: {
      title: "Temporarily unavailable",
      lead: "The site is under maintenance or busy. Please try again later.",
    },
  },
} as const satisfies Partial<Record<ErrorCode, Bilingual<ErrorMessage>>>;

const CLIENT_ERROR = {
  ja: {
    title: "ページを表示できませんでした",
    lead: "リクエストに問題があった可能性があります。URL に誤りがないかをお確かめください。",
  },
  en: {
    title: "This page could not be shown",
    lead: "There may be a problem with the request. Please check the address.",
  },
} as const satisfies Bilingual<ErrorMessage>;

const SERVER_ERROR = {
  ja: {
    title: "サーバーが応答できませんでした",
    lead: "一時的な問題の可能性があります。時間をおいて、もう一度お試しください。",
  },
  en: {
    title: "The server could not respond",
    lead: "This may be a temporary problem. Please try again later.",
  },
} as const satisfies Bilingual<ErrorMessage>;

/** The heading and sentence of a code's page, in both languages. */
export function errorMessageOf(code: ErrorCode): Bilingual<ErrorMessage> {
  if (code in SPECIFIC) return SPECIFIC[code as keyof typeof SPECIFIC];
  return code < 500 ? CLIENT_ERROR : SERVER_ERROR;
}

/** The codes with their own words (the rest use the shared ones). */
export const SPECIFIC_ERROR_CODES = Object.freeze(Object.keys(SPECIFIC).map(Number) as ErrorCode[]);

/** The page's own words, the same on every error page. */
export const ERROR_UI = {
  ja: {
    /** The primary button: the list of past festivals on this host. */
    home: "過去の世田谷祭の一覧へ",
    /** The secondary link: the committee's current site. */
    latest: "最新の世田谷祭（公式サイト）へ",
  },
  en: {
    home: "Browse past festivals",
    latest: "Latest festival (official site)",
  },
} as const satisfies Bilingual<Record<"home" | "latest", string>>;

/**
 * The secondary link's target. Fixed to the official site's top, which always
 * shows the newest festival (Issue #70).
 */
export const LATEST_FESTIVAL_URL = "https://setagayafes.org/";

/** The <title>: the code, both headings and the site name. */
export function errorPageTitle(code: ErrorCode): string {
  const { ja, en } = errorMessageOf(code);
  return `${code} ${ja.title}（${en.title}）｜${UI.ja.siteName}`;
}
