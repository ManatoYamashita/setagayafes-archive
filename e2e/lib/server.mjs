// A minimal static file server for the end-to-end tests. It serves dist/ the
// way the production host does: "/dir/" answers with "/dir/index.html", and
// anything else that does not exist is a 404. No dependency is needed.

import { createServer } from "node:http";
import { URL } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Starts the server on a free port.
 *
 * @param {string} root Directory to serve (usually dist/).
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serve(root) {
  const base = resolve(root);

  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
      let file = normalize(join(base, pathname));
      if (file !== base && !file.startsWith(base + sep)) throw new Error("outside root");
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type":
          TYPES[/** @type {keyof typeof TYPES} */ (extname(file))] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((done) => server.close(() => done(undefined))),
  };
}
