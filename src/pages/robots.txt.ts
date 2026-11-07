// /robots.txt (src/lib/seo.ts). It replaces the host's previous robots.txt,
// whose only rule ("Disallow: /errorpage/") is carried over.
import type { APIRoute } from "astro";
import { robotsTxt } from "../lib/seo.ts";

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("`site` is not set in astro.config.mjs");
  return new Response(robotsTxt(site), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
