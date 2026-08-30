-- STATUS: applied, but the schedule is DISABLED. See the finding below.
--
-- FINDING (verified against the live database, 2026-08-30):
--   ESPN returns 403 "Access Denied" to requests originating from Supabase's
--   Postgres instance. Confirmed twice — with pg_net's default request, and
--   again with a browser User-Agent and Accept header. So it is not UA
--   sniffing; ESPN is refusing that IP range.
--
--   Everything else here works: pg_net delivers responses, the SQL parsing and
--   the cron schedule are fine. Only the upstream fetch is blocked.
--
--   The job was therefore unscheduled rather than left to fail silently every
--   night:
--       select cron.unschedule('nba-nightly-sync');
--
--   To re-enable, the fetch has to happen somewhere ESPN accepts — pg_cron can
--   still own the SCHEDULE by calling out to that endpoint with net.http_post —
--   or the sync needs a data source that permits server-to-server access.
--
--   Re-enable with:
--       select cron.schedule('nba-nightly-sync', '0 10 * * *',
--                            $$select public.sync_nba_all()$$);

-- Nightly NBA sync, run entirely inside Postgres.
--
-- Replaces the Vercel cron: pg_cron schedules it, pg_net makes the HTTP calls,
-- and the parsing happens in SQL. Nothing to deploy, no service-role key to
-- store outside the database, and the job keeps working regardless of what is
-- (or isn't) deployed on Vercel.
--
-- pg_net is asynchronous — net.http_get queues a request and the response lands
-- in net._http_response later — so nba_http_get polls for it with a timeout
-- rather than assuming an immediate reply.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- ESPN abbreviation → our team id
-- ---------------------------------------------------------------------------

alter table public.nba_teams add column if not exists abbr text;

update public.nba_teams t set abbr = m.abbr
from (values
  ('atlanta-hawks','ATL'),('boston-celtics','BOS'),('brooklyn-nets','BKN'),
  ('charlotte-hornets','CHA'),('chicago-bulls','CHI'),('cleveland-cavaliers','CLE'),
  ('dallas-mavericks','DAL'),('denver-nuggets','DEN'),('detroit-pistons','DET'),
  ('golden-state-warriors','GS'),('houston-rockets','HOU'),('indiana-pacers','IND'),
  ('la-clippers','LAC'),('los-angeles-lakers','LAL'),('memphis-grizzlies','MEM'),
  ('miami-heat','MIA'),('milwaukee-bucks','MIL'),('minnesota-timberwolves','MIN'),
  ('new-orleans-pelicans','NO'),('new-york-knicks','NY'),('oklahoma-city-thunder','OKC'),
  ('orlando-magic','ORL'),('philadelphia-76ers','PHI'),('phoenix-suns','PHX'),
  ('portland-trail-blazers','POR'),('sacramento-kings','SAC'),('san-antonio-spurs','SA'),
  ('toronto-raptors','TOR'),('utah-jazz','UTAH'),('washington-wizards','WSH')
) as m(team_id, abbr)
where t.team_id = m.team_id;

create unique index if not exists nba_teams_abbr_idx on public.nba_teams (abbr);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Mirrors roundFromHeadline() in src/lib/nbaSources.ts. Note the ordering:
-- "NBA Finals" must be checked before the conference-finals pattern, or the
-- championship series would be miscounted as a conference final.
create or replace function public.nba_round_from_headline(h text)
returns text
language sql
immutable
as $$
  select case
    when h is null or h = '' then null
    when lower(h) like '%play-in%' or lower(h) like '%play in%' then 'playIn'
    when lower(h) like '%nba finals%' then 'finals'
    when lower(h) like '%1st round%' or lower(h) like '%first round%' then 'firstRound'
    when lower(h) like '%semifinal%' then 'confSemifinals'
    when lower(h) ~ '(conference finals|(east|west)(ern)? finals)' then 'confFinals'
    else null
  end;
$$;

-- Our season label (starting year) → ESPN's (ending year).
create or replace function public.nba_espn_season(season int)
returns int language sql immutable as $$ select season + 1; $$;

-- Season currently in play, matching getDefaultSeason() in the app: August is
-- the cutover, mid-offseason.
create or replace function public.nba_default_season()
returns int language sql stable as $$
  select case when extract(month from now())::int < 8
              then extract(year from now())::int - 1
              else extract(year from now())::int end;
$$;

/**
 * Synchronous-feeling wrapper over pg_net. Polls net._http_response until the
 * response arrives or the timeout passes, so callers can treat it as a
 * blocking fetch.
 */
create or replace function public.nba_http_get(url text, timeout_ms int default 25000)
returns jsonb
language plpgsql
security definer
set search_path = public, net
as $$
declare
  rid bigint;
  body text;
  code int;
  waited int := 0;
begin
  select net.http_get(url) into rid;

  loop
    select r.content, r.status_code into body, code
    from net._http_response r where r.id = rid;

    exit when body is not null or waited >= timeout_ms;
    perform pg_sleep(0.5);
    waited := waited + 500;
  end loop;

  if body is null or code is null or code >= 400 then
    return null;
  end if;

  begin
    return body::jsonb;
  exception when others then
    return null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sync
-- ---------------------------------------------------------------------------

create or replace function public.sync_nba_season(target_season int)
returns jsonb
language plpgsql
security definer
set search_path = public, net
as $$
declare
  espn int := public.nba_espn_season(target_season);
  raw_standings jsonb;
  raw_playoffs jsonb;
  standings jsonb := '{}'::jsonb;
  playoffs jsonb := '{}'::jsonb;
  team_ct int := 0;
  wins_sum int := 0;
  losses_sum int := 0;
begin
  raw_standings := public.nba_http_get(
    format('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=%s&level=1', espn)
  );
  if raw_standings is null then
    return jsonb_build_object('season', target_season, 'ok', false, 'reason', 'standings fetch failed');
  end if;

  select coalesce(jsonb_object_agg(t.team_id,
           jsonb_build_object('wins', x.w, 'losses', x.l)), '{}'::jsonb)
  into standings
  from (
    select e->'team'->>'abbreviation' as abbr,
           (select (st->>'value')::int from jsonb_array_elements(e->'stats') st
             where st->>'name' = 'wins') as w,
           (select (st->>'value')::int from jsonb_array_elements(e->'stats') st
             where st->>'name' = 'losses') as l
    from jsonb_array_elements(coalesce(raw_standings->'standings'->'entries', '[]'::jsonb)) e
  ) x
  join public.nba_teams t on t.abbr = x.abbr
  where x.w is not null and x.l is not null;

  select count(*), coalesce(sum((v->>'wins')::int), 0), coalesce(sum((v->>'losses')::int), 0)
  into team_ct, wins_sum, losses_sum
  from jsonb_each(standings) as e(k, v);

  -- Same gate as the app: a partial or unbalanced payload must not overwrite a
  -- good snapshot. Every win is someone else's loss.
  if team_ct <> 30 or wins_sum <> losses_sum then
    return jsonb_build_object('season', target_season, 'ok', false,
      'reason', 'implausible standings', 'teams', team_ct,
      'wins', wins_sum, 'losses', losses_sum);
  end if;

  -- Playoffs: collapse postseason games into series, award only a clinched one.
  raw_playoffs := public.nba_http_get(
    format('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=%s0410-%s0701&seasontype=3&limit=1000', espn, espn)
  );

  if raw_playoffs is not null then
    with g as (
      select ev->'competitions'->0 as c
      from jsonb_array_elements(coalesce(raw_playoffs->'events', '[]'::jsonb)) ev
    ),
    f as (
      select public.nba_round_from_headline(c->'notes'->0->>'headline') as rnd,
             c->'competitors' as comps
      from g
      where c->'status'->'type'->>'name' = 'STATUS_FINAL'
    ),
    tagged as (
      select rnd,
             (select string_agg(y.abbr, '-' order by y.abbr)
                from (select comp->'team'->>'abbreviation' as abbr
                        from jsonb_array_elements(comps) comp) y) as pair,
             (select comp->'team'->>'abbreviation'
                from jsonb_array_elements(comps) comp
               where (comp->>'winner')::boolean is true limit 1) as winner
      from f
      where rnd is not null
    ),
    per_series as (
      select rnd, pair, winner, count(*) as wins
      from tagged
      where winner is not null
      group by rnd, pair, winner
    ),
    ranked as (
      select rnd, pair, winner, wins,
             row_number() over (partition by rnd, pair order by wins desc) as rk
      from per_series
    ),
    clinched as (
      -- Best-of-7 needs 4; the play-in is a single game.
      select rnd, winner
      from ranked
      where rk = 1
        and wins >= (case when rnd = 'playIn' then 1 else 4 end)
    ),
    counted as (
      select rnd, winner, count(*) as cnt
      from clinched
      group by rnd, winner
    )
    select coalesce(jsonb_object_agg(z.team_id, z.rounds), '{}'::jsonb)
    into playoffs
    from (
      select t.team_id, jsonb_object_agg(c.rnd, c.cnt) as rounds
      from counted c
      join public.nba_teams t on t.abbr = c.winner
      group by t.team_id
    ) z;
  end if;

  insert into public.nba_season_cache (season, standings, playoffs, source, team_count, updated_at)
  values (target_season, standings, coalesce(playoffs, '{}'::jsonb), 'espn-pg', team_ct, now())
  on conflict (season) do update
    set standings = excluded.standings,
        playoffs = excluded.playoffs,
        source = excluded.source,
        team_count = excluded.team_count,
        updated_at = now();

  return jsonb_build_object('season', target_season, 'ok', true, 'teams', team_ct,
    'playoffTeams', (select count(*) from jsonb_object_keys(playoffs)));
end;
$$;

/**
 * Sync the current season plus the previous one — early in a new season the
 * previous year's results are still what leagues are looking at.
 */
create or replace function public.sync_nba_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur int := public.nba_default_season();
begin
  return jsonb_build_object(
    'ranAt', now(),
    'current', public.sync_nba_season(cur),
    'previous', public.sync_nba_season(cur - 1)
  );
end;
$$;

-- These run from cron as the table owner; clients never call them.
revoke all on function public.sync_nba_season(int) from public, anon, authenticated;
revoke all on function public.sync_nba_all() from public, anon, authenticated;
revoke all on function public.nba_http_get(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: 10:00 UTC = 5am ET, late enough that West-coast games are final.
-- ---------------------------------------------------------------------------

select cron.unschedule('nba-nightly-sync')
where exists (select 1 from cron.job where jobname = 'nba-nightly-sync');

select cron.schedule('nba-nightly-sync', '0 10 * * *', $$select public.sync_nba_all()$$);
