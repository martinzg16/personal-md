/**
 * The harness entry.
 *
 * `chrome` is stubbed with a store that behaves the way the background worker
 * does - `getMirror` answers from a fixture, `saveFacts` and `saveAnswer` mutate
 * it and stamp `updatedAt` - so the surface can be driven end to end: type a
 * name, record the page, watch the stamp land and the MRZ fill.
 *
 * The fixture is chosen to be a document mid-issuance rather than a full one:
 * three of four data pages touched, two of eight questions answered, one
 * restricted value present. A harness showing a complete document hides every
 * empty state, and the empty states are most of what this surface is.
 */

import { createRoot } from "react-dom/client";

import type { Profile } from "@personal-md/core";

import "../../entrypoints/options/style.css";

const now = "2026-08-20T18:04:00.000Z";

const profile: Profile = {
  version: 1,
  facts: [
    { key: "personal.full_name", label: "Full name", value: "Martín Zulueta Ochoa", egress: "sendable", updatedAt: "2026-08-14T09:12:00.000Z" },
    { key: "personal.email", label: "Email", value: "martin.zulueta@example.es", egress: "never", updatedAt: "2026-08-14T09:12:00.000Z" },
    { key: "personal.city", label: "City", value: "Madrid", egress: "never", updatedAt: "2026-08-14T09:13:00.000Z" },
    { key: "personal.nif", label: "NIF / NIE", value: "51234567X", egress: "never", updatedAt: "2026-08-14T09:14:00.000Z" },
    { key: "work.current_role", label: "Current role", value: "Product Manager", egress: "sendable", updatedAt: "2026-08-18T11:02:00.000Z" },
    { key: "work.current_employer", label: "Current employer", value: "TaxDown", egress: "sendable", updatedAt: "2026-08-18T11:02:00.000Z" },
    { key: "work.years_experience", label: "Years of experience", value: "8", egress: "sendable", updatedAt: "2026-08-18T11:02:00.000Z" },
    { key: "work.domain", label: "Domain you work in", value: "fintech, tax", egress: "sendable", updatedAt: "2026-08-18T11:03:00.000Z" },
    { key: "languages.spoken", label: "Languages", value: "Spanish native, English C1", egress: "sendable", updatedAt: "2026-08-20T18:04:00.000Z" },
  ],
  answers: [
    {
      id: "a1",
      canonicalKey: "experience.relevant_background",
      askedAs: ["Háblanos de ti y de tu experiencia.", "Tell us about yourself."],
      text: "Llevo ocho años decidiendo qué problemas fiscales merece la pena resolver, que casi siempre significa decir no a la mayoría. Empecé escribiendo SQL para entender por qué la gente abandonaba un formulario a mitad, y me quedé porque resultó que la respuesta casi nunca estaba en el formulario. Ahora trabajo sobre todo en el tramo entre lo que Hacienda dice y lo que una persona entiende.",
      language: "es",
      genre: "job_application",
      writtenAt: "2026-08-16T20:41:00.000Z",
      useCount: 3,
    },
    {
      id: "a2",
      canonicalKey: "experience.metric_impact",
      askedAs: ["¿Cuál es el impacto del que estás más orgulloso?"],
      text: "Reescribimos la pantalla de resultado para explicar la diferencia entre el borrador de Hacienda y nuestro cálculo, en lugar de solo mostrar la cifra. La conversión a pago subió del 22% al 31% en la cohorte de inversores, y las conversaciones de soporte sobre esa pantalla cayeron a la mitad.",
      language: "es",
      genre: "job_application",
      writtenAt: "2026-08-19T22:15:00.000Z",
      useCount: 1,
    },
  ],
  index: { aliases: {}, siteMemory: {} },
};

const store: Record<string, unknown> = {
  "server.token": "harness-token",
  "server.port": 8787,
  // Flip to false in the console to see the cover again:
  //   chrome.storage.local.set({ "document.opened": false }); location.reload()
  "document.opened": new URLSearchParams(location.search).get("cover") !== "1",
};

const withheldKeys = ["personal.email", "personal.city", "personal.nif", "personal.phone", "personal.address_exact"];

const mirror = () => ({
  mirror: { profile, withheldKeys, siteMemory: {}, fetchedAt: now },
  connection:
    new URLSearchParams(location.search).get("conn") === "down"
      ? { kind: "server_down" as const }
      : { kind: "ok" as const, port: 8787 },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (bag: Record<string, unknown>) => Object.assign(store, bag),
      remove: async (key: string) => delete store[key],
    },
  },
  runtime: {
    sendMessage: async (request: { kind: string } & Record<string, unknown>) => {
      // A visible delay, because every save on this surface is a round trip and
      // a harness with no latency hides whatever the busy states look like.
      await new Promise((r) => setTimeout(r, 260));

      if (request.kind === "getMirror" || request.kind === "refresh") {
        return { ok: true, data: mirror() };
      }

      if (request.kind === "saveFacts") {
        const incoming = request.facts as { key: string; label: string; value: string }[];
        for (const fact of incoming) {
          const existing = profile.facts.find((f) => f.key === fact.key);
          if (existing) {
            existing.value = fact.value;
            existing.updatedAt = new Date().toISOString();
          } else {
            profile.facts.push({
              key: fact.key,
              label: fact.label,
              value: fact.value,
              egress: withheldKeys.includes(fact.key) ? "never" : "sendable",
              updatedAt: new Date().toISOString(),
            });
          }
        }
        return { ok: true, data: null };
      }

      if (request.kind === "saveAnswer") {
        const key = request.canonicalKey as string;
        const existing = profile.answers.find((a) => a.canonicalKey === key);
        if (existing) {
          existing.text = request.text as string;
          existing.writtenAt = new Date().toISOString();
        } else {
          profile.answers.push({
            id: `a${profile.answers.length + 1}`,
            canonicalKey: key,
            askedAs: [request.question as string],
            text: request.text as string,
            language: request.language as "es" | "en",
            genre: request.genre as Profile["answers"][number]["genre"],
            writtenAt: new Date().toISOString(),
            useCount: 0,
          });
        }
        return { ok: true, data: null };
      }

      return { ok: false, error: `harness has no stub for ${request.kind}` };
    },
  },
};

const { default: App } = await import("../../entrypoints/options/App.tsx");
createRoot(document.getElementById("root")!).render(<App />);
