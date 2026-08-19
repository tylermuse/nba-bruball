-- NBA Bruball — core schema, RLS, and league RPCs.
--
-- Design notes:
--  * Every league-scoped table is isolated by RLS. A user can only see rows for
--    leagues they belong to.
--  * Membership checks live in SECURITY DEFINER helper functions. Calling them
--    from policies avoids the classic "policy on league_members queries
--    league_members" infinite recursion.
--  * Creating and joining leagues go through SECURITY DEFINER RPCs so we never
--    have to expose a blanket SELECT on `leagues` just to look up an invite code.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(trim(name)) between 1 and 60),
  commissioner_id uuid not null references auth.users (id) on delete restrict,
  sport           text not null default 'nba' check (sport in ('nba')),
  season_year     int  not null check (season_year between 2020 and 2100),
  size            int  not null check (size in (5, 6)),
  draft_mode      text not null default 'async' check (draft_mode in ('async', 'live')),
  draft_status    text not null default 'pending'
                    check (draft_status in ('pending', 'in_progress', 'complete')),
  scoring_config  jsonb not null default '{
    "winPoints": 1,
    "seriesPoints": {
      "playIn": 0,
      "firstRound": 4,
      "confSemifinals": 7,
      "confFinals": 11,
      "finals": 16
    }
  }'::jsonb,
  invite_code     text not null unique,
  created_at      timestamptz not null default now()
);

create table if not exists public.league_members (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('commissioner', 'member')),
  display_name text not null default '',
  -- Null until the commissioner sets the draft order.
  draft_slot   int,
  joined_at    timestamptz not null default now(),
  unique (league_id, user_id),
  unique (league_id, draft_slot)
);

create table if not exists public.draft_picks (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues (id) on delete cascade,
  member_id   uuid not null references public.league_members (id) on delete cascade,
  pick_number int  not null check (pick_number between 1 and 30),
  round       int  not null check (round between 1 and 6),
  team_id     text not null,
  created_at  timestamptz not null default now(),
  -- A team can only be drafted once per league, and each pick slot filled once.
  unique (league_id, team_id),
  unique (league_id, pick_number)
);

create index if not exists league_members_user_idx on public.league_members (user_id);
create index if not exists league_members_league_idx on public.league_members (league_id);
create index if not exists draft_picks_league_idx on public.draft_picks (league_id);

-- ---------------------------------------------------------------------------
-- Profile bootstrap: every auth user gets a profile row.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER → bypass RLS → no policy recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_league_member(target_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = target_league and user_id = auth.uid()
  );
$$;

create or replace function public.is_league_commissioner(target_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = target_league
      and user_id = auth.uid()
      and role = 'commissioner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.draft_picks    enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

-- You can see the profile of anyone who shares a league with you.
drop policy if exists "profiles: read leaguemates" on public.profiles;
create policy "profiles: read leaguemates"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.league_members mine
      join public.league_members theirs on theirs.league_id = mine.league_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- leagues -------------------------------------------------------------------
drop policy if exists "leagues: read as member" on public.leagues;
create policy "leagues: read as member"
  on public.leagues for select
  using (public.is_league_member(id));

drop policy if exists "leagues: commissioner updates" on public.leagues;
create policy "leagues: commissioner updates"
  on public.leagues for update
  using (public.is_league_commissioner(id))
  with check (public.is_league_commissioner(id));

drop policy if exists "leagues: commissioner deletes" on public.leagues;
create policy "leagues: commissioner deletes"
  on public.leagues for delete
  using (commissioner_id = auth.uid());

-- Note: INSERT is intentionally omitted. Leagues are created through the
-- create_league() RPC so the league and its commissioner membership are
-- written atomically.

-- league_members ------------------------------------------------------------
drop policy if exists "members: read within league" on public.league_members;
create policy "members: read within league"
  on public.league_members for select
  using (public.is_league_member(league_id));

drop policy if exists "members: commissioner manages" on public.league_members;
create policy "members: commissioner manages"
  on public.league_members for update
  using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));

