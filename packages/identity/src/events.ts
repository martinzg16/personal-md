/**
 * The funnel's vocabulary.
 *
 * One list, imported by the landing and by the extension, and mirrored by the
 * `event_names` table the database validates against. Two copies of a name is
 * how a funnel quietly splits in two, so `test/events.test.ts` reads the
 * migration and fails if these ever drift apart.
 *
 * The property allowlist is not a convenience. It is the line that keeps a
 * personal detail out of an analytics row: anything not named here is rejected
 * by a trigger, in the database, after the client has already made its mistake.
 */

export const EVENTS = {
  /** The landing rendered. `referrer_host` is a host, never a full URL. */
  landing_viewed: { step: 1, props: ["referrer_host"] },
  /** Somebody went for the install. `placement` says which of the three buttons. */
  install_clicked: { step: 2, props: ["placement"] },
  signup_started: { step: 3, props: ["placement"] },
  signup_email_sent: { step: 4, props: [] },
  signup_verified: { step: 5, props: [] },
  extension_signed_in: { step: 6, props: ["extension_version"] },
  vault_created: { step: 7, props: [] },
  /** The first field this account ever filled. `field_count`, not which fields. */
  first_fill: { step: 8, props: ["field_count"] },
} as const satisfies Record<string, { step: number; props: readonly string[] }>;

export type EventName = keyof typeof EVENTS;
export type EventSource = "landing" | "extension";

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

/** Ordered as the funnel is walked, which is the order a report should read. */
export const FUNNEL: EventName[] = [...EVENT_NAMES].sort((a, b) => EVENTS[a].step - EVENTS[b].step);

export interface EventRecord {
  name: EventName;
  source: EventSource;
  anonymousId: string;
  /** Only ever the sender's own account. The database refuses anything else. */
  accountId?: string;
  occurredAt: string;
  props: Record<string, string | number>;
}

export class EventRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventRejected";
  }
}

/**
 * The same check the trigger does, run before the request leaves.
 *
 * Duplicated deliberately: the database is the guarantee, this is the fast
 * failure that shows up in a test run rather than as a 400 in production.
 */
export function assertValid(event: EventRecord): void {
  const spec = EVENTS[event.name];
  if (!spec) throw new EventRejected(`unknown event "${event.name}"`);

  const allowed: readonly string[] = spec.props;
  for (const key of Object.keys(event.props)) {
    if (!allowed.includes(key)) {
      throw new EventRejected(
        `event "${event.name}" may not carry "${key}" (allowed: ${allowed.join(", ") || "none"})`,
      );
    }
  }
}

/** The row shape PostgREST expects, snake_case and all. */
export function toRow(event: EventRecord): Record<string, unknown> {
  assertValid(event);
  return {
    anonymous_id: event.anonymousId,
    account_id: event.accountId ?? null,
    name: event.name,
    source: event.source,
    occurred_at: event.occurredAt,
    props: event.props,
  };
}
