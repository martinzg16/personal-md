-- Take back what the project handed out before this schema existed.
--
-- A Supabase project ships default privileges that grant `anon` and
-- `authenticated` every privilege on any table later created in `public`. The
-- first migration only ever GRANTed, so it added to a pile that already
-- contained SELECT on all five tables — including `events`, described there as
-- a write-only sink.
--
-- Nothing leaked: RLS held on its own, and every unauthorised read came back as
-- an empty array rather than data. But it held with one layer where the design
-- claimed two, and the second layer is the one that survives somebody adding a
-- well-meaning SELECT policy later. So: revoke everything, then grant back
-- exactly the list, table by table.
--
-- Found by curling the deployed project. The local harness could not have
-- caught it until it grew those default privileges too, which it now has.

revoke all on public.accounts from anon, authenticated;
revoke all on public.vaults from anon, authenticated;
revoke all on public.events from anon, authenticated;
revoke all on public.event_names from anon, authenticated;
revoke all on public.identities from anon, authenticated;

-- Write-only. No SELECT for anybody but the service role: reading the funnel is
-- not a client's job.
grant insert on public.events to anon, authenticated;

-- The taxonomy is public knowledge, and the validation trigger runs as the
-- caller, so the caller has to be able to read it.
grant select on public.event_names to anon, authenticated;

-- Signed-in only, and RLS still narrows each of these to the caller's own rows.
grant select on public.accounts to authenticated;
grant select, insert, update, delete on public.vaults to authenticated;
grant select, insert on public.identities to authenticated;

-- And stop the same thing happening to the next table somebody adds here.
alter default privileges in schema public revoke all on tables from anon, authenticated;
