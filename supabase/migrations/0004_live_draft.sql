-- NBA Bruball — live draft room.
--
-- Adds the pieces async drafting didn't need: a pick clock, autopick when it
-- expires, pause/resume, and Realtime broadcast so every client sees a pick
-- the moment it lands.
--
-- The concurrency story matters here. In a live room several people may click
-- at the same instant, and the person on the clock may race the autopick. Two
-- things make that safe:
--   * unique(league_id, team_id) and unique(league_id, pick_number) mean the
--     database rejects the loser of any race outright
--   * make_pick re-reads draft_state inside the transaction and takes a row
--     lock, so two calls can't both believe they own the same pick number

drop function if exists public.autopick_if_expired(uuid) cascade;
drop function if exists public.pause_draft(uuid) cascade;
drop function if exists public.resume_draft(uuid) cascade;
drop function if exists public.set_pick_seconds(uuid, int) cascade;
drop function if exists public.best_available_team(uuid) cascade;

-- ---------------------------------------------------------------------------
-- Pause / resume
-- ---------------------------------------------------------------------------

alter table public.draft_state add column if not exists paused boolean not null default false;

create or replace function public.pause_draft(target_league uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can pause the draft';
  end if;
  update public.draft_state
  set paused = true, pick_deadline = null, updated_at = now()
  where league_id = target_league;
end;
$$;

create or replace function public.resume_draft(target_league uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secs int;
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can resume the draft';
  end if;

  select coalesce(l.pick_seconds, 90) into secs
  from public.leagues l where l.id = target_league;

  -- Resuming restarts the clock rather than resuming a partial one, so nobody
  -- comes back to two seconds left.
  update public.draft_state ds
  set paused = false,
      pick_deadline = case when (select draft_mode from public.leagues where id = target_league) = 'live'
                           then now() + make_interval(secs => secs) else null end,
      updated_at = now()
  where ds.league_id = target_league;
end;
$$;

create or replace function public.set_pick_seconds(target_league uuid, secs int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can change the pick clock';
  end if;
  if secs < 10 or secs > 600 then
    raise exception 'Pick clock must be between 10 and 600 seconds';
  end if;
  update public.leagues set pick_seconds = secs where id = target_league;
end;
$$;

-- ---------------------------------------------------------------------------
-- Autopick
-- ---------------------------------------------------------------------------

/**
 * Who to take when the clock runs out. "Best available" is by last season's
 * win total, which is the only quality signal we have that doesn't require
 * another data source — better than alphabetical, and deterministic.
 */
create or replace function public.best_available_team(target_league uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen text;
begin
  -- Preference order comes from a static ranking; anything not listed still
  -- gets picked, just last.
  select t.team_id into chosen
  from (
    select unnest(array[
      'oklahoma-city-thunder','san-antonio-spurs','detroit-pistons','boston-celtics',
      'denver-nuggets','los-angeles-lakers','new-york-knicks','cleveland-cavaliers',
      'houston-rockets','minnesota-timberwolves','toronto-raptors','atlanta-hawks',
      'orlando-magic','philadelphia-76ers','phoenix-suns','charlotte-hornets',
      'miami-heat','la-clippers','portland-trail-blazers','golden-state-warriors',
      'milwaukee-bucks','chicago-bulls','new-orleans-pelicans','dallas-mavericks',
      'memphis-grizzlies','utah-jazz','sacramento-kings','brooklyn-nets',
      'indiana-pacers','washington-wizards'
    ]) as team_id
  ) t
  where not exists (
    select 1 from public.draft_picks p
    where p.league_id = target_league and p.team_id = t.team_id
  )
  limit 1;

  return chosen;
end;
$$;

/**
 * Make the pick for whoever let the clock expire. Safe to call from any
 * client — it no-ops unless the deadline has actually passed, so several
 * browsers polling at once can't double-pick.
 */
create or replace function public.autopick_if_expired(target_league uuid)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
  state public.draft_state;
  team text;
  result public.draft_picks;
begin
  select * into l from public.leagues where id = target_league;
  if l.id is null or l.draft_status <> 'in_progress' or l.draft_mode <> 'live' then
    return null;
  end if;

  -- Lock the state row so concurrent callers serialize here.
  select * into state from public.draft_state
  where league_id = target_league for update;

  if state.league_id is null or state.paused then return null; end if;
  if state.pick_deadline is null or state.pick_deadline > now() then return null; end if;
  if not public.is_league_member(target_league) then return null; end if;

  team := public.best_available_team(target_league);
  if team is null then return null; end if;

  result := public.make_pick(target_league, team, state.on_the_clock_member_id);
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- make_pick, now with a row lock.
--
-- 0003's version read draft_state without locking, which was fine for async
-- drafting. In a live room a human click can race the autopick for the same
-- pick number: both read current_pick = N and both try to insert it. The
-- unique index would reject the loser, but with a confusing constraint error.
-- Taking FOR UPDATE on draft_state serializes them, so the second caller sees
-- the already-advanced state and fails the turn check cleanly instead.
-- ---------------------------------------------------------------------------

create or replace function public.make_pick(
  target_league uuid,
  team text,
  for_member uuid default null
)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
  state public.draft_state;
  acting_member uuid;
  expected_slot int;
  expected_member uuid;
  is_commish boolean;
  new_pick public.draft_picks;
  next_pick int;
  next_member uuid;
  total_picks constant int := 30;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into l from public.leagues where id = target_league;
  if l.id is null then
    raise exception 'League not found';
  end if;
  if l.draft_status <> 'in_progress' then
    raise exception 'This league''s draft is not in progress';
  end if;

  is_commish := public.is_league_commissioner(target_league);

  -- Serializes concurrent picks for the same pick number.
  select * into state from public.draft_state
  where league_id = target_league for update;

  if state.league_id is null then
    raise exception 'Draft state is missing; restart the draft';
  end if;
  if state.paused then
    raise exception 'The draft is paused';
  end if;

  expected_slot := public.slot_for_pick(state.current_pick, l.size);
  select id into expected_member
  from public.league_members
  where league_id = target_league and draft_slot = expected_slot;

  acting_member := coalesce(for_member, expected_member);

  if acting_member <> expected_member then
    raise exception 'It is not that player''s turn';
  end if;

  if not is_commish then
    if not exists (
      select 1 from public.league_members
      where id = acting_member and profile_id = auth.uid()
    ) then
      raise exception 'It is not your turn';
    end if;
  end if;

  if exists (select 1 from public.draft_picks
             where league_id = target_league and team_id = team) then
    raise exception 'That team is already drafted in this league';
  end if;

  insert into public.draft_picks (league_id, member_id, pick_number, round, team_id)
  values (target_league, acting_member, state.current_pick,
          public.round_for_pick(state.current_pick, l.size), team)
  returning * into new_pick;

  next_pick := state.current_pick + 1;
  if next_pick > total_picks then
    update public.leagues set draft_status = 'complete' where id = target_league;
    update public.draft_state
    set current_pick = next_pick, on_the_clock_member_id = null,
        pick_deadline = null, updated_at = now()
    where league_id = target_league;
  else
    select id into next_member
    from public.league_members
    where league_id = target_league
      and draft_slot = public.slot_for_pick(next_pick, l.size);

    update public.draft_state
    set current_pick = next_pick,
        on_the_clock_member_id = next_member,
        pick_deadline = case when l.draft_mode = 'live'
                             then now() + make_interval(secs => coalesce(l.pick_seconds, 90))
                             else null end,
        updated_at = now()
    where league_id = target_league;
  end if;

  return new_pick;
end;
$$;

grant execute on function public.make_pick(uuid, text, uuid) to authenticated;

grant execute on function public.pause_draft(uuid) to authenticated;
grant execute on function public.resume_draft(uuid) to authenticated;
grant execute on function public.set_pick_seconds(uuid, int) to authenticated;
grant execute on function public.best_available_team(uuid) to authenticated;
grant execute on function public.autopick_if_expired(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Clients subscribe to these tables; RLS still applies to what they receive,
-- so a member only ever sees changes for leagues they belong to.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.draft_picks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.draft_state;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.leagues;
  exception when duplicate_object then null;
  end;
end $$;

-- Realtime needs the full old row to route deletes/updates against RLS.
alter table public.draft_picks replica identity full;
alter table public.draft_state replica identity full;
