-- What the schema must guarantee, asserted rather than assumed.
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.report(ok boolean, label text) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when ok then 'PASS' else 'FAIL' end, label;
end $$;

-- Two users, as the auth service would have made them.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- 1. the trigger gave each of them an account
do $$
begin
  perform pg_temp.report(
    (select count(*) from public.accounts) = 2,
    'signing up creates an accounts row');
end $$;

-- 2. anon may write an anonymous event
do $$
begin
  set local role anon;
  insert into public.events (anonymous_id, name, source, occurred_at, props)
  values (gen_random_uuid(), 'landing_viewed', 'landing', now(), '{"referrer_host":"news.ycombinator.com"}');
  perform pg_temp.report(true, 'anon can write an anonymous event');
exception when others then
  perform pg_temp.report(false, 'anon can write an anonymous event: ' || sqlerrm);
end $$;

-- 3. anon may not read the funnel back
do $$
declare n integer;
begin
  set local role anon;
  select count(*) into n from public.events;
  perform pg_temp.report(n = 0, 'anon reads zero events (write-only sink)');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'anon reads zero events (privilege denied outright)');
end $$;

-- 4. a property outside the allowlist is refused
do $$
begin
  set local role anon;
  insert into public.events (anonymous_id, name, source, occurred_at, props)
  values (gen_random_uuid(), 'landing_viewed', 'landing', now(), '{"email":"martin@example.com"}');
  perform pg_temp.report(false, 'a property outside the allowlist is refused');
exception when check_violation then
  perform pg_temp.report(true, 'a property outside the allowlist is refused');
end $$;

-- 5. an invented event name is refused
do $$
begin
  set local role anon;
  insert into public.events (anonymous_id, name, source, occurred_at)
  values (gen_random_uuid(), 'landing_view', 'landing', now());
  perform pg_temp.report(false, 'an invented event name is refused');
exception when foreign_key_violation then
  perform pg_temp.report(true, 'an invented event name is refused');
end $$;

-- 6. RETURNING needs SELECT, which anon does not have: the client must never
--    chain .select() onto an event insert. Asserted here so the rule is a test.
do $$
begin
  set local role anon;
  insert into public.events (anonymous_id, name, source, occurred_at)
  values ('33333333-3333-3333-3333-333333333333', 'install_clicked', 'landing', now())
  returning id;
  perform pg_temp.report(false, 'an event insert cannot return the row it wrote');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'an event insert cannot return the row it wrote');
end $$;

-- 6b. a wild clock is pulled back to arrival (read back as a privileged reader)
do $$
declare stamped timestamptz;
begin
  set local role anon;
  insert into public.events (anonymous_id, name, source, occurred_at)
  values ('44444444-4444-4444-4444-444444444444', 'install_clicked', 'landing', now() - interval '400 days');
  reset role;
  select occurred_at into stamped from public.events
  where anonymous_id = '44444444-4444-4444-4444-444444444444';
  perform pg_temp.report(stamped > now() - interval '1 minute',
    'an implausible occurred_at is clamped to arrival');
end $$;

-- 7. anon cannot attribute an event to somebody's account
do $$
begin
  set local role anon;
  insert into public.events (anonymous_id, account_id, name, source, occurred_at)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'signup_verified', 'landing', now());
  perform pg_temp.report(false, 'anon cannot claim an account_id');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'anon cannot claim an account_id');
end $$;

-- 8. a signed-in user may attribute an event to their own account, and only that one
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into public.events (anonymous_id, account_id, name, source, occurred_at)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'signup_verified', 'extension', now());
  perform pg_temp.report(true, 'a user can attribute an event to their own account');
exception when others then
  perform pg_temp.report(false, 'a user can attribute an event to their own account: ' || sqlerrm);
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into public.events (anonymous_id, account_id, name, source, occurred_at)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'signup_verified', 'extension', now());
  perform pg_temp.report(false, 'a user cannot attribute an event to somebody else');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'a user cannot attribute an event to somebody else');
end $$;

-- 9. a weakly derived vault cannot be stored
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into public.vaults (owner, name, ciphertext, iv, kdf_salt, kdf_iters)
  values ('11111111-1111-1111-1111-111111111111', 'weak', '\x00'::bytea,
          '\x000000000000000000000000'::bytea, '\x00000000000000000000000000000000'::bytea, 1000);
  perform pg_temp.report(false, 'a vault below the KDF floor is refused');
exception when check_violation then
  perform pg_temp.report(true, 'a vault below the KDF floor is refused');
end $$;

-- 10. a real vault for user A
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into public.vaults (owner, name, ciphertext, iv, kdf_salt, kdf_iters)
  values ('11111111-1111-1111-1111-111111111111', 'personal', '\xdeadbeef'::bytea,
          '\x000000000000000000000000'::bytea, '\x00000000000000000000000000000000'::bytea, 600000);
  perform pg_temp.report(true, 'a well-formed vault is stored');
