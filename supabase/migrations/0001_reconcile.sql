-- NBA Bruball — reconcile an existing schema, then layer on RLS + RPCs.
--
-- This database already had NBA tables from an earlier pass:
--   profiles(id, display_name, avatar_url, created_at)
--   leagues(id, name, sport, season, size, commissioner_id, draft_mode,
--           draft_status, scoring_config, invite_code, created_at, pick_seconds)
--   league_members(id, league_id, profile_id, role, team_name, draft_slot, joined_at)
--   draft_picks(id, league_id, pick_number, round, member_id, team_id, created_at)
--   draft_state(league_id, current_pick, pick_deadline, on_the_clock_member_id, updated_at)
--
-- We keep those column names (notably profile_id, season, team_name) and add
-- only what's missing. Safe to re-run: every step is guarded.
--
-- Design notes:
--  * Membership checks live in SECURITY DEFINER helpers so a policy on
--    league_members never queries league_members through RLS (infinite recursion).
--  * Creating and joining leagues go through SECURITY DEFINER RPCs, so looking
--    up an invite code never requires a blanket SELECT on "leagues".

-- ---------------------------------------------------------------------------
-- 0. Tables — create only if this is a fresh database.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  sport           text not null default 'nba',
  season          int  not null,
  size            int  not null,
  commissioner_id uuid not null references auth.users (id) on delete restrict,
  draft_mode      text not null default 'async',
  draft_status    text not null default 'pending',
  scoring_config  jsonb not null default '{}'::jsonb,
  invite_code     text not null,
  created_at      timestamptz not null default now(),
  pick_seconds    int not null default 90
);

create table if not exists public.league_members (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member',
  team_name  text not null default '',
  draft_slot int,
  joined_at  timestamptz not null default now()
);

create table if not exists public.draft_picks (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues (id) on delete cascade,
  member_id   uuid not null references public.league_members (id) on delete cascade,
  pick_number int not null,
  round       int not null,
  team_id     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.draft_state (
  league_id              uuid primary key references public.leagues (id) on delete cascade,
  current_pick           int not null default 1,
  pick_deadline          timestamptz,
  on_the_clock_member_id uuid references public.league_members (id) on delete set null,
  updated_at             timestamptz not null default now()
);

-- Columns that may be missing on an older copy of the schema.
alter table public.leagues        add column if not exists scoring_config jsonb not null default '{}'::jsonb;
alter table public.leagues        add column if not exists pick_seconds   int not null default 90;
alter table public.league_members add column if not exists draft_slot     int;

-- ---------------------------------------------------------------------------
-- 1. Defaults + data normalization
-- ---------------------------------------------------------------------------

alter table public.leagues
  alter column scoring_config set default '{
    "winPoints": 1,
    "seriesPoints": {
      "playIn": 0,
      "firstRound": 4,
      "confSemifinals": 7,
      "confFinals": 11,
      "finals": 16
    }
  }'::jsonb;

-- Backfill any league created before scoring was configurable.
update public.leagues
set scoring_config = '{
  "winPoints": 1,
  "seriesPoints": {
    "playIn": 0,
    "firstRound": 4,
    "confSemifinals": 7,
    "confFinals": 11,
    "finals": 16
  }
}'::jsonb
where scoring_config is null
   or not (scoring_config ? 'seriesPoints');

