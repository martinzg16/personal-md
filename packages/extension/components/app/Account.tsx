/**
 * The account card, and the only place in the extension that talks to a server
 * other than the companion.
 *
 * It is self-contained rather than prop-driven like the rest of Settings,
 * because everything it needs is its own: nothing else in the app reads the
 * session, and threading a dozen callbacks through the shell would spread a
 * feature that is meant to be removable across four files.
 *
 * The passphrase is asked for separately from the sign-in, and after it, on
 * purpose. They are different secrets with different consequences: GitHub
 * proves who you are and can always prove it again, the passphrase decrypts the
 * profile and cannot be reset by anyone. Asking for both on one screen invites
 * treating them as one thing.
 */

import { useCallback, useEffect, useState } from "react";

import { SIGN_IN_MESSAGES, isConfigured } from "@personal-md/identity";
import type { Lang } from "@personal-md/core";

import {
  type AccountState,
  accountState,
  forgetPassphrase,
  rememberPassphrase,
  signIn,
  signOut,
} from "../../lib/account.ts";
import { DEFAULT_VAULT, type SyncResult, pullVault, pushVault } from "../../lib/vault.ts";
import { Card, Mono, RING } from "./primitives.tsx";

const t = {
  es: {
    title: "Tu cuenta",
    off: "Esta compilación no lleva cuentas. Rellenar y redactar funcionan igual.",
    lead: "Lleva tu perfil a otra máquina, separa el del trabajo del personal, y es lo que pide redactar. Rellenar lo que ya has rellenado nunca la necesita.",
    signIn: "Entrar con GitHub",
    opening: "Abriendo GitHub…",
    signedInAs: "Dentro como",
    signOut: "Salir",
    passphrase: "Frase de paso",
    passphraseHelp:
      "Cifra tu perfil en esta máquina antes de subirlo. No se envía nunca, así que nadie puede recuperarla por ti: si la olvidas, el perfil guardado se pierde.",
    unlock: "Desbloquear",
    locked: "Bloqueado. Escribe la frase de paso para poder sincronizar.",
    profile: "Perfil",
    push: "Subir",
    pull: "Bajar",
    results: {
      pushed: "Subido.",
      pulled: "Bajado. Tu espejo local es ahora el guardado.",
      nothing_there: "No hay nada guardado con ese nombre todavía.",
      nothing_local: "No hay nada local que subir. Arranca el compañero primero.",
      locked: "Falta la frase de paso.",
      unconfigured: "Las cuentas no están activadas.",
      signed_out: "Hay que entrar primero.",
      wrong_passphrase: "Esa frase de paso no abre este perfil.",
      offline: "Sin conexión.",
      error: "No se pudo.",
    },
  },
  en: {
    title: "Your account",
    off: "This build ships without accounts. Filling and drafting work the same.",
    lead: "Carries your profile to another machine, keeps work apart from personal, and is what drafting asks for. Filling what you have filled before never needs it.",
    signIn: "Continue with GitHub",
    opening: "Opening GitHub…",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    passphrase: "Passphrase",
    passphraseHelp:
      "Encrypts your profile on this machine before it is uploaded. It is never sent, so nobody can recover it for you: forget it and the stored profile is gone.",
    unlock: "Unlock",
    locked: "Locked. Type the passphrase to sync.",
    profile: "Profile",
    push: "Push",
    pull: "Pull",
    results: {
      pushed: "Pushed.",
      pulled: "Pulled. Your local mirror is now the stored one.",
      nothing_there: "Nothing is stored under that name yet.",
      nothing_local: "Nothing local to push. Start the companion first.",
      locked: "The passphrase is missing.",
      unconfigured: "Accounts are not switched on.",
      signed_out: "Sign in first.",
      wrong_passphrase: "That passphrase does not open this profile.",
      offline: "No connection.",
      error: "That did not work.",
    },
  },
} as const;

