-- Security and integrity fixes found in review of Phases 3-5.
--
-- Four real problems, in rough order of severity:
--
--  1. Any member could DELETE their own league_members row mid-draft. Because
--     draft_picks.member_id cascades, that silently returned their drafted NBA
--     teams to the pool and shifted every leaderboard total — a one-request way
--     for a losing drafter to torch a league. They also could not rejoin, since
--     join_league_by_code only admits members while draft_status = 'pending'.
--
--  2. The turn check compared with <>, which yields NULL (not true) when a
--     draft slot is vacant. plpgsql treats a NULL IF as false, so the "not your
--     turn" exception never fired and any member could claim that pick by
--     passing their own member id. Chains directly off (1).
--
--  3. autopick_if_expired was dead for the only case it exists to serve.
--     SECURITY DEFINER does not change auth.uid() — it reads the caller's JWT —
--     so make_pick's identity check rejected any caller who was neither the
--     commissioner nor the AFK member. Verification missed this because the
--     test ran as the commissioner, for whom it happens to work.
--
--  4. team_id was unvalidated free text. 'Boston-Celtics' would not collide
--     with 'boston-celtics', defeating the unique index that is supposed to
--     guarantee each NBA team is drafted exactly once.

-- ---------------------------------------------------------------------------
-- 1. Teams are a real referenced entity, not free text.
-- ---------------------------------------------------------------------------

create table if not exists public.nba_teams (
  team_id text primary key
);

insert into public.nba_teams (team_id)
select unnest(array[
  'atlanta-hawks','boston-celtics','brooklyn-nets','charlotte-hornets','chicago-bulls',
  'cleveland-cavaliers','dallas-mavericks','denver-nuggets','detroit-pistons',
  'golden-state-warriors','houston-rockets','indiana-pacers','la-clippers',
  'los-angeles-lakers','memphis-grizzlies','miami-heat','milwaukee-bucks',
  'minnesota-timberwolves','new-orleans-pelicans','new-york-knicks',
  'oklahoma-city-thunder','orlando-magic','philadelphia-76ers','phoenix-suns',
  'portland-trail-blazers','sacramento-kings','san-antonio-spurs','toronto-raptors',
  'utah-jazz','washington-wizards'
])
on conflict (team_id) do nothing;

alter table public.nba_teams enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='nba_teams' and policyname='teams: readable') then
    create policy "teams: readable" on public.nba_teams for select using (true);
  end if;
end $$;

-- Reject anything that isn't one of the 30 real teams.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'draft_picks_team_fk') then
    begin
      alter table public.draft_picks
        add constraint draft_picks_team_fk
        foreign key (team_id) references public.nba_teams (team_id);
    exception when others then
      raise notice 'Skipped draft_picks_team_fk: %', sqlerrm;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Members cannot walk out of an active draft.
-- ---------------------------------------------------------------------------

drop policy if exists "members: leave or be removed" on public.league_members;
create policy "members: leave or be removed"
  on public.league_members for delete
  using (
    (profile_id = auth.uid() or public.is_league_commissioner(league_id))
    and (select draft_status from public.leagues where id = league_id) = 'pending'
  );

-- ---------------------------------------------------------------------------
-- 3. Split the pick mechanics from the permission check.
--
-- make_pick_internal performs no authorization — it is deliberately NOT granted
-- to authenticated, and is only reachable from the SECURITY DEFINER wrappers
-- below, which each apply their own rules. This is what lets autopick act on
-- behalf of an absent player without handing that power to clients.
-- ---------------------------------------------------------------------------

create or replace function public.make_pick_internal(
  target_league uuid,
  team text,
  acting_member uuid
)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
  state public.draft_state;
  new_pick public.draft_picks;
  next_pick int;
  next_member uuid;
  total_picks constant int := 30;
begin
  select * into l from public.leagues where id = target_league;
  select * into state from public.draft_state where league_id = target_league;

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

revoke all on function public.make_pick_internal(uuid, text, uuid) from public;
revoke all on function public.make_pick_internal(uuid, text, uuid) from authenticated;
revoke all on function public.make_pick_internal(uuid, text, uuid) from anon;

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

  -- Serializes a human click racing the autopick for the same pick number.
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

  -- A vacant slot must halt the draft, not wave everyone through. The old
  -- `<>` comparison against NULL yielded NULL, which plpgsql treats as false.
  if expected_member is null then
    raise exception 'No player holds draft slot % — fix the draft order', expected_slot;
  end if;

  acting_member := coalesce(for_member, expected_member);

  if acting_member is distinct from expected_member then
    raise exception 'It is not that player''s turn';
  end if;

  if not public.is_league_commissioner(target_league) then
    if not exists (
      select 1 from public.league_members
      where id = acting_member and profile_id = auth.uid()
    ) then
      raise exception 'It is not your turn';
    end if;
  end if;

  return public.make_pick_internal(target_league, team, acting_member);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Autopick can now actually act for an absent player.
-- ---------------------------------------------------------------------------

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
begin
  if not public.is_league_member(target_league) then
    return null;
  end if;

  select * into l from public.leagues where id = target_league;
  if l.id is null or l.draft_status <> 'in_progress' or l.draft_mode <> 'live' then
    return null;
  end if;

  -- Lock so concurrent callers serialize; the deadline is re-checked under it.
  select * into state from public.draft_state
  where league_id = target_league for update;

  if state.league_id is null or state.paused then return null; end if;
  if state.pick_deadline is null or state.pick_deadline > now() then return null; end if;
  if state.on_the_clock_member_id is null then return null; end if;

  team := public.best_available_team(target_league);
  if team is null then return null; end if;

  return public.make_pick_internal(target_league, team, state.on_the_clock_member_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Smaller fixes
-- ---------------------------------------------------------------------------

-- Don't leak another league's board to a non-member.
create or replace function public.best_available_team(target_league uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen text;
begin
  if not public.is_league_member(target_league) then
    return null;
  end if;

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

-- One definition of "commissioner", and freeze the fields that decide it.
drop policy if exists "leagues: commissioner deletes" on public.leagues;
create policy "leagues: commissioner deletes"
  on public.leagues for delete
  using (public.is_league_commissioner(id));

create or replace function public.guard_league_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.draft_status <> 'pending' then
    if new.size is distinct from old.size then
      raise exception 'Cannot change league size after the draft has started';
    end if;
    if new.season is distinct from old.season then
      raise exception 'Cannot change season after the draft has started';
    end if;
    -- Rewriting scoring mid-season would silently restate everyone's totals.
    if new.scoring_config is distinct from old.scoring_config then
      raise exception 'Cannot change scoring after the draft has started';
    end if;
  end if;
  -- System-owned columns are never client-editable.
  new.invite_code := old.invite_code;
  new.commissioner_id := old.commissioner_id;
  return new;
end;
$$;

drop trigger if exists leagues_guard_settings on public.leagues;
create trigger leagues_guard_settings
  before update on public.leagues
  for each row execute function public.guard_league_settings();

grant execute on function public.make_pick(uuid, text, uuid) to authenticated;
grant execute on function public.autopick_if_expired(uuid) to authenticated;
grant execute on function public.best_available_team(uuid) to authenticated;
grant select on public.nba_teams to authenticated;