-- Deliberately NO self-update policy here. Postgres RLS can't restrict which
-- columns a policy may touch, so "members can update their own row" would also
-- let a member set role = 'commissioner' or pick their own draft_slot. Members
-- rename themselves through set_my_display_name() instead.

-- Leaving a league, or a commissioner removing someone.
drop policy if exists "members: leave or be removed" on public.league_members;
create policy "members: leave or be removed"
  on public.league_members for delete
  using (user_id = auth.uid() or public.is_league_commissioner(league_id));

-- draft_picks ---------------------------------------------------------------
drop policy if exists "picks: read within league" on public.draft_picks;
create policy "picks: read within league"
  on public.draft_picks for select
  using (public.is_league_member(league_id));

-- Phase 3 refines this to enforce turn order. For now the commissioner enters
-- picks (async mode), which the plan calls out as the first milestone.
drop policy if exists "picks: commissioner writes" on public.draft_picks;
create policy "picks: commissioner writes"
  on public.draft_picks for insert
  with check (public.is_league_commissioner(league_id));

drop policy if exists "picks: commissioner edits" on public.draft_picks;
create policy "picks: commissioner edits"
  on public.draft_picks for update
  using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));

drop policy if exists "picks: commissioner removes" on public.draft_picks;
create policy "picks: commissioner removes"
  on public.draft_picks for delete
  using (public.is_league_commissioner(league_id));

-- ---------------------------------------------------------------------------
-- Invite codes
-- ---------------------------------------------------------------------------

-- Unambiguous alphabet: no O/0, I/1, so codes are easy to read aloud.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.leagues where invite_code = result);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_league(
  league_name  text,
  league_size  int,
  season       int,
  mode         text default 'async',
  commissioner_display_name text default ''
)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  new_league public.leagues;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if league_size not in (5, 6) then
    raise exception 'League size must be 5 or 6';
  end if;
  if mode not in ('async', 'live') then
    raise exception 'Draft mode must be async or live';
  end if;

  insert into public.leagues (name, commissioner_id, season_year, size, draft_mode, invite_code)
  values (trim(league_name), uid, season, league_size, mode, public.generate_invite_code())
  returning * into new_league;

  insert into public.league_members (league_id, user_id, role, display_name, draft_slot)
  values (
    new_league.id,
    uid,
    'commissioner',
    coalesce(nullif(trim(commissioner_display_name), ''),
             (select display_name from public.profiles where id = uid),
             ''),
    1
  );

  return new_league;
end;
$$;

create or replace function public.join_league_by_code(
  code text,
  member_display_name text default ''
)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.leagues;
  uid uuid := auth.uid();
  member_count int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into target
  from public.leagues
  where invite_code = upper(trim(code));

  if target.id is null then
    raise exception 'No league found for that invite code';
  end if;

  -- Already a member? Just hand back the league so the UI can switch to it.
  if exists (
    select 1 from public.league_members
    where league_id = target.id and user_id = uid
  ) then
    return target;
  end if;

  if target.draft_status <> 'pending' then
    raise exception 'That league has already started its draft';
  end if;

  select count(*) into member_count
  from public.league_members
  where league_id = target.id;

  if member_count >= target.size then
    raise exception 'That league is full';
  end if;

  insert into public.league_members (league_id, user_id, role, display_name)
  values (
    target.id,
    uid,
    'member',
    coalesce(nullif(trim(member_display_name), ''),
             (select display_name from public.profiles where id = uid),
             '')
  );

  return target;
end;
$$;

