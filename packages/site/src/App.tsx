/**
 * The landing.
 *
 * Three claims, in the order a sceptic asks them, and each one is checkable:
 *
 *   1. it fills, and then tells you what it did — the scene above shows the log;
 *   2. your identifiers never enter a prompt — the allowlist is in the source;
 *   3. it is one markdown file on your machine — you can open it.
 *
 * Nothing here is a feature list, and nothing is a benefit adjective. The two
 * numbers on the page are the two numbers the README actually measured; if they
 * stop being true, they have to change here too. See NUMBERS below.
 */

import { Suspense, lazy, useEffect } from "react";

import Consent from "./Consent.tsx";
import Scene from "./Scene.tsx";
import { referrerHost, track } from "./analytics.ts";
import { Mark } from "./icons.tsx";

/** Where "Add to Chrome" goes until there is a listing to send anyone to. */
const INSTALL_HREF = "https://github.com/martinzg16/personal-md#install";
const SOURCE_HREF = "https://github.com/martinzg16/personal-md";

/*
 * Lazy, because the signup is the only thing on this page that needs
 * supabase-js and it sits below three screens of argument. Loading it eagerly
 * doubled the bundle for a form most visitors scroll past.
 */
const Signup = lazy(() => import("./Signup.tsx"));

/*
 * The measured claims.
 *
 * The prototype carried "twelve minutes a form, or eleven seconds — median
 * across 34 applications". Nobody has run that measurement, and a landing page
 * for a product whose entire argument is "it tells you the truth about what it
 * did" cannot open with a number somebody made up. These two are from the
 * README's live measurement of the CLI path, and they are the honest version of
 * the same claim: the cost objection and the latency objection, answered.
 */
const NUMBERS = [
  {
    figure: "~$0.003",
    unit: "per drafted answer",
    note: "Measured, not modelled: ~26k input tokens per call, of which 99.9% is a prompt-cache read billed at roughly a tenth of fresh input.",
  },
  {
    figure: "~4.5s",
    unit: "to draft one",
    note: "Almost all of it CLI startup rather than inference. Filling a field you have filled before is instant and makes no call at all.",
  },
];

const CARDS = [
  {
    title: "It fills, then tells you what it did.",
    body: "Seven fields, one drafted paragraph, two it refused to guess. A short log, every line reversible on its own.",
    ground: "bg-brio-100",
    ink: "text-brio-700",
  },
  {
    title: "Your NIF never enters a prompt.",
    body: "Identifiers are matched and typed locally. Only prose-writing facts are ever sendable, and you can read the whole ledger.",
    ground: "bg-lapis-100",
    ink: "text-lapis-700",
  },
  {
    title: "One file. Plain markdown. Yours.",
    body: null,
    ground: "bg-amber-100",
    ink: "text-amber-800",
  },
];

function Button({
  href,
  children,
  tone = "primary",
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  tone?: "primary" | "quiet" | "invert";
  onClick?: () => void;
}) {
  const base =
    "inline-flex items-center rounded-full text-[15px] font-semibold transition-colors duration-150";
  const tones = {
    primary: "bg-lapis-500 px-6 py-3.5 text-white hover:bg-brio-500",
    quiet:
      "border border-rule-500 px-5 py-3.5 font-medium text-graphite-900 hover:border-graphite-900",
    invert: "bg-bone-050 px-6 py-3.5 text-graphite-900 hover:bg-brio-500 hover:text-white",
  } as const;
  return (
    <a href={href} onClick={onClick} className={`${base} ${tones[tone]}`}>
      {children}
    </a>
  );
}

