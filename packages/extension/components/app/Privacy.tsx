/**
 * What has ever left this machine.
 *
 * Two layers, and the screen shows both because they fail differently.
 *
 * Layer 1 is the allowlist in core: which *keys* may be rendered into a prompt at
 * all. It fails closed — a key nobody has classified yet is withheld — which is
 * why the withheld column is the one that grows on its own and why it says so.
 *
 * Layer 2 is the scan of the fully assembled payload, including the user's own
 * prose, which may well contain a NIF typed years ago and never classified as
 * anything. It refuses outright rather than redacting, because a partially
 * redacted prompt teaches nothing and may still leak.
 *
 * The ledger underneath is what the companion has actually spent. It is an
 * aggregate, which is what the file holds: `PERSONAL.md` counts calls and cost,
 * it does not keep a line per call. Saying "4 calls, $0.09" and nothing more is
 * the whole truth; a fabricated table of individual sends would not be.
 */

import { SENDABLE_KEYS, classifyEgress, type Fact, type Lang } from "@personal-md/core";

import { Card, Eyebrow, Mono, PageHead, Pill } from "./primitives.tsx";

const t = {
  es: {
    title: "Qué ha salido de esta máquina",
    lead: "Solo redactar envía algo, y solo estas claves pueden ir. Todo lo demás se rellena aquí, así que no tiene ningún motivo para viajar.",
    sendable: "Puede enviarse",
    withheld: "Nunca se envía",
    withheldNote:
      "Lo que nadie ha clasificado todavía cae aquí por defecto. La lista de arriba es una lista blanca, no una lista negra, y esa es toda la diferencia.",
    yours: "De tu fichero",
    yoursNote: "Estas son las claves que tú tienes ahora mismo, cruzadas con la política.",
    ledger: "Gasto de redacción",
    calls: "llamadas",
    cost: "coste",
    tokensIn: "tokens de entrada",
    tokensOut: "tokens de salida",
    never: "Todavía no se ha redactado nada, así que no ha salido nada.",
    refuses:
      "Un envío que contiene un valor retenido se rechaza entero, no se tacha. Bloquear una redacción tiene arreglo; enviar un DNI, no.",
  },
  en: {
    title: "What has ever left this machine",
    lead: "Only drafting sends anything, and only these keys are ever eligible. Everything else is filled locally, so it has no reason to travel.",
    sendable: "Sendable",
    withheld: "Withheld, always",
    withheldNote:
      "Anything nobody has classified yet lands here by default. The list above is an allowlist, not a denylist, and that is the whole difference.",
    yours: "In your file",
    yoursNote: "The keys you actually hold right now, crossed with the policy.",
    ledger: "What drafting has cost",
    calls: "calls",
    cost: "cost",
    tokensIn: "input tokens",
    tokensOut: "output tokens",
    never: "Nothing has been drafted yet, so nothing has left.",
    refuses:
      "A payload that contains a withheld value is refused outright, not redacted. Blocking a draft is recoverable; sending a national ID is not.",
  },
} as const;

const num = (n: number, lang: Lang) => n.toLocaleString(lang);

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4.5 py-4">
      <p className="font-display text-[30px] leading-none">{value}</p>
      <p className="mt-1.5">
        <Mono>{label}</Mono>
      </p>
    </div>
  );
}

export default function Privacy({
  lang,
  facts,
  withheld,
  ledger,
}: {
  lang: Lang;
  facts: readonly Fact[];
  withheld: Set<string>;
  ledger: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
}) {
  const c = t[lang];

  const held = facts.filter((f) => f.value.trim());
  const yoursSendable = held.filter((f) => !withheld.has(f.key)).map((f) => f.key).sort();
  const yoursWithheld = held.filter((f) => withheld.has(f.key)).map((f) => f.key).sort();

  /*
   * The policy, stated from the policy itself rather than retyped.
   *
   * `SENDABLE_KEYS` is the allowlist; the prefixes are not exported, so they are
   * recovered by asking `classifyEgress` about a probe key under each family.
   * Reading the policy through its own function means this screen cannot drift
   * from what the server will actually do — which, on this screen of all
   * screens, is the property that matters.
   */
  const families = ["work.skill.x", "languages.x", "motivation.x"]
    .filter((probe) => classifyEgress(probe) === "sendable")
    .map((probe) => `${probe.slice(0, probe.lastIndexOf(".") + 1)}*`);

  return (
    <div className="flex flex-col gap-6">
      <PageHead title={c.title} lead={c.lead} />

      <div className="grid gap-3 md:grid-cols-2">
        <Card title={c.sendable} meta={`${SENDABLE_KEYS.length + families.length}`}>
          <div className="flex flex-wrap gap-1.5 px-4.5 py-4">
            {[...families, ...SENDABLE_KEYS].map((k) => (
              <Pill key={k}>{k}</Pill>
            ))}
          </div>
        </Card>

        <Card title={c.withheld} meta={`${yoursWithheld.length} ${lang === "es" ? "tuyas" : "yours"}`}>
          <div className="flex flex-wrap gap-1.5 px-4.5 py-4">
            {yoursWithheld.map((k) => (
              <Pill key={k} tone="withheld">
                {k}
              </Pill>
            ))}
            <Pill tone="withheld">
              {lang === "es" ? "todo lo no clasificado" : "everything unclassified"}
            </Pill>
          </div>
          <p className="border-t border-rule-100 px-4.5 py-3 text-[12.5px] leading-relaxed text-graphite-400 text-pretty">
            {c.withheldNote}
          </p>
        </Card>
      </div>

      {yoursSendable.length > 0 && (
        <Card title={c.yours} meta={`${yoursSendable.length} / ${held.length}`}>
          <p className="border-b border-rule-100 px-4.5 py-3 text-[13.5px] text-graphite-400 text-pretty">
            {c.yoursNote}
          </p>
          <div className="flex flex-wrap gap-1.5 px-4.5 py-4">
            {yoursSendable.map((k) => (
              <Pill key={k} tone="done">
                {k}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      <div>
        <Eyebrow>{c.ledger}</Eyebrow>
        <div className="mt-3 overflow-hidden rounded-xl border border-rule-400 bg-white">
          {ledger.calls === 0 ? (
            <p className="px-4.5 py-8 text-center text-[14px] text-graphite-400">{c.never}</p>
          ) : (
            <div className="grid gap-px bg-rule-200 sm:grid-cols-4">
              <div className="bg-white">
                <Figure value={num(ledger.calls, lang)} label={c.calls} />
              </div>
              <div className="bg-white">
                <Figure value={`$${ledger.costUsd.toFixed(3)}`} label={c.cost} />
              </div>
              <div className="bg-white">
                <Figure value={num(ledger.inputTokens, lang)} label={c.tokensIn} />
              </div>
              <div className="bg-white">
                <Figure value={num(ledger.outputTokens, lang)} label={c.tokensOut} />
              </div>
            </div>
          )}
          <p className="border-t border-rule-200 bg-bone-100 px-4.5 py-3 text-[12.5px] leading-relaxed text-graphite-400 text-pretty">
            {c.refuses}
          </p>
        </div>
      </div>
    </div>
  );
}
