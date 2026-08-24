/**
 * The HTTP surface. Node's http module only, no framework: the whole API is
 * a handful of routes and the dependency budget is better spent elsewhere.
 *
 * Two things guard it. It binds to 127.0.0.1 explicitly, and every route except
 * /health requires the shared token. Loopback alone is not a boundary - any
 * process or page on the machine can reach it - so the token is what actually
 * stops a random web page from reading the profile or spending Claude quota.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { bearerFrom, loadOrCreateToken, tokenMatches } from "./auth.ts";
import { ClaudeError } from "./claude.ts";
import type { AnswerInput } from "./store.ts";
import { handleDraft, type DraftRequest } from "./draft-route.ts";
import { handleMatch, type MatchRequest } from "./match-route.ts";
import { handleImport } from "./import-route.ts";
import { Store } from "./store.ts";
import { paths } from "./paths.ts";

export const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { store: Store; body: unknown },
) => Promise<void>;

/**
 * "The CLI is not signed in" is the one model failure the user can fix, so it
 * gets its own stage rather than being folded into a generic model error. The
 * client keys off `stage`, not off prose, so the wording stays free to change.
 */
function claudeStage(err: unknown, fallback: string): string {
  return err instanceof ClaudeError && err.kind === "not_authenticated"
    ? "not-authenticated"
    : fallback;
}

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

  /**
   * Save a batch the user has confirmed, as one write.
   *
   * The confirm-to-learn panel asks once, about everything at once, so the yes
   * has to be honoured atomically. Anything the request does not name is left
   * alone - this is not a replace.
   */
  /**
   * Map a LinkedIn profile onto a proposal. Writes nothing.
   *
   * The result goes back to the widget, which puts it through the same
   * confirm-to-learn panel as anything else new - so an import is reviewed and
   * edited before it lands, like every other value.
   */
  "POST /import": async (_req, res, { body }) => {
    const o = (body ?? {}) as Record<string, unknown>;
    const profile = (o["profile"] ?? null) as Record<string, unknown> | null;
    if (!profile) return json(res, 400, { error: "expected { profile: {...} }" });
    const { proposal, model } = await handleImport(profile as never);
    json(res, 200, { ok: true, proposal, model });
  },

  "POST /learn": async (_req, res, { store, body }) => {
    const o = (body ?? {}) as Record<string, unknown>;
    const rawFacts = Array.isArray(o["facts"]) ? (o["facts"] as unknown[]) : [];
    const rawAnswers = Array.isArray(o["answers"]) ? (o["answers"] as unknown[]) : [];
    if (rawFacts.length === 0 && rawAnswers.length === 0) {
      return json(res, 400, { error: "expected { facts: [...] } or { answers: [...] }" });
    }

    const facts = rawFacts
      .map((f) => {
        const r = f as Record<string, unknown>;
        return {
          key: asString(r["key"]).trim(),
          label: asString(r["label"]),
          value: asString(r["value"]),
          updatedAt: asString(r["updatedAt"]),
        };
      })
      .filter((f) => f.key);

    const answers: AnswerInput[] = [];
    for (const a of rawAnswers) {
      const r = a as Record<string, unknown>;
      const canonicalKey = asString(r["canonicalKey"]).trim();
      // A batch is all-or-nothing, so a malformed item fails the request rather
      // than being dropped: silently saving three of four confirmed items is
      // exactly the kind of quiet wrongness this tool refuses elsewhere.
      if (!canonicalKey) return json(res, 400, { error: "every answer needs a canonicalKey" });
      answers.push({
        canonicalKey,
        question: asString(r["question"]),
        text: asString(r["text"]),
        language: r["language"] === "es" ? "es" : "en",
        genre: asString(r["genre"], "other") as AnswerInput["genre"],
      });
    }

    const { profile } = await store.learn({ facts, answers });
    json(res, 200, {
      ok: true,
      learned: { facts: facts.length, answers: answers.length },
      factCount: profile.facts.length,
      answerCount: profile.answers.length,
    });
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

  /**
   * Stages A to C of question matching. The extension only calls this after its
   * own free local lookups have failed, so reaching here usually means a model
   * call - and the result is written back so it never happens for this question
   * again.
   */
  "POST /match": async (_req, res, { store, body }) => {
    const o = (body ?? {}) as Record<string, unknown>;
    const question = asString(o["question"]).trim();
    if (!question) return json(res, 400, { error: "question is required" });

    const maxLengthRaw = o["maxLength"];
    const request: MatchRequest = {
      question,
      genre: asString(o["genre"], "other") as MatchRequest["genre"],
      language: o["language"] === "es" ? "es" : "en",
      maxLength: typeof maxLengthRaw === "number" && maxLengthRaw > 0 ? maxLengthRaw : null,
      domain: asString(o["domain"]),
      signature: asString(o["signature"]),
    };

    try {
      json(res, 200, await handleMatch(store, request));
    } catch (err) {
      // A model failure is a normal outcome here, not a server fault: the
      // extension still has its local matches and can fall back to drafting.
      const message = err instanceof Error ? err.message : "unknown error";
      json(res, 502, { error: message, stage: claudeStage(err, "classify") });
    }
  },

  /**
   * Draft an answer to an open question. The only route that uses Opus, because
   * writing a paragraph in someone else's voice is the one job here where the
   * model tier is the product rather than an implementation detail.
   */
  "POST /draft": async (_req, res, { store, body }) => {
    const o = (body ?? {}) as Record<string, unknown>;
    const question = asString(o["question"]).trim();
    if (!question) return json(res, 400, { error: "question is required" });

    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
    const canonicalKey = asString(o["canonicalKey"]).trim();

    const request: DraftRequest = {
      question,
      canonicalKey: canonicalKey || null,
      language: o["language"] === "es" ? "es" : "en",
      genre: asString(o["genre"], "other") as DraftRequest["genre"],
      maxWords: num(o["maxWords"]),
      maxChars: num(o["maxChars"]),
      registerHint: asString(o["registerHint"], "a web form"),
    };
    const instruction = asString(o["instruction"]).trim();
    if (instruction) request.instruction = instruction;

    try {
      json(res, 200, await handleDraft(store, request));
    } catch (err) {
      // Distinguish "we refused to send this" from "the model failed", because
      // they need completely different things from the user.
      const message = err instanceof Error ? err.message : "unknown error";
      const blocked = err instanceof Error && err.name === "EgressBlockedError";
      json(res, blocked ? 422 : 502, {
        error: message,
        stage: blocked ? "egress-blocked" : claudeStage(err, "draft"),
        ...(blocked ? { hits: (err as { hits?: unknown }).hits } : {}),
      });
    }
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
