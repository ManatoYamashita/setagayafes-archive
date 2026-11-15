// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// The site is deployed by hand (zip) into the archive host's public folder,
// next to the past festival sites (/78th/, /96th/, ...). Keep every output
// path predictable so nothing collides with those folders.
export default defineConfig({
  site: "https://archive.setagayafes.org",
  output: "static",
  trailingSlash: "always",
  build: {
    // "preserve" keeps each page's file name: src/pages/errors/[code].astro
    // becomes /errors/404.html, which ErrorDocument names. The top pages are
    // index.astro files, so they still become /index.html and /en/index.html.
    format: "preserve",
    // Keep page CSS in the HTML: one request less on a host without compression.
    inlineStylesheets: "always",
  },
  // No link prefetching: it would ship a client-side script.
  prefetch: false,
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
