/**
 * The consent notice.
 *
 * A page whose argument is "nothing is sent quietly" cannot open with a modal
 * that blocks the argument until you agree to being counted. So this is a strip
 * at the foot of the viewport, it never covers the statement, and both answers
 * are one click with equal weight — a greyed-out "reject" next to a bright
 * "accept" is a dark pattern, and this page would be the worst place to run one.
 *
 * It says what is actually at stake, which is small: an identifier that lets
 * two visits be recognised as the same person. Refusing still leaves the visit
 * counted, and the strip says so, because pretending refusal means invisibility
 * would be the third false claim on a page built to avoid them.
 */

import { useState } from "react";

import { declineConsent, grantConsent, measurementIsOn, readConsent } from "./analytics.ts";

export default function Consent() {
  const [asked, setAsked] = useState(() => readConsent() !== "unasked");
  if (asked || !measurementIsOn) return null;

  return (
    <div
      role="region"
      aria-label="Measurement"
      className="fixed inset-x-0 bottom-0 z-90 border-t border-ink-700 bg-ink-900/97 text-paper-050 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 sm:px-10">
        <p className="min-w-[18ch] flex-1 text-[13px] leading-relaxed text-paper-400 text-pretty">
          May Brío keep one anonymous identifier on this device, so a visit today and an install
          on Friday count as one person rather than two? Either way this visit is counted, and
          either way nothing you type here is ever sent.
        </p>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              declineConsent();
              setAsked(true);
            }}
            className="rounded-full border border-ink-600 px-4 py-2 text-[13px] font-medium text-paper-400 transition-colors hover:border-paper-400 hover:text-paper-050"
          >
            No, this visit only
          </button>
          <button
            type="button"
            onClick={() => {
              grantConsent();
              setAsked(true);
            }}
            className="rounded-full border border-ink-600 px-4 py-2 text-[13px] font-medium text-paper-050 transition-colors hover:border-paper-050"
          >
            Yes, remember me
          </button>
        </div>
      </div>
    </div>
  );
}