-- Existing auth users predate the profile trigger below; give them a profile.
insert into public.profiles (id, display_name)
select u.id, coalesce(split_part(u.email, '@', 1), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------------------------------------------------------------------------
-- 2. Constraints — added defensively so pre-existing rows can't block the run.
-- ---------------------------------------------------------------------------

do $$
begin
  -- A person joins a league once.
  if not exists (select 1 from pg_constraint where conname = 'league_members_league_profile_key') then
    begin
      alter table public.league_members
        add constraint league_members_league_profile_key unique (league_id, profile_id);
    exception when others then
      raise notice 'Skipped league_members_league_profile_key: %', sqlerrm;
    end;
  end if;

  -- One member per draft slot.
  if not exists (select 1 from pg_constraint where conname = 'league_members_league_slot_key') then
    begin
      alter table public.league_members
        add constraint league_members_league_slot_key unique (league_id, draft_slot);
    exception when others then
      raise notice 'Skipped league_members_league_slot_key: %', sqlerrm;
    end;
  end if;

  -- THE off-the-board guarantee: a team can only be drafted once per league.
  if not exists (select 1 from pg_constraint where conname = 'draft_picks_league_team_key') then
    begin
      alter table public.draft_picks
        add constraint draft_picks_league_team_key unique (league_id, team_id);
    exception when others then
      raise notice 'Skipped draft_picks_league_team_key: %', sqlerrm;
    end;
  end if;

  -- Each pick slot filled once.
  if not exists (select 1 from pg_constraint where conname = 'draft_picks_league_pick_key') then
    begin
      alter table public.draft_picks
        add constraint draft_picks_league_pick_key unique (league_id, pick_number);
    exception when others then
      raise notice 'Skipped draft_picks_league_pick_key: %', sqlerrm;
    end;
  end if;

  -- Invite codes must be unique to be usable as a lookup key.
  if not exists (select 1 from pg_constraint where conname = 'leagues_invite_code_key') then
    begin
      alter table public.leagues add constraint leagues_invite_code_key unique (invite_code);
    exception when others then
      raise notice 'Skipped leagues_invite_code_key: %', sqlerrm;
    end;
  end if;

  -- Value checks. NOT VALID so a stray legacy row can't block the migration;
  -- they still apply to every future insert and update.
  if not exists (select 1 from pg_constraint where conname = 'leagues_size_check2') then
    begin
      alter table public.leagues
        add constraint leagues_size_check2 check (size in (5, 6)) not valid;
    exception when others then
      raise notice 'Skipped leagues_size_check2: %', sqlerrm;
    end;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leagues_draft_mode_check2') then
    begin
      alter table public.leagues
        add constraint leagues_draft_mode_check2 check (draft_mode in ('async', 'live')) not valid;
    exception when others then
      raise notice 'Skipped leagues_draft_mode_check2: %', sqlerrm;
    end;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leagues_draft_status_check2') then
    begin
      alter table public.leagues
        add constraint leagues_draft_status_check2
        check (draft_status in ('pending', 'in_progress', 'complete')) not valid;
    exception when others then
      raise notice 'Skipped leagues_draft_status_check2: %', sqlerrm;
    end;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'league_members_role_check2') then
    begin
      alter table public.league_members
        add constraint league_members_role_check2
        check (role in ('commissioner', 'member')) not valid;
    exception when others then
      raise notice 'Skipped league_members_role_check2: %', sqlerrm;
    end;
  end if;
end $$;

create index if not exists league_members_profile_idx on public.league_members (profile_id);
create index if not exists league_members_league_idx  on public.league_members (league_id);
create index if not exists draft_picks_league_idx     on public.draft_picks (league_id);

-- ---------------------------------------------------------------------------
-- 2b. Drop prior versions of our functions.
--
-- "create or replace function" cannot rename a parameter or change a return
-- type, and the earlier schema declared some of these differently (e.g.
-- is_league_member(_league uuid) vs is_league_member(target_league uuid)).
-- Drop by actual signature so this runs no matter how they were defined.
--
-- CASCADE also removes policies and triggers that depend on them; every one is
-- recreated below.
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
        'is_league_member',
        'is_league_commissioner',
        'create_league',
        'join_league_by_code',
        'peek_league_by_code',
        'my_leagues',
        'set_my_team_name',
        'set_my_display_name',
        'set_draft_order',
        'generate_invite_code',
        'handle_new_user',
        'guard_league_settings',
        'guard_draft_pick'
      )
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Profile bootstrap for new signups
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
-- 4. Membership helpers (SECURITY DEFINER → bypass RLS → no policy recursion)
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
    where league_id = target_league and profile_id = auth.uid()
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
      and profile_id = auth.uid()
      and role = 'commissioner'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.draft_picks    enable row level security;
alter table public.draft_state    enable row level security;

-- Clear ALL pre-existing policies on these tables. Postgres OR's permissive
-- policies together, so a leftover policy from the old schema could silently
-- widen access beyond what's defined below.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'leagues', 'league_members', 'draft_picks', 'draft_state')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles ------------------------------------------------------------------
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

-- You can see the profile of anyone who shares a league with you.
create policy "profiles: read leaguemates"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.league_members mine
      join public.league_members theirs on theirs.league_id = mine.league_id
      where mine.profile_id = auth.uid()
        and theirs.profile_id = profiles.id
    )
  );

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- leagues -------------------------------------------------------------------
create policy "leagues: read as member"
  on public.leagues for select
  using (public.is_league_member(id));

create policy "leagues: commissioner updates"
  on public.leagues for update
  using (public.is_league_commissioner(id))
  with check (public.is_league_commissioner(id));

create policy "leagues: commissioner deletes"
  on public.leagues for delete
  using (commissioner_id = auth.uid());

-- No INSERT policy: leagues are created via create_league() so the league and
-- its commissioner membership are written atomically.

-- league_members ------------------------------------------------------------
create policy "members: read within league"
  on public.league_members for select
  using (public.is_league_member(league_id));

create policy "members: commissioner manages"
  on public.league_members for update
  using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));

-- Deliberately NO self-update policy. Postgres RLS can't restrict which
-- columns a policy may touch, so "members can update their own row" would also
-- let a member set role = 'commissioner' or choose their own draft_slot.
-- Members rename their team through set_my_team_name() instead.

create policy "members: leave or be removed"
  on public.league_members for delete
  using (profile_id = auth.uid() or public.is_league_commissioner(league_id));

-- draft_picks ---------------------------------------------------------------
create policy "picks: read within league"
  on public.draft_picks for select
  using (public.is_league_member(league_id));

