-- NBA Bruball — snake draft.
--
-- All draft writes go through SECURITY DEFINER RPCs rather than direct table
-- access. The table policies stay commissioner-only; the RPCs decide who may
-- act, which keeps turn-order enforcement in one place and makes the async and
-- live modes share exactly the same rules.
--
-- The "a team is off the board once drafted" guarantee is the unique index on
-- (league_id, team_id) from 0001 — not application logic — so two people
-- racing for the same team can never both win.

-- ---------------------------------------------------------------------------
-- Drop prior versions first.
--
-- This database carried an earlier draft implementation whose functions used
-- different parameter names (start_draft(_league uuid) vs
-- start_draft(target_league uuid)). `create or replace` cannot rename a
-- parameter or change a return type, so drop by actual signature. CASCADE also
-- clears dependent policies/triggers; everything is recreated below.
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'slot_for_pick', 'round_for_pick',
        'start_draft', 'make_pick', 'undo_last_pick', 'undo_pick',
        'reset_draft', 'draft_board', 'league_rosters',
        'advance_draft', 'next_pick', 'current_drafter'
      )
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Snake order, in SQL so the database is the single source of truth.
-- ---------------------------------------------------------------------------

-- Round 1 runs slot 1..N, round 2 runs N..1, and so on.
create or replace function public.slot_for_pick(pick_number int, league_size int)
returns int
language sql
immutable
as $$
  select case
    when (ceil(pick_number::numeric / league_size)::int) % 2 = 0
      then league_size - ((pick_number - 1) % league_size)
    else ((pick_number - 1) % league_size) + 1
  end;
$$;

create or replace function public.round_for_pick(pick_number int, league_size int)
returns int
language sql
immutable
as $$
  select ceil(pick_number::numeric / league_size)::int;
$$;

-- ---------------------------------------------------------------------------
-- Draft lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.start_draft(target_league uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
  member_count int;
  slotted int;
  first_member uuid;
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can start the draft';
  end if;

  select * into l from public.leagues where id = target_league;

  if l.draft_status <> 'pending' then
    raise exception 'The draft has already started';
  end if;

  select count(*), count(draft_slot) into member_count, slotted
  from public.league_members where league_id = target_league;

  if member_count <> l.size then
    raise exception 'Need % players before starting; the league has %',
      l.size, member_count;
  end if;

  if slotted <> l.size then
    raise exception 'Set the draft order before starting';
  end if;

  select id into first_member
  from public.league_members
  where league_id = target_league and draft_slot = 1;

  update public.leagues set draft_status = 'in_progress' where id = target_league;

  insert into public.draft_state (league_id, current_pick, on_the_clock_member_id, pick_deadline, updated_at)
  values (target_league, 1, first_member,
          case when l.draft_mode = 'live'
               then now() + make_interval(secs => coalesce(l.pick_seconds, 90))
               else null end,
          now())
  on conflict (league_id) do update
    set current_pick = 1,
        on_the_clock_member_id = excluded.on_the_clock_member_id,
        pick_deadline = excluded.pick_deadline,
        updated_at = now();
end;
$$;

-- Make a pick. In async mode the commissioner may enter anyone's pick; in both
-- modes the member who is on the clock may pick for themselves.
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

  select * into state from public.draft_state where league_id = target_league;
  if state.league_id is null then
    raise exception 'Draft state is missing; restart the draft';
  end if;

  expected_slot := public.slot_for_pick(state.current_pick, l.size);
  select id into expected_member
  from public.league_members
  where league_id = target_league and draft_slot = expected_slot;

  -- Who is this pick for?
  acting_member := coalesce(for_member, expected_member);

  if acting_member <> expected_member then
    raise exception 'It is not that player''s turn';
  end if;

  -- Permission: commissioner can enter any pick; otherwise it must be you.
  if not is_commish then
    if not exists (
      select 1 from public.league_members
      where id = acting_member and profile_id = auth.uid()
    ) then
      raise exception 'It is not your turn';
    end if;
  end if;

  if not exists (select 1 from public.draft_picks
                 where league_id = target_league and team_id = team) then
    insert into public.draft_picks (league_id, member_id, pick_number, round, team_id)
    values (target_league, acting_member, state.current_pick,
            public.round_for_pick(state.current_pick, l.size), team)
    returning * into new_pick;
  else
    raise exception 'That team is already drafted in this league';
  end if;

  -- Advance the clock.
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

-- Commissioner fixes a mis-entered pick by rolling the last one back.
create or replace function public.undo_last_pick(target_league uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
  last_pick public.draft_picks;
  back_to int;
  back_member uuid;
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can undo a pick';
  end if;

  select * into l from public.leagues where id = target_league;

  select * into last_pick
  from public.draft_picks
  where league_id = target_league
  order by pick_number desc
  limit 1;

  if last_pick.id is null then
    raise exception 'There are no picks to undo';
  end if;

  delete from public.draft_picks where id = last_pick.id;

  back_to := last_pick.pick_number;
  select id into back_member
  from public.league_members
  where league_id = target_league
    and draft_slot = public.slot_for_pick(back_to, l.size);

  -- Undoing after the final pick reopens the draft.
  if l.draft_status = 'complete' then
    update public.leagues set draft_status = 'in_progress' where id = target_league;
  end if;

  update public.draft_state
  set current_pick = back_to,
      on_the_clock_member_id = back_member,
      pick_deadline = case when l.draft_mode = 'live'
                           then now() + make_interval(secs => coalesce(l.pick_seconds, 90))
                           else null end,
      updated_at = now()
  where league_id = target_league;
end;
$$;

create or replace function public.reset_draft(target_league uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can reset the draft';
  end if;

  delete from public.draft_picks where league_id = target_league;
  delete from public.draft_state where league_id = target_league;
  update public.leagues set draft_status = 'pending' where id = target_league;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Everything the draft board needs in one round trip.
create or replace function public.draft_board(target_league uuid)
returns table (
  pick_number int,
  round int,
  member_id uuid,
  team_name text,
  draft_slot int,
  team_id text,
  picked_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select p.pick_number, p.round, p.member_id, m.team_name, m.draft_slot,
         p.team_id, p.created_at
  from public.draft_picks p
  join public.league_members m on m.id = p.member_id
  where p.league_id = target_league
    and public.is_league_member(target_league)
  order by p.pick_number;
$$;

-- Every member's roster, including members who have not picked yet.
create or replace function public.league_rosters(target_league uuid)
returns table (
  member_id uuid,
  profile_id uuid,
  team_name text,
  role text,
  draft_slot int,
  team_ids text[]
)
language sql
security definer
stable
set search_path = public
as $$
  select m.id, m.profile_id, m.team_name, m.role, m.draft_slot,
         coalesce(
           array_agg(p.team_id order by p.pick_number)
             filter (where p.team_id is not null),
           '{}'::text[]
         )
  from public.league_members m
  left join public.draft_picks p on p.member_id = m.id
  where m.league_id = target_league
    and public.is_league_member(target_league)
  group by m.id, m.profile_id, m.team_name, m.role, m.draft_slot
  order by m.draft_slot nulls last, m.joined_at;
$$;

grant execute on function public.slot_for_pick(int, int) to authenticated;
grant execute on function public.round_for_pick(int, int) to authenticated;
grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.make_pick(uuid, text, uuid) to authenticated;
grant execute on function public.undo_last_pick(uuid) to authenticated;
grant execute on function public.reset_draft(uuid) to authenticated;
grant execute on function public.draft_board(uuid) to authenticated;
grant execute on function public.league_rosters(uuid) to authenticated;
