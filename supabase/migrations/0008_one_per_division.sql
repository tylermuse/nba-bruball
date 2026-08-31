-- 0008_one_per_division.sql
-- Rule: in a 5-player league (6 teams each), every player drafts exactly one
-- team from each of the NBA's 6 divisions. Enforced server-side in make_pick
-- and in autopick, so a picker (or an absent player's autopick) can never end
-- up with two teams from the same division.

-- ---------------------------------------------------------------------------
-- 1. Division reference data (the DB stores team_id as a bare slug).
-- ---------------------------------------------------------------------------
create table if not exists public.nba_team_divisions (
  team_id  text primary key,
  division text not null
);

insert into public.nba_team_divisions (team_id, division) values
  ('boston-celtics','Atlantic'),
  ('brooklyn-nets','Atlantic'),
  ('new-york-knicks','Atlantic'),
  ('philadelphia-76ers','Atlantic'),
  ('toronto-raptors','Atlantic'),
  ('chicago-bulls','Central'),
  ('cleveland-cavaliers','Central'),
  ('detroit-pistons','Central'),
  ('indiana-pacers','Central'),
  ('milwaukee-bucks','Central'),
  ('atlanta-hawks','Southeast'),
  ('charlotte-hornets','Southeast'),
  ('miami-heat','Southeast'),
  ('orlando-magic','Southeast'),
  ('washington-wizards','Southeast'),
  ('denver-nuggets','Northwest'),
  ('minnesota-timberwolves','Northwest'),
  ('oklahoma-city-thunder','Northwest'),
  ('portland-trail-blazers','Northwest'),
  ('utah-jazz','Northwest'),
  ('golden-state-warriors','Pacific'),
  ('la-clippers','Pacific'),
  ('los-angeles-lakers','Pacific'),
  ('phoenix-suns','Pacific'),
  ('sacramento-kings','Pacific'),
  ('dallas-mavericks','Southwest'),
  ('houston-rockets','Southwest'),
  ('memphis-grizzlies','Southwest'),
  ('new-orleans-pelicans','Southwest'),
  ('san-antonio-spurs','Southwest')
on conflict (team_id) do update set division = excluded.division;

-- Readable by any authenticated user (it is public reference data).
alter table public.nba_team_divisions enable row level security;
drop policy if exists "team divisions readable" on public.nba_team_divisions;
create policy "team divisions readable"
  on public.nba_team_divisions for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. make_pick_internal: reject a second team from a division (5-player only).
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

  -- One team per division. 5-player leagues (6 teams each) cover all 6
  -- divisions exactly; only enforce there so the constraint always divides.
  if l.size = 5 then
    if exists (
      select 1
      from public.draft_picks p
      join public.nba_team_divisions d_have on d_have.team_id = p.team_id
      join public.nba_team_divisions d_new  on d_new.team_id  = team
      where p.league_id = target_league
        and p.member_id = acting_member
        and d_have.division = d_new.division
    ) then
      raise exception 'You already have a team from that division';
    end if;
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

-- ---------------------------------------------------------------------------
-- 3. Autopick: skip teams in a division the on-the-clock player already owns.
-- ---------------------------------------------------------------------------
create or replace function public.best_available_team(target_league uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen text;
  lsize int;
  clock_member uuid;
begin
  if not public.is_league_member(target_league) then
    return null;
  end if;

  select size into lsize from public.leagues where id = target_league;
  select on_the_clock_member_id into clock_member
  from public.draft_state where league_id = target_league;

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
  and (
    lsize is distinct from 5
    or clock_member is null
    or not exists (
      select 1
      from public.draft_picks p2
      join public.nba_team_divisions dh on dh.team_id = p2.team_id
      join public.nba_team_divisions dn on dn.team_id = t.team_id
      where p2.league_id = target_league
        and p2.member_id = clock_member
        and dh.division = dn.division
    )
  )
  limit 1;

  return chosen;
end;
$$;