-- Phase 3 is async/commissioner-entry drafting. Phase 5 adds on-the-clock
-- self-picking on top of this.
create policy "picks: commissioner writes"
  on public.draft_picks for insert
  with check (public.is_league_commissioner(league_id));

create policy "picks: commissioner edits"
  on public.draft_picks for update
  using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));

create policy "picks: commissioner removes"
  on public.draft_picks for delete
  using (public.is_league_commissioner(league_id));

-- draft_state ---------------------------------------------------------------
create policy "draft state: read within league"
  on public.draft_state for select
  using (public.is_league_member(league_id));

create policy "draft state: commissioner writes"
  on public.draft_state for insert
  with check (public.is_league_commissioner(league_id));

create policy "draft state: commissioner updates"
  on public.draft_state for update
  using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));

-- ---------------------------------------------------------------------------
-- 6. Guards
-- ---------------------------------------------------------------------------

create or replace function public.guard_league_settings()
returns trigger
language plpgsql
as $$
begin
  if old.draft_status <> 'pending' then
    if new.size is distinct from old.size then
      raise exception 'Cannot change league size after the draft has started';
    end if;
    if new.season is distinct from old.season then
      raise exception 'Cannot change season after the draft has started';
    end if;
  end if;
  -- Invite codes are system-generated; never client-editable.
  new.invite_code := old.invite_code;
  return new;
end;
$$;

drop trigger if exists leagues_guard_settings on public.leagues;
create trigger leagues_guard_settings
  before update on public.leagues
  for each row execute function public.guard_league_settings();

-- A pick must belong to the same league as the member making it.
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

-- ---------------------------------------------------------------------------
-- 7. Invite codes
-- ---------------------------------------------------------------------------

-- Unambiguous alphabet: no O/0 or I/1, so codes are easy to read aloud.
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
-- 8. RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_league(
  league_name text,
  league_size int,
  season_year int,
  mode text default 'async',
  commissioner_team_name text default ''
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
  if char_length(trim(league_name)) = 0 then
    raise exception 'League name is required';
  end if;

  insert into public.leagues (name, commissioner_id, season, size, draft_mode, invite_code)
  values (trim(league_name), uid, season_year, league_size, mode,
          public.generate_invite_code())
  returning * into new_league;

  insert into public.league_members (league_id, profile_id, role, team_name, draft_slot)
  values (
    new_league.id,
    uid,
    'commissioner',
    coalesce(nullif(trim(commissioner_team_name), ''),
             (select display_name from public.profiles where id = uid),
             ''),
    1
  );

  return new_league;
end;
$$;

create or replace function public.join_league_by_code(
  code text,
  member_team_name text default ''
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

  -- Already a member? Hand back the league so the UI can just switch to it.
  if exists (
    select 1 from public.league_members
    where league_id = target.id and profile_id = uid
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

  insert into public.league_members (league_id, profile_id, role, team_name)
  values (
    target.id,
    uid,
    'member',
    coalesce(nullif(trim(member_team_name), ''),
             (select display_name from public.profiles where id = uid),
             '')
  );

  return target;
end;
$$;

-- Preview a league from an invite code WITHOUT joining, so the join screen can
-- show what you're about to join. Returns only public-safe fields.
create or replace function public.peek_league_by_code(code text)
returns table (
  id uuid,
  name text,
  season int,
  size int,
  member_count bigint,
  draft_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select l.id, l.name, l.season, l.size,
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
  season int,
  size int,
  draft_mode text,
  draft_status text,
  invite_code text,
  scoring_config jsonb,
  pick_seconds int,
  role text,
  member_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select l.id, l.name, l.season, l.size, l.draft_mode, l.draft_status,
         l.invite_code, l.scoring_config, l.pick_seconds, m.role,
         (select count(*) from public.league_members x where x.league_id = l.id)
  from public.leagues l
  join public.league_members m on m.league_id = l.id
  where m.profile_id = auth.uid()
  order by l.created_at desc;
$$;

-- Members rename their team here rather than via a direct UPDATE, so they can
-- never touch role or draft_slot.
create or replace function public.set_my_team_name(
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
  set team_name = trim(new_name)
  where league_id = target_league and profile_id = auth.uid();

  if not found then
    raise exception 'You are not a member of that league';
  end if;
end;
$$;

-- Commissioner sets the snake order. Takes member ids in slot order; slots are
-- cleared first so the (league_id, draft_slot) unique constraint can't trip
-- midway through the reshuffle.
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

  update public.league_members set draft_slot = null where league_id = target_league;

  for i in 1 .. array_length(member_ids, 1) loop
    update public.league_members
    set draft_slot = i
    where id = member_ids[i] and league_id = target_league;
  end loop;
end;
$$;

grant execute on function public.create_league(text, int, int, text, text) to authenticated;
grant execute on function public.join_league_by_code(text, text) to authenticated;
grant execute on function public.peek_league_by_code(text) to authenticated;
grant execute on function public.my_leagues() to authenticated;
grant execute on function public.set_my_team_name(uuid, text) to authenticated;
grant execute on function public.set_draft_order(uuid, uuid[]) to authenticated;
