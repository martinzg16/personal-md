/**
 * The HTTP surface. Node's http module only, no framework: the whole API is
 * six routes and the dependency budget is better spent elsewhere.
 *
 * Two things guard it. It binds to 127.0.0.1 explicitly, and every route except
 * /health requires the shared token. Loopback alone is not a boundary - any
 * process or page on the machine can reach it - so the token is what actually
 * stops a random web page from reading the profile or spending Claude quota.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { bearerFrom, loadOrCreateToken, tokenMatches } from "./auth.ts";
import { Store } from "./store.ts";
import { paths } from "./paths.ts";

export const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { store: Store; body: unknown },
) => Promise<void>;

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

/**
 * Only the extension may talk to us cross-origin. A page on the open web can
 * still fire a request, but it cannot read the response and has no token.
 */
function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && /^chrome-extension:\/\/[a-z]+$/i.test(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-max-age", "600");
    res.setHeader("vary", "origin");
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const routes: Record<string, Handler> = {
  "GET /profile": async (_req, res, { store }) => {
    const { profile, warnings, index } = await store.load();
    // Sensitive values are rehydrated in memory for local filling, but the API
    // still reports which keys are withheld so the extension can label them.
    json(res, 200, {
      profile,
      warnings,
      siteMemory: index.siteMemory,
      ledger: index.ledger,
      withheldKeys: profile.facts.filter((f) => f.egress === "never").map((f) => f.key),
    });
  },

  "POST /facts": async (_req, res, { store, body }) => {
    const raw = (body as { facts?: unknown })?.facts;
    if (!Array.isArray(raw)) return json(res, 400, { error: "expected { facts: [...] }" });
    const facts = raw.map((f) => {
      const o = f as Record<string, unknown>;
      return {
        key: asString(o["key"]),
        label: asString(o["label"]),
        value: asString(o["value"]),
        updatedAt: asString(o["updatedAt"]),
      };
    });
    const { profile } = await store.upsertFacts(facts);
    json(res, 200, { ok: true, factCount: profile.facts.length });
  },

  "POST /answers": async (_req, res, { store, body }) => {
    const o = (body ?? {}) as Record<string, unknown>;
    const canonicalKey = asString(o["canonicalKey"]).trim();
    if (!canonicalKey) return json(res, 400, { error: "canonicalKey is required" });
    const language = o["language"] === "es" ? "es" : "en";
    const genre = asString(o["genre"], "other");
    const { profile } = await store.recordAnswer({
      canonicalKey,
      question: asString(o["question"]),
      text: asString(o["text"]),
      language,
      genre: genre as "job_application" | "gov_survey" | "personal_info" | "other",
    });
    const saved = profile.answers.find((a) => a.canonicalKey === canonicalKey);
    json(res, 200, { ok: true, answer: saved });
  },

  "POST /site-memory": async (_req, res, { store, body }) => {
    const o = (body ?? {}) as Record<string, unknown>;
    const domain = asString(o["domain"]).trim();
    const signature = asString(o["signature"]).trim();
    const canonicalKey = asString(o["canonicalKey"]).trim();
    if (!domain || !signature || !canonicalKey) {
      return json(res, 400, { error: "domain, signature and canonicalKey are required" });
    }
    await store.rememberSite(domain, signature, canonicalKey);
    json(res, 200, { ok: true });
  },

  "GET /ledger": async (_req, res, { store }) => {
    const { index } = await store.load();
    json(res, 200, index.ledger);
  },
};

export interface RunningServer {
  /** The port actually bound. Differs from the argument when 0 was passed. */
  port: number;
  close: () => Promise<void>;
}

export async function start(port = DEFAULT_PORT): Promise<RunningServer> {
  const store = new Store();
  await store.init();
  const token = await loadOrCreateToken();

  const server = createServer((req, res) => {
    void (async () => {
      applyCors(req, res);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const key = `${req.method} ${url.pathname}`;

      // Unauthenticated liveness check, so the extension can tell "server down"
      // from "wrong token" and show the right message.
      if (key === "GET /health") {
        return json(res, 200, { ok: true, service: "personal-md", root: paths.root });
      }

      if (!tokenMatches(token, bearerFrom(req.headers.authorization))) {
        return json(res, 401, { error: "missing or invalid token" });
      }

      const handler = routes[key];
      if (!handler) return json(res, 404, { error: `no route for ${key}` });

      try {
        const body = req.method === "POST" ? await readBody(req) : undefined;
        await handler(req, res, { store, body });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        json(res, 500, { error: message });
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;

  return {
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