export default function App() {
  /*
   * One view event per load, and the referrer's host only. Fired from an effect
   * with no dependencies rather than at module scope so it cannot double up
   * under React's development remount... which it would, so the guard is the
   * empty dependency array plus the fact that a duplicate here is counted by
   * anonymous id, not by hit.
   */
  useEffect(() => {
    const host = referrerHost();
    track("landing_viewed", host ? { referrer_host: host } : {});
  }, []);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-90 focus:rounded-full focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-paper-050"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-80 bg-ink-900/96 text-paper-050 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-6 px-5 py-2.5 sm:px-10">
          <a href="#main" className="flex items-center gap-2.5 text-paper-050">
            <Mark size={22} />
            <span className="font-display text-[19px] tracking-[0.01em]">Brío</span>
          </a>
          <nav className="flex items-center gap-1">
            <a
              href={SOURCE_HREF}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-medium text-paper-400 transition-colors hover:text-white"
            >
              Source
            </a>
            <a
              href={INSTALL_HREF}
              onClick={() => track("install_clicked", { placement: "header" })}
              className="rounded-full bg-brio-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brio-600"
            >
              Add to Chrome
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-[1080px] px-5 pb-10 pt-16 sm:px-10 sm:pt-24">
          <p className="brio-eyebrow text-graphite-400">A second brain for forms</p>
          {/*
            Clamped rather than fixed at the design's 82px: the statement is the
            page, and it has to survive a 360px phone without breaking "twice"
            onto a line of its own.
          */}
          <h1
            className="mt-5 max-w-[20ch] font-display font-normal leading-[0.98] tracking-[-0.02em] text-balance"
            style={{ fontSize: "clamp(44px, 8vw, 82px)" }}
          >
            Never fill the same form <span className="text-brio-500">twice</span>.
          </h1>
          <p className="mt-6 max-w-[56ch] text-[17px] leading-[1.55] text-graphite-700 text-pretty sm:text-[19px]">
            Brío keeps what you have already answered — your facts, your stories, the sentences
            you actually wrote — and fills any form in your own voice. In either language. From
            one file you own.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <Button href={INSTALL_HREF} onClick={() => track("install_clicked", { placement: "hero" })}>
              Add to Chrome — free
            </Button>
            <Button href="#scene" tone="quiet">
              See it fill a form
            </Button>
            {/*
              This said "no account · no API key" until accounts existed. An
              account is still optional - everything on this page works without
              one - and it buys exactly one thing, so the line now says which.
            */}
            <span className="brio-mono text-[11.5px] text-graphite-400">
              optional account · no API key
            </span>
          </div>
        </section>

        <section id="scene" className="mx-auto max-w-[1080px] px-5 pt-6 sm:px-10">
          <Scene />
        </section>

        <section className="mx-auto max-w-[1080px] px-5 py-20 sm:px-10 sm:py-22">
          <div className="grid gap-px overflow-hidden rounded-xl border border-rule-400 bg-rule-400 sm:grid-cols-3">
            {CARDS.map((card) => (
              <div key={card.title} className={`px-7 py-8 ${card.ground}`}>
                <p
                  className={`font-display leading-[1.1] tracking-[-0.01em] text-balance ${card.ink}`}
                  style={{ fontSize: "clamp(26px, 2.6vw, 30px)" }}
                >
                  {card.title}
                </p>
                <p className="mt-3.5 text-[14.5px] leading-relaxed text-graphite-600 text-pretty">
                  {card.body ?? (
                    <>
                      Everything lives in{" "}
                      <code className="font-mono text-[13px]">PERSONAL.md</code> on your machine.
                      Edit it by hand at 2am; Brío keeps up.
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/*
          The fourth claim, and the only one that involves a server. It answers
          the question an account raises on a page like this - "so now you have
          my file?" - in the same sentence that offers the account, rather than
          in a privacy policy nobody opens.
        */}
        <section
          id="sync"
          className="border-t border-rule-400 bg-bone-100"
        >
          <div className="mx-auto max-w-[1080px] px-5 py-20 sm:px-10 sm:py-22">
            <p className="brio-eyebrow text-graphite-400">Optional, and only for this</p>
            <p
              className="mt-5 max-w-[22ch] font-display leading-[1.05] tracking-[-0.01em] text-balance"
              style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
            >
              Your second machine, without a copy anyone can read.
            </p>
            <p className="mt-5 max-w-[56ch] text-[16px] leading-[1.55] text-graphite-700 text-pretty">
              An account carries your profile to another computer, and keeps a work profile
              apart from a personal one. It is encrypted here, on your machine, with a
              passphrase that is never sent — so what the server stores is a block of bytes it
              has no way to open. The file on disk is still the original, still yours, still
              editable at 2am.
            </p>
            <div className="mt-8 min-h-[3.25rem]">
              <Suspense fallback={null}>
                <Signup />
              </Suspense>
            </div>
          </div>
        </section>

        <section className="border-t border-rule-400 bg-ink-900 text-paper-050">
          <div className="mx-auto max-w-[1080px] px-5 py-16 sm:px-10">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <div>
                <p
                  className="max-w-[24ch] font-display leading-[1.05] text-balance"
                  style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
                >
                  No API key. Not anywhere, not ever.
                </p>
                <p className="mt-3.5 max-w-[52ch] text-[14.5px] text-paper-500 text-pretty">
                  Drafting runs through the <code className="font-mono text-[13.5px]">claude</code>{" "}
                  CLI you already sign into. Filling something you have filled before does not
                  call a model at all.
                </p>
              </div>
              <Button
                href={INSTALL_HREF}
                tone="invert"
                onClick={() => track("install_clicked", { placement: "footer" })}
              >
                Set it up
              </Button>
            </div>

            <dl className="mt-12 grid gap-px overflow-hidden rounded-xl bg-ink-700 sm:grid-cols-2">
              {NUMBERS.map((n) => (
                <div key={n.figure} className="bg-ink-900 px-7 py-7">
                  <dt className="flex items-baseline gap-2.5">
                    <span className="font-display text-[40px] leading-none">{n.figure}</span>
                    <span className="brio-mono text-graphite-300">{n.unit}</span>
                  </dt>
                  <dd className="mt-3 text-[13.5px] leading-relaxed text-paper-500 text-pretty">
                    {n.note}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-5 px-5 pb-11 text-[13px] text-graphite-400 sm:px-10">
            <span className="flex items-center gap-2 font-display text-[16px] text-paper-050">
              <Mark size={18} />
              Brío
            </span>
            <a href={SOURCE_HREF} className="transition-colors hover:text-paper-050">
              Source
            </a>
            <a
              href={`${SOURCE_HREF}/blob/main/DESIGN.md`}
              className="transition-colors hover:text-paper-050"
            >
              Design system
            </a>
            <a
              href={`${SOURCE_HREF}/blob/main/packages/core/src/types.ts`}
              className="transition-colors hover:text-paper-050"
            >
              What is sendable
            </a>
          </div>
        </section>
      </main>

      <Consent />
    </>
  );
}
