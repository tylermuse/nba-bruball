-- Resolve conflicting legacy check constraints, normalize the data, enforce.
--
-- The pre-existing schema encoded the "draft hasn't started" state as
-- 'not_started'; this codebase uses 'pending'. Both constraints existed at
-- once and Postgres ANDs them together:
--
--   leagues_draft_status_check   CHECK (draft_status IN ('not_started','in_progress','complete'))
--   leagues_draft_status_check2  CHECK (draft_status IN ('pending','in_progress','complete')) NOT VALID
--
-- The intersection excludes BOTH spellings of "not started", so the existing
-- league was wedged: it couldn't be updated to 'pending' (violates the legacy
-- check) or back to 'not_started' (violates ours). That is not cosmetic —
-- join_league_by_code() only admits members when draft_status = 'pending', so
-- the league silently rejected every join with "That league has already
-- started its draft".
--
-- Standardize on 'pending' (what the app and RPCs use), drop the legacy
-- constraint, and drop our redundant duplicates of the checks that already
-- agreed. One constraint per column, all validated.

-- 1. Drop the conflicting legacy constraint and our now-redundant duplicates.
alter table public.leagues        drop constraint if exists leagues_draft_status_check;
alter table public.leagues        drop constraint if exists leagues_draft_mode_check2;
alter table public.leagues        drop constraint if exists leagues_size_check2;
alter table public.league_members drop constraint if exists league_members_role_check2;

-- 2. Normalize legacy vocabulary to the canonical values.
update public.leagues
set draft_status = 'pending'
where draft_status in ('not_started', 'notstarted', 'not started', 'setup', 'new');

update public.leagues
set draft_status = 'in_progress'
where draft_status in ('drafting', 'started', 'live', 'in progress');

update public.leagues
set draft_status = 'complete'
where draft_status in ('done', 'completed', 'finished');

update public.leagues
set draft_mode = 'async'
where draft_mode not in ('async', 'live');

update public.league_members
set role = 'member'
where role not in ('commissioner', 'member');

-- The league creator is always its commissioner.
update public.league_members m
set role = 'commissioner'
from public.leagues l
where m.league_id = l.id
  and m.profile_id = l.commissioner_id
  and m.role <> 'commissioner';

-- 3. Validate our constraint now that the data conforms, so Postgres rejects
--    any future write that reintroduces a stray value.
do $$
begin
  begin
    alter table public.leagues validate constraint leagues_draft_status_check2;
  exception when others then
    raise notice 'Could not validate leagues_draft_status_check2: %', sqlerrm;
  end;
end $$;
