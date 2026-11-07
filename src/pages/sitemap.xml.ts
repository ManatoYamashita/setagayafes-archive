// /sitemap.xml: the two top pages and their language versions (src/lib/seo.ts).
import type { APIRoute } from "astro";
import { sitemapXml } from "../lib/seo.ts";

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("`site` is not set in astro.config.mjs");
  return new Response(sitemapXml(site), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
