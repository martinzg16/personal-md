-- Start the funnel from zero.
--
-- Verifying that the deployed schema actually accepted an event meant writing
-- some, and a handful of curl rows with a made-up referrer are indistinguishable
-- from real ones once they are a week old. The first number this table reports
-- should be a real number.
--
-- A data statement in a migration is unusual and deliberate: it is the only
-- write path this repository has to the project, and on any environment that is
-- not this one it deletes nothing, because there is nothing there yet.

do $$
declare removed integer;
begin
  delete from public.events;
  get diagnostics removed = row_count;
  raise notice 'cleared % verification event(s)', removed;
end $$;
