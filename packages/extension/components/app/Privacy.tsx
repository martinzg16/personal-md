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
 * Since accounts existed there is a third thing, and it is on this screen for
 * the same reason as the other two: a page called "what has ever left this
 * machine" that quietly omits a category is worse than no page. An account
 * names you to GitHub, keeps a session, and pushes a vault - and the vault is
 * the interesting one, because it leaves sealed and the server has no key.
 *
 * The ledger underneath is what the companion has actually spent. It is an
 * aggregate, which is what the file holds: `PERSONAL.md` counts calls and cost,
 * it does not keep a line per call. Saying "4 calls, $0.09" and nothing more is
 * the whole truth; a fabricated table of individual sends would not be.
 */

import { useEffect, useState } from "react";

import { SENDABLE_KEYS, classifyEgress, type Fact, type Lang } from "@personal-md/core";

import { type AccountState, accountState } from "../../lib/account.ts";
import { Card, Eyebrow, Mono, PageHead, Pill } from "./primitives.tsx";

const t = {
  es: {
    title: "Qué ha salido de esta máquina",
    lead: "Redactar es lo único que envía contenido, y solo estas claves pueden ir. Una cuenta añade tres cosas más, abajo. Todo lo demás se rellena aquí.",
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
    account: "Tu cuenta",
    accountOff: "No hay cuenta en esta compilación, así que nada de esto ha salido.",
    accountOut: "No has entrado. Nada de esto ha salido todavía.",
    accountIn: "Has entrado, así que esto sí ha salido:",
    sends: [
      ["Tu cuenta de GitHub", "Solo tu identificador y tu handle, para saber que eres tú. Los guarda el servicio de identidad, no una tabla nuestra. No se manda ningún correo."],
      ["Una sesión", "Vive en esta extensión. No la ve ninguna página."],
      ["El perfil, cifrado", "Solo si le das a Subir. Se sella aquí con tu frase de paso, que no se envía nunca: lo que se guarda allí no se puede abrir allí."],
    ] as const,
  },
  en: {
    title: "What has ever left this machine",
    lead: "Drafting is the only thing that sends content, and only these keys are ever eligible. An account adds three more, below. Everything else is filled locally.",
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
    account: "Your account",
    accountOff: "There is no account in this build, so none of this has left.",
    accountOut: "You are not signed in. None of this has left yet.",
    accountIn: "You are signed in, so these have left:",
    sends: [
      ["Your GitHub account", "Your id and handle, so it knows you are you. The identity service holds them; no table of ours copies them. No email is sent at all."],
      ["A session", "Lives in this extension. No page ever sees it."],
      ["The profile, sealed", "Only when you press Push. It is sealed here with your passphrase, which is never sent: what is stored there cannot be opened there."],
    ] as const,
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

  const [account, setAccount] = useState<AccountState>({ kind: "unconfigured" });
  useEffect(() => {
    void accountState().then(setAccount);
  }, []);

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

      {/*
        Always rendered, signed in or not. "Nothing has left" is a claim worth
        making explicitly; showing this list only once it applies would mean the
        screen was silent about a whole category right up until it mattered.
      */}
      <Card title={c.account}>
        <p className="border-b border-rule-100 px-4.5 py-3 text-[13.5px] text-graphite-400 text-pretty">
          {account.kind === "unconfigured"
            ? c.accountOff
            : account.kind === "signed_in"
              ? c.accountIn
              : c.accountOut}
        </p>
        <ul className="divide-y divide-rule-100">
          {c.sends.map(([label, detail]) => (
            <li key={label} className="flex flex-col gap-1 px-4.5 py-3">
              <span className="flex items-center gap-2 text-[13.5px] font-medium text-graphite-900">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    account.kind === "signed_in" ? "bg-brio-500" : "bg-rule-500"
                  }`}
                />
                {label}
              </span>
              <span className="pl-3.5 text-[12.5px] leading-relaxed text-graphite-400 text-pretty">
                {detail}
              </span>
            </li>
          ))}
        </ul>
      </Card>

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
