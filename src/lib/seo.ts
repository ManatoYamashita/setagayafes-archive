// URLs and metadata for search engines and link previews, shared by the page
// <head> (src/layouts/Base.astro), /sitemap.xml and /robots.txt.
//
// Only the top pages ("/" and "/en/") are meant to be indexed. The festival
// sites on the same host stay noindex through the server's headers; they are
// not listed here and not blocked in robots.txt (a crawler that may not fetch
// a page never sees its noindex).

import type { Lang } from "../data/festivals.ts";
import { HOME_PATHS, LANGS } from "../i18n/ui.ts";

/** The absolute URL of a language's top page. */
export function pageUrl(lang: Lang, site: URL): string {
  return new URL(HOME_PATHS[lang], site).href;
}

/**
 * The language versions of the top page, for `<link rel="alternate">` and the
 * sitemap. Japanese is the default (`x-default`).
 */
export function alternatesOf(site: URL): { hreflang: string; href: string }[] {
  return [
    ...LANGS.map((lang) => ({ hreflang: lang, href: pageUrl(lang, site) })),
    { hreflang: "x-default", href: pageUrl("ja", site) },
  ];
}

/** Open Graph locales (language_TERRITORY). */
export const OG_LOCALES = { ja: "ja_JP", en: "en_US" } as const satisfies Record<Lang, string>;

/** Paths that robots.txt keeps crawlers out of. Carried over from the host's previous robots.txt. */
export const ROBOTS_DISALLOW = ["/errorpage/"] as const;

/** The sitemap: both top pages, each pointing at its other language. */
export function sitemapXml(site: URL): string {
  const alternates = alternatesOf(site)
    .map(
      ({ hreflang, href }) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`,
    )
    .join("\n");
  const urls = LANGS.map((lang) =>
    [`  <url>`, `    <loc>${pageUrl(lang, site)}</loc>`, alternates, `  </url>`].join("\n"),
  ).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    urls,
    `</urlset>`,
    ``,
  ].join("\n");
}

/** robots.txt: crawl everything except ROBOTS_DISALLOW, and say where the sitemap is. */
export function robotsTxt(site: URL): string {
  return [
    "User-agent: *",
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${new URL("/sitemap.xml", site).href}`,
    "",
  ].join("\n");
}