-- Preview a league from an invite code WITHOUT joining, so the join screen can
-- show what you're about to join. Deliberately returns only public-safe fields.
create or replace function public.peek_league_by_code(code text)
returns table (
  id uuid,
  name text,
  season_year int,
  size int,
  member_count bigint,
  draft_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select l.id, l.name, l.season_year, l.size,
         (select count(*) from public.league_members m where m.league_id = l.id),
         l.draft_status
  from public.leagues l
  where l.invite_code = upper(trim(code));
$$;

-- Every league the caller belongs to, with their role — powers the switcher.
create or replace function public.my_leagues()
returns table (
  id uuid,
  name text,
  season_year int,
  size int,
  draft_mode text,
  draft_status text,
  invite_code text,
  scoring_config jsonb,
  role text,
  member_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select l.id, l.name, l.season_year, l.size, l.draft_mode, l.draft_status,
         l.invite_code, l.scoring_config, m.role,
         (select count(*) from public.league_members x where x.league_id = l.id)
  from public.leagues l
  join public.league_members m on m.league_id = l.id
  where m.user_id = auth.uid()
  order by l.created_at desc;
$$;

-- Members rename themselves here rather than via a direct UPDATE, so they can
-- never touch role or draft_slot.
create or replace function public.set_my_display_name(
  target_league uuid,
  new_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.league_members
  set display_name = trim(new_name)
  where league_id = target_league and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of that league';
  end if;
end;
$$;

-- Commissioner sets the snake order. Takes member ids in slot order, so slot
-- assignment is atomic — no transient uniqueness violations.
create or replace function public.set_draft_order(
  target_league uuid,
  member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  league_size int;
  i int;
begin
  if not public.is_league_commissioner(target_league) then
    raise exception 'Only the commissioner can set the draft order';
  end if;

  select size into league_size from public.leagues where id = target_league;

  if (select draft_status from public.leagues where id = target_league) <> 'pending' then
    raise exception 'The draft has already started';
  end if;

  if array_length(member_ids, 1) is distinct from league_size then
    raise exception 'Expected % members in the draft order, got %',
      league_size, coalesce(array_length(member_ids, 1), 0);
  end if;

  if exists (
    select 1 from unnest(member_ids) as m(id)
    where not exists (
      select 1 from public.league_members lm
      where lm.id = m.id and lm.league_id = target_league
    )
  ) then
    raise exception 'Draft order contains someone who is not in this league';
  end if;

  -- Clear first so the (league_id, draft_slot) unique constraint can't trip
  -- while slots are being shuffled.
  update public.league_members
  set draft_slot = null
  where league_id = target_league;

  for i in 1 .. array_length(member_ids, 1) loop
    update public.league_members
    set draft_slot = i
    where id = member_ids[i] and league_id = target_league;
  end loop;
end;
$$;

-- Guard: league settings that change the shape of the draft are frozen once
-- the draft is underway.
create or replace function public.guard_league_settings()
returns trigger
language plpgsql
as $$
begin
  if old.draft_status <> 'pending' then
    if new.size is distinct from old.size then
      raise exception 'Cannot change league size after the draft has started';
    end if;
    if new.season_year is distinct from old.season_year then
      raise exception 'Cannot change season after the draft has started';
    end if;
  end if;
  -- The invite code is system-generated; never client-editable.
  new.invite_code := old.invite_code;
  return new;
end;
$$;

drop trigger if exists leagues_guard_settings on public.leagues;
create trigger leagues_guard_settings
  before update on public.leagues
  for each row execute function public.guard_league_settings();

-- Guard: a draft pick must belong to the same league as its member, and the
-- team must be a real NBA team id.
create or replace function public.guard_draft_pick()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  member_league uuid;
begin
  select league_id into member_league
  from public.league_members
  where id = new.member_id;

  if member_league is distinct from new.league_id then
    raise exception 'That member does not belong to this league';
  end if;

  return new;
end;
$$;

drop trigger if exists draft_picks_guard on public.draft_picks;
create trigger draft_picks_guard
  before insert or update on public.draft_picks
  for each row execute function public.guard_draft_pick();

grant execute on function public.create_league(text, int, int, text, text) to authenticated;
grant execute on function public.join_league_by_code(text, text) to authenticated;
grant execute on function public.peek_league_by_code(text) to authenticated;
grant execute on function public.my_leagues() to authenticated;
grant execute on function public.set_my_display_name(uuid, text) to authenticated;
grant execute on function public.set_draft_order(uuid, uuid[]) to authenticated;
