-- 0009_autopick_valuation.sql
-- best_available_team() previously picked off a hardcoded static ranking
-- list (last preseason's power rankings, frozen in code). Replace it with a
-- real data-driven valuation: win totals + devigged championship odds fit
-- into a single points figure, ported from the NFL Bruball draft-engine
-- spec's model (see src/lib/valuation.ts — this table is that model's output
-- for the 2026-27 season, computed offline and frozen here).
--
-- Division-lock and availability filtering are unchanged from 0008; only the
-- ordering changes (points desc instead of a fixed array position). A team
-- missing a valuation row still gets picked (falls to the back via
-- coalesce(...,-1)) rather than becoming unpickable, so this never makes a
-- previously-legal autopick fail.

-- ---------------------------------------------------------------------------
-- 1. Valuation reference data, frozen per season. Recompute and reseed here
--    (a new migration) each year rather than mutating in place.
-- ---------------------------------------------------------------------------
create table if not exists public.nba_team_valuations (
  team_id     text primary key,
  season      int not null,
  points      numeric not null,
  title_pct   numeric not null,
  computed_at timestamptz not null default now()
);

alter table public.nba_team_valuations enable row level security;
drop policy if exists "team valuations readable" on public.nba_team_valuations;
create policy "team valuations readable"
  on public.nba_team_valuations for select
  using (auth.role() = 'authenticated');

insert into public.nba_team_valuations (team_id, season, points, title_pct) values
  ('oklahoma-city-thunder', 2026, 76.386, 0.22353),
  ('san-antonio-spurs', 2026, 75.386, 0.22353),
  ('new-york-knicks', 2026, 59.984, 0.08271),
  ('philadelphia-76ers', 2026, 57.984, 0.08271),
  ('boston-celtics', 2026, 57.335, 0.05908),
  ('denver-nuggets', 2026, 53.220, 0.03181),
  ('detroit-pistons', 2026, 53.220, 0.03181),
  ('minnesota-timberwolves', 2026, 52.220, 0.03181),
  ('cleveland-cavaliers', 2026, 51.220, 0.03181),
  ('houston-rockets', 2026, 49.803, 0.01622),
  ('miami-heat', 2026, 49.779, 0.02668),
  ('los-angeles-lakers', 2026, 49.447, 0.02297),
  ('toronto-raptors', 2026, 49.220, 0.03181),
  ('indiana-pacers', 2026, 47.187, 0.02017),
  ('atlanta-hawks', 2026, 45.327, 0.01165),
  ('orlando-magic', 2026, 45.168, 0.01021),
  ('portland-trail-blazers', 2026, 45.168, 0.01021),
  ('golden-state-warriors', 2026, 42.531, 0.01356),
  ('phoenix-suns', 2026, 39.765, 0.00684),
  ('charlotte-hornets', 2026, 38.932, 0.00819),
  ('washington-wizards', 2026, 36.588, 0.00548),
  ('utah-jazz', 2026, 36.396, 0.00411),
  ('dallas-mavericks', 2026, 35.462, 0.00457),
  ('la-clippers', 2026, 30.989, 0.00165),
  ('memphis-grizzlies', 2026, 28.811, 0.00083),
  ('new-orleans-pelicans', 2026, 28.066, 0.00206),
  ('chicago-bulls', 2026, 27.892, 0.00118),
  ('milwaukee-bucks', 2026, 26.892, 0.00118),
  ('brooklyn-nets', 2026, 24.811, 0.00083),
  ('sacramento-kings', 2026, 21.811, 0.00083)
on conflict (team_id) do update
  set season = excluded.season,
      points = excluded.points,
      title_pct = excluded.title_pct,
      computed_at = now();

-- ---------------------------------------------------------------------------
-- 2. Autopick: same division/availability filtering as 0008, ordered by
--    valuation points instead of a fixed array.
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
  from public.nba_team_divisions t
  left join public.nba_team_valuations v on v.team_id = t.team_id
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
      where p2.league_id = target_league
        and p2.member_id = clock_member
        and dh.division = t.division
    )
  )
  order by coalesce(v.points, -1) desc
  limit 1;

  return chosen;
end;
$$;
