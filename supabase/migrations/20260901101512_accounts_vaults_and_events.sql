-- Accounts, encrypted vaults, and the funnel.
--
-- The product's promise is that the contents of a PERSONAL.md never leave the
-- machine in a form anyone else can read. An account is what connects that file
-- to the extension and tells one profile from another, so this schema is built
-- around a single rule: the server stores what it cannot decrypt.
--
--   * `vaults` holds ciphertext, an IV and the KDF parameters. No plaintext
--     column exists, so no bug can put plaintext in one.
--   * `auth.users` keeps the email. `public.accounts` does not copy it: a table
--     reachable through the Data API is a worse place for an address than one
--     that is not, and nothing on the client needs to read it back.
--   * `events` is a write-only sink. It has an INSERT policy and deliberately
--     no SELECT policy, so a leaked publishable key buys an attacker the
--     ability to add noise, not to read the funnel.
--
-- Since 2026-04-28 new tables in `public` are not exposed to the Data API
-- automatically (enforced everywhere from 2026-10-30), so every grant the
-- clients rely on is written out explicitly at the bottom of this file.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  created_at timestamptz not null default now()
);

comment on table public.accounts is
  'One row per signed-up user. Deliberately holds no email: that lives in auth.users, which the Data API does not expose.';

-- A row per user, created by the database rather than the client, so an account
-- cannot be half-created by a client that closes the tab after verifying.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- vaults: the encrypted profiles
-- ---------------------------------------------------------------------------

create table public.vaults (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  -- The only human-readable field, and it is the user's own label for the
  -- profile ("personal", "freelance"). Never the contents.
  name text not null check (length(name) between 1 and 60),
  ciphertext bytea not null check (octet_length(ciphertext) between 1 and 2097152),
  iv bytea not null check (octet_length(iv) = 12),
  kdf_salt bytea not null check (octet_length(kdf_salt) = 16),
  -- The floor is enforced here, not only in the client: a vault written by an
  -- older or tampered build cannot be stored with a weak derivation.
  kdf_iters integer not null check (kdf_iters >= 600000),
  schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (owner, name)
);

create index vaults_owner_idx on public.vaults (owner);

comment on table public.vaults is
  'AES-GCM ciphertext of a profile mirror. The key is derived on the device from a passphrase that is never sent, so these rows are unreadable here by design.';

-- ---------------------------------------------------------------------------
-- the funnel
-- ---------------------------------------------------------------------------

-- The taxonomy is a table, not free text, because an event name typed by hand
-- in two places becomes two events within a fortnight.
create table public.event_names (
  name text primary key,
  -- Position in the signup funnel, or null for anything measured off to the side.
  step integer unique,
  -- Which property keys this event may carry. Anything else is rejected by the
  -- trigger below: it is the technical barrier against a personal detail
  -- reaching an analytics row by accident.
  prop_keys text[] not null default '{}'
);

insert into public.event_names (name, step, prop_keys) values
  ('landing_viewed',      1, '{referrer_host}'),
  ('install_clicked',     2, '{placement}'),
  ('signup_started',      3, '{placement}'),
  ('signup_email_sent',   4, '{}'),
  ('signup_verified',     5, '{}'),
  ('extension_signed_in', 6, '{extension_version}'),
  ('vault_created',       7, '{}'),
  ('first_fill',          8, '{field_count}');

create table public.events (
  id bigint generated always as identity primary key,
  -- Present on every event, signed in or not: it is what makes a funnel a
  -- funnel rather than a pile of counters.
  anonymous_id uuid not null,
  account_id uuid references auth.users (id) on delete set null,
  name text not null references public.event_names (name),
  source text not null check (source in ('landing', 'extension')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2048)
);

-- Leading column serves the foreign key too, so `name` needs no index of its own.
create index events_name_occurred_idx on public.events (name, occurred_at desc);
create index events_anonymous_idx on public.events (anonymous_id, occurred_at);
create index events_account_idx on public.events (account_id) where account_id is not null;

create function public.validate_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed text[];
  offending text;
begin
  select prop_keys into allowed from public.event_names where name = new.name;

  select key into offending
  from jsonb_object_keys(new.props) as key
  where not (key = any(allowed))
  limit 1;

  if offending is not null then
    raise exception 'event %: property "%" is not on the allowlist', new.name, offending
      using errcode = 'check_violation';
  end if;

  -- A clock the server does not control cannot be trusted to order a funnel.
  -- Anything implausible is pulled back to arrival time rather than rejected:
  -- losing the event would hurt the measurement more than the skew does.
  if new.occurred_at > now() + interval '1 hour'
     or new.occurred_at < now() - interval '7 days' then
    new.occurred_at := now();
  end if;

  return new;
end;
$$;

create trigger events_validate
  before insert on public.events
  for each row execute function public.validate_event();

-- Stitches the anonymous id a browser has been carrying to the account it
-- eventually signed into. The landing and the extension each have their own
-- anonymous id; both end up pointing at the same account, which is what lets a
-- visit three days ago be joined to an install today.
create table public.identities (
  anonymous_id uuid primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  linked_at timestamptz not null default now()
);

create index identities_account_idx on public.identities (account_id);

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.vaults enable row level security;
alter table public.events enable row level security;
alter table public.event_names enable row level security;
alter table public.identities enable row level security;

-- auth.uid() is wrapped in a select in every policy so it is evaluated once per
-- statement instead of once per row.

create policy accounts_select_own on public.accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy vaults_select_own on public.vaults
  for select to authenticated
  using ((select auth.uid()) = owner);

create policy vaults_insert_own on public.vaults
  for insert to authenticated
  with check ((select auth.uid()) = owner);

-- Both clauses: without WITH CHECK an update could hand the row to another user.
create policy vaults_update_own on public.vaults
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy vaults_delete_own on public.vaults
  for delete to authenticated
  using ((select auth.uid()) = owner);

-- Write-only, and an event may only claim the account of whoever is inserting
-- it. Anonymous events carry no account at all.
create policy events_insert on public.events
  for insert to anon, authenticated
  with check (account_id is null or account_id = (select auth.uid()));

-- The taxonomy is public knowledge — it is in the repository — and the
-- validation trigger runs as the caller, so the caller has to be able to read it.
create policy event_names_readable on public.event_names
  for select to anon, authenticated
  using (true);

create policy identities_insert_own on public.identities
  for insert to authenticated
  with check ((select auth.uid()) = account_id);

create policy identities_select_own on public.identities
  for select to authenticated
  using ((select auth.uid()) = account_id);

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
-- RLS decides which rows; these decide whether the table is reachable at all.
-- Nothing here grants SELECT on public.events: reading the funnel is a
-- service-role job.

grant usage on schema public to anon, authenticated;

grant insert on public.events to anon, authenticated;
grant select on public.event_names to anon, authenticated;
grant select, insert on public.identities to authenticated;
grant select on public.accounts to authenticated;
grant select, insert, update, delete on public.vaults to authenticated;

-- ---------------------------------------------------------------------------
-- reading the funnel
-- ---------------------------------------------------------------------------
-- In `private`, which the Data API does not expose, so it is reachable from the
-- SQL editor and the service role and from nowhere else.

create view private.funnel_by_day
with (security_invoker = true) as
select
  date_trunc('day', e.occurred_at) as day,
  n.step,
  e.name,
  count(distinct e.anonymous_id) as people,
  count(*) as events
from public.events e
join public.event_names n on n.name = e.name
where n.step is not null
group by 1, 2, 3
order by 1 desc, 2;

comment on view private.funnel_by_day is
  'Distinct anonymous ids per funnel step per day. Counts people, not hits: a reload is not a conversion.';