exception when others then
  perform pg_temp.report(false, 'a well-formed vault is stored: ' || sqlerrm);
end $$;

-- 11. user B cannot see it
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select count(*) into n from public.vaults;
  perform pg_temp.report(n = 0, 'another user reads zero vaults');
end $$;

-- 12. user B cannot take it over with an update
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  update public.vaults set owner = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  perform pg_temp.report(n = 0, 'another user cannot take a vault over');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'another user cannot take a vault over');
end $$;

-- 13. and the owner still cannot hand it away
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update public.vaults set owner = '22222222-2222-2222-2222-222222222222'
  where owner = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.report(false, 'the owner cannot reassign a vault to somebody else');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'the owner cannot reassign a vault to somebody else');
end $$;

-- 14. two profiles per account, told apart by name
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into public.vaults (owner, name, ciphertext, iv, kdf_salt, kdf_iters)
  values ('11111111-1111-1111-1111-111111111111', 'freelance', '\xbeef'::bytea,
          '\x000000000000000000000000'::bytea, '\x00000000000000000000000000000000'::bytea, 600000);
  perform pg_temp.report(
    (select count(*) from public.vaults where owner = '11111111-1111-1111-1111-111111111111') = 2,
    'one account can hold several named profiles');
end $$;

-- 15. the funnel view counts people, not hits
do $$
declare n integer;
begin
  select count(*) into n from private.funnel_by_day;
  perform pg_temp.report(n > 0, 'the funnel view returns rows to a privileged reader');
end $$;

-- 16. the anonymous id can be bound to an account, and rebinding is a no-op
--     rather than an error: the client sends ON CONFLICT DO NOTHING because it
--     has INSERT on this table and deliberately no UPDATE.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into public.identities (anonymous_id, account_id)
  values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111')
  on conflict (anonymous_id) do nothing;
  insert into public.identities (anonymous_id, account_id)
  values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111')
  on conflict (anonymous_id) do nothing;
  perform pg_temp.report(true, 'binding an anonymous id twice is harmless');
exception when others then
  perform pg_temp.report(false, 'binding an anonymous id twice is harmless: ' || sqlerrm);
end $$;

-- 17. and nobody can bind an id to somebody else's account
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  insert into public.identities (anonymous_id, account_id)
  values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111');
  perform pg_temp.report(false, 'an anonymous id cannot be bound to another account');
exception when insufficient_privilege then
  perform pg_temp.report(true, 'an anonymous id cannot be bound to another account');
end $$;

-- 18. the grants themselves, not just the policies.
--     A Supabase project hands anon SELECT on every new public table, so "no
--     SELECT policy" was doing all the work on its own. These assert the second
--     layer is back: the privilege is absent, so a policy added by mistake
--     later still cannot open the table.
do $$
declare bad text := '';
begin
  if has_table_privilege('anon', 'public.events', 'SELECT') then bad := bad || ' anon-select-events'; end if;
  if has_table_privilege('authenticated', 'public.events', 'SELECT') then bad := bad || ' auth-select-events'; end if;
  if has_table_privilege('anon', 'public.vaults', 'SELECT') then bad := bad || ' anon-select-vaults'; end if;
  if has_table_privilege('anon', 'public.accounts', 'SELECT') then bad := bad || ' anon-select-accounts'; end if;
  if has_table_privilege('anon', 'public.identities', 'SELECT') then bad := bad || ' anon-select-identities'; end if;
  if has_table_privilege('authenticated', 'public.identities', 'UPDATE') then bad := bad || ' auth-update-identities'; end if;
  if has_table_privilege('authenticated', 'public.accounts', 'UPDATE') then bad := bad || ' auth-update-accounts'; end if;
  perform pg_temp.report(bad = '', 'no role holds a privilege it was never meant to have:' || coalesce(nullif(bad, ''), ' none'));
end $$;

-- 19. and the ones the app genuinely needs are still there
do $$
declare missing text := '';
begin
  if not has_table_privilege('anon', 'public.events', 'INSERT') then missing := missing || ' anon-insert-events'; end if;
  if not has_table_privilege('anon', 'public.event_names', 'SELECT') then missing := missing || ' anon-select-names'; end if;
  if not has_table_privilege('authenticated', 'public.vaults', 'UPDATE') then missing := missing || ' auth-update-vaults'; end if;
  if not has_table_privilege('authenticated', 'public.accounts', 'SELECT') then missing := missing || ' auth-select-accounts'; end if;
  if not has_table_privilege('authenticated', 'public.identities', 'INSERT') then missing := missing || ' auth-insert-identities'; end if;
  perform pg_temp.report(missing = '', 'every privilege the app needs is present:' || coalesce(nullif(missing, ''), ' all'));
end $$;
