-- Enough of Supabase to run the migration honestly: the roles, the auth schema,
-- and a uid() that reads the same setting PostgREST sets per request.
-- Roles are cluster-wide, so this has to survive a rerun.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

/*
 * The part stock Postgres does not do, and the reason a local pass once meant
 * less than it looked.
 *
 * A real Supabase project ships default privileges that hand `anon` and
 * `authenticated` every privilege on any table later created in `public`. So a
 * migration that only ever GRANTs is not restricting anything - it is adding to
 * a pile that already has SELECT in it. Reproducing that here is what makes a
 * REVOKE testable.
 */
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant execute on function auth.uid() to anon, authenticated, service_role;
