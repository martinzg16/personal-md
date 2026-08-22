// Minimal static server for the browser-verification fixtures. Loopback only.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT ?? 5599);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

createServer(async (req, res) => {
  const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path === "/" ? "fixtures/job-application.html" : path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("no"); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`fixtures on http://127.0.0.1:${PORT}`));
