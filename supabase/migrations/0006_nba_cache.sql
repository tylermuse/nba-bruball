-- Nightly NBA snapshot.
--
-- Previously every page load hit ESPN's public API directly, which put an
-- unofficial third-party service in the critical path of the leaderboard: if it
-- rate-limits, slows down, or changes shape, everyone's scores break at once.
-- Standings only change once a day, so a nightly job writes one snapshot here
-- and the app reads from Postgres instead.

create table if not exists public.nba_season_cache (
  season      int primary key,
  standings   jsonb not null default '{}'::jsonb,
  playoffs    jsonb not null default '{}'::jsonb,
  source      text  not null default 'espn',
  team_count  int   not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.nba_season_cache enable row level security;

-- NBA results are public facts, and every signed-in user needs them to see a
-- leaderboard. Writes are service-role only (the cron job) — there is
-- deliberately no INSERT/UPDATE policy, so RLS denies writes to normal clients.
drop policy if exists "nba cache: readable" on public.nba_season_cache;
create policy "nba cache: readable"
  on public.nba_season_cache for select
  using (auth.uid() is not null);

grant select on public.nba_season_cache to authenticated;

-- Convenience read used by the client.
create or replace function public.nba_season(target_season int)
returns table (
  season int,
  standings jsonb,
  playoffs jsonb,
  source text,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select c.season, c.standings, c.playoffs, c.source, c.updated_at
  from public.nba_season_cache c
  where c.season = target_season
    and auth.uid() is not null;
$$;

grant execute on function public.nba_season(int) to authenticated;
