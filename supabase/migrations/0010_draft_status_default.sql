-- New leagues failed to insert: "violates check constraint leagues_draft_status_check2".
--
-- 0002 standardized draft_status on 'pending' and dropped the legacy check, but
-- the column default still came from the pre-existing schema ('not_started').
-- create_league() relies on that default, so every new league was rejected.

alter table public.leagues alter column draft_status set default 'pending';
