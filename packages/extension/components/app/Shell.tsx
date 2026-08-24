/**
 * The app's frame: a rail of five places, and the companion's state under it.
 *
 * The rail is not a settings menu with the interesting page bolted on at the
 * top. It is five answers to five questions somebody actually arrives with —
 * what does it know, what has it done, where does it get more, what has left this
 * machine, and how is it configured — and they are in that order because that is
 * the order the questions get asked.
 *
 * The companion card is always visible rather than living inside Settings,
 * because "drafting is not working" and "the companion is stopped" are the same
 * fact, and putting the second one two clicks away from every screen where the
 * first one shows up is how a tool earns a reputation for being flaky.
 */

import type { ConnectionState } from "../../lib/server-client.ts";
import type { Lang } from "@personal-md/core";

export type Tab = "context" | "activity" | "connections" | "privacy" | "settings";

export const TABS: { id: Tab; label: { es: string; en: string } }[] = [
  { id: "context", label: { es: "Contexto", en: "Context" } },
  { id: "activity", label: { es: "Actividad", en: "Activity" } },
  { id: "connections", label: { es: "Fuentes", en: "Connections" } },
  { id: "privacy", label: { es: "Privacidad", en: "Privacy" } },
  { id: "settings", label: { es: "Ajustes", en: "Settings" } },
];

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-brio-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-100";

export default function Shell({
  tab,
  onTab,
  lang,
  onLang,
  connection,
  port,
  badge,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  lang: Lang;
  onLang: (l: Lang) => void;
  connection: ConnectionState;
  port: number;
  /** Count shown against Privacy: how many keys are withheld right now. */
  badge: number | null;
  children: React.ReactNode;
}) {
  const up = connection.kind === "ok";

  return (
    <div className="min-h-screen bg-bone-050 font-sans text-[15px] leading-relaxed text-graphite-900 antialiased">
      <div className="flex items-center justify-between gap-6 bg-ink-900 px-5 py-2.5 text-paper-050">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brio-500 font-display text-[13px] leading-none text-white"
          >
            B
          </span>
          <span className="font-display text-[19px] tracking-[0.01em]">Brío</span>
        </span>

        {/*
          Two states, both always visible, because this is a choice about the
          user's own prose and not a mode they should have to discover. It sets
          which language a draft is written in; field labels are printed in both
          on every screen, so there is nothing else left for it to swap.
        */}
        <span className="flex items-center gap-3">
          <span className="brio-mono hidden text-graphite-300 sm:inline">
            {lang === "es" ? "Escribes en" : "You write in"}
          </span>
          <span className="flex overflow-hidden rounded-full bg-ink-700">
            {(["es", "en"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onLang(id)}
                aria-pressed={lang === id}
                className={`px-3 py-1 text-[12.5px] font-semibold transition-colors ${RING} ${
                  lang === id
                    ? "bg-brio-500 text-white"
                    : "text-paper-400 hover:text-paper-050"
                }`}
              >
                {id === "es" ? "Español" : "English"}
              </button>
            ))}
          </span>
        </span>
      </div>

      <div className="grid min-h-[calc(100vh-44px)] grid-cols-[minmax(0,1fr)] lg:grid-cols-[236px_minmax(0,1fr)]">
        <nav
          aria-label={lang === "es" ? "Tu fichero" : "Your file"}
          className="border-rule-400 bg-bone-100 px-4 py-6 lg:border-r"
        >
          <p className="brio-eyebrow px-2.5 text-graphite-300">
            {lang === "es" ? "Tu fichero" : "Your file"}
          </p>
          <div className="mt-3 flex flex-col gap-0.5">
            {TABS.map((n) => {
              const active = tab === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onTab(n.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] font-medium transition-colors ${RING} ${
                    active
                      ? "bg-bone-200 text-graphite-900"
                      : "text-graphite-600 hover:bg-bone-200 hover:text-graphite-900"
                  }`}
                >
                  {n.label[lang]}
                  {n.id === "privacy" && badge ? (
                    <span className="brio-mono rounded-full bg-brio-150 px-1.5 text-brio-500">
                      {badge}
                    </span>
                  ) : null}
                  {active && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brio-500" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-rule-300 bg-white p-3.5">
            <p className="brio-eyebrow text-graphite-300">
              {lang === "es" ? "Compañero" : "Companion"}
            </p>
            <p
              className={`mt-2 flex items-center gap-2 text-[13px] font-semibold ${
                up ? "text-jade-600" : "text-brio-700"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${up ? "bg-jade-600" : "bg-brio-500"}`}
              />
              {up
                ? `${lang === "es" ? "En marcha" : "Running"} · :${port}`
                : lang === "es"
                  ? "Parado"
                  : "Stopped"}
            </p>
            <p className="mt-1.5 text-[12px] leading-normal text-graphite-400 text-pretty">
              {lang === "es"
                ? "Rellenar funciona sin él. Redactar no."
                : "Filling works without it. Drafting does not."}
            </p>
          </div>
        </nav>

        <main className="min-w-0 px-6 pb-24 pt-9 sm:px-11">
          <div className="max-w-[920px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
