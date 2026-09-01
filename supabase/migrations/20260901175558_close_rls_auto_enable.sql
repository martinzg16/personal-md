-- Stop anon calling a SECURITY DEFINER function over the API.
--
-- `public.rls_auto_enable()` is not ours — it ships with the project, as the
-- event-trigger helper that turns RLS on for newly created tables. Postgres
-- grants EXECUTE on every new function to PUBLIC, and `anon` and `authenticated`
-- inherit from PUBLIC, so it is reachable at `/rest/v1/rpc/rls_auto_enable` by
-- anybody holding the publishable key — which is anybody who opens the landing.
-- Both of the project's security advisors are about exactly that.
--
-- The function is invoked by the database on an event trigger, not by clients,
-- so nothing that should call it loses the ability to. Guarded rather than
-- written flat, because it is a platform-managed object: if a future project
-- does not have it, this migration should be a no-op, not a failure.

do $$
declare fn oid := to_regprocedure('public.rls_auto_enable()');
begin
  if fn is null then
    raise notice 'public.rls_auto_enable() is not present here; nothing to close';
    return;
  end if;
  revoke execute on function public.rls_auto_enable() from public;
  revoke execute on function public.rls_auto_enable() from anon;
  revoke execute on function public.rls_auto_enable() from authenticated;
  raise notice 'revoked execute on public.rls_auto_enable() from public, anon, authenticated';
end $$;