export default function Account({ lang }: { lang: Lang }) {
  const c = t[lang];
  const [state, setState] = useState<AccountState>({ kind: "unconfigured" });
  const [passphrase, setPassphrase] = useState("");
  const [vault, setVault] = useState(DEFAULT_VAULT);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => setState(await accountState()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const input =
    `rounded-md border border-rule-400 bg-bone-100 px-2.5 py-2 font-mono text-[13px] ` +
    `text-graphite-900 transition-colors focus:border-graphite-400 ${RING}`;
  const quiet = `rounded-full border border-rule-400 px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-graphite-900 ${RING}`;
  const solid = `rounded-full bg-ink-900 px-4 py-1.5 text-[13px] font-semibold text-bone-050 transition-colors hover:bg-brio-500 disabled:opacity-60 ${RING}`;

  function report(result: SyncResult) {
    setNote(c.results[result.kind]);
  }

  if (!isConfigured()) {
    return (
      <Card title={c.title}>
        <p className="px-4.5 py-3.5 text-[13.5px] leading-relaxed text-graphite-600 text-pretty">
          {c.off}
        </p>
      </Card>
    );
  }

  return (
    <Card title={c.title} meta={state.kind === "signed_in" ? state.label : undefined}>
      <p className="border-b border-rule-100 px-4.5 py-3 text-[13.5px] leading-relaxed text-graphite-600 text-pretty">
        {c.lead}
      </p>

      {state.kind !== "signed_in" ? (
        <div className="flex flex-wrap items-center gap-2.5 px-4.5 py-3.5">
          <button
            type="button"
            disabled={busy}
            className={solid}
            onClick={async () => {
              setBusy(true);
              setNote("");
              const result = await signIn();
              setBusy(false);
              if (result.kind === "signed_in") {
                await refresh();
                return;
              }
              setNote(
                result.kind === "error" ? result.message : SIGN_IN_MESSAGES[result.kind],
              );
            }}
          >
            {busy ? c.opening : c.signIn}
          </button>
        </div>
      ) : (
        <>
          {!state.unlocked ? (
            <div className="px-4.5 py-3.5">
              <p className="text-[13.5px] text-brio-700">{c.locked}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <input
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={c.passphrase}
                  className={`${input} w-[240px]`}
                />
                <button
                  type="button"
                  disabled={passphrase.length === 0}
                  className={solid}
                  onClick={async () => {
                    await rememberPassphrase(passphrase);
                    setPassphrase("");
                    await refresh();
                  }}
                >
                  {c.unlock}
                </button>
              </div>
              <p className="mt-2.5 max-w-[62ch] text-[12.5px] leading-relaxed text-graphite-400 text-pretty">
                {c.passphraseHelp}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 px-4.5 py-3.5">
              <label htmlFor="vault-name" className="text-[13.5px] text-graphite-600">
                {c.profile}
              </label>
              <input
                id="vault-name"
                value={vault}
                onChange={(e) => setVault(e.target.value)}
                className={`${input} w-[150px]`}
              />
              <button
                type="button"
                disabled={busy}
                className={quiet}
                onClick={async () => {
                  setBusy(true);
                  report(await pushVault(vault));
                  setBusy(false);
                }}
              >
                {c.push}
              </button>
              <button
                type="button"
                disabled={busy}
                className={quiet}
                onClick={async () => {
                  setBusy(true);
                  report(await pullVault(vault));
                  setBusy(false);
                }}
              >
                {c.pull}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-rule-200 bg-bone-100 px-4.5 py-3">
            <Mono>
              {c.signedInAs} {state.label}
            </Mono>
            <button
              type="button"
              className={quiet}
              onClick={async () => {
                await forgetPassphrase();
                await signOut();
                setNote("");
                await refresh();
              }}
            >
              {c.signOut}
            </button>
          </div>
        </>
      )}

      {note ? (
        <p
          role="status"
          className="border-t border-rule-100 px-4.5 py-2.5 text-[13px] text-graphite-600"
        >
          {note}
        </p>
      ) : null}
    </Card>
  );
}
