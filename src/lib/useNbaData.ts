import { useCallback, useEffect, useState } from 'react';
import type { PlayoffResults, StandingsMap } from './scoring';
import { expandScoreboardDates, parseEspnScoreboard, type NbaGame } from './nbaSources';
import snapshot2025 from '../data/season-2025.json';
import { supabase } from './supabase';

export type SourceName = 'sportsdata' | 'espn' | 'local' | 'cache';

interface Sourced<T> {
  data: T;
  source: SourceName;
  season: number;
  updatedAt: string;
  notes?: string[];
}

export interface NbaData {
  standings: StandingsMap | null;
  playoffs: PlayoffResults | null;
  source: SourceName | null;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * The bundled snapshot is the last-resort tier: if /api is unreachable (e.g.
 * `vite dev` without `vercel dev`), the app still shows real numbers for the
 * season it covers rather than a page of zeros.
 */
function localFallback(season: number) {
  if (season === snapshot2025.season) {
    return {
      standings: snapshot2025.standings as StandingsMap,
      playoffs: snapshot2025.playoffs as PlayoffResults,
      updatedAt: snapshot2025.updatedAt,
    };
  }
  return { standings: {} as StandingsMap, playoffs: {} as PlayoffResults, updatedAt: null };
}

/**
 * How old a cached snapshot may be before a failed live refresh is worth
 * surfacing as an error. The nightly job runs at 5am ET, so under two days
 * means at most one missed run.
 */
export const CACHE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export function isCacheStale(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!updatedAt) return true;
  const age = now.getTime() - new Date(updatedAt).getTime();
  if (Number.isNaN(age)) return true;
  return age > CACHE_MAX_AGE_MS;
}

/** Total games recorded in a standings map (each game counts once). */
export function gamesPlayed(standings: StandingsMap | null | undefined): number {
  if (!standings) return 0;
  return Object.values(standings).reduce((n, r) => n + (r.wins ?? 0), 0);
}

function countPlayoffWins(playoffs: PlayoffResults | null | undefined): number {
  if (!playoffs) return 0;
  return Object.values(playoffs).reduce(
    (n, rounds) => n + Object.values(rounds).reduce((m, v) => m + ((v as number) ?? 0), 0),
    0,
  );
}

/**
 * Use live standings over the nightly snapshot when they come from a real
 * upstream (not the bundled fallback) and are at least as far along — never
 * let a flaky or lagging live response roll the leaderboard backwards.
 */
export function preferLive(
  cached: StandingsMap | null | undefined,
  live: StandingsMap | null | undefined,
  liveSource: SourceName,
): boolean {
  if (liveSource === 'local' || !live || Object.keys(live).length === 0) return false;
  return gamesPlayed(live) >= gamesPlayed(cached);
}

/** Read the nightly snapshot out of Postgres. */
async function readCache(season: number) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('nba_season', { target_season: season });
  if (error) return null;
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) return null;
  return {
    standings: (row.standings ?? {}) as StandingsMap,
    playoffs: (row.playoffs ?? {}) as PlayoffResults,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

export function useNbaData(season: number | null): NbaData {
  const [standings, setStandings] = useState<StandingsMap | null>(null);
  const [playoffs, setPlayoffs] = useState<PlayoffResults | null>(null);
  const [source, setSource] = useState<SourceName | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (season === null) return;
    setLoading(true);
    setError(null);
    let cached: Awaited<ReturnType<typeof readCache>> = null;
    try {
      // 1. Paint the nightly snapshot immediately so the page isn't empty.
      cached = await readCache(season);
      if (cached && Object.keys(cached.standings).length > 0) {
        setStandings(cached.standings);
        setPlayoffs(cached.playoffs);
        setSource('cache');
        setUpdatedAt(cached.updatedAt);
      }

      // 2. Always check live. The snapshot is only written once a day, so a
      //    game that ended tonight would otherwise stay unscored until 5am.
      //    /api caches upstream for 10 minutes, so this stays cheap.
      const [s, p] = await Promise.all([
        fetch(`/api/nba/standings?season=${season}`).then((r) => {
          if (!r.ok) throw new Error(`standings ${r.status}`);
          return r.json() as Promise<Sourced<StandingsMap>>;
        }),
        fetch(`/api/nba/playoffs?season=${season}`).then((r) => {
          if (!r.ok) throw new Error(`playoffs ${r.status}`);
          return r.json() as Promise<Sourced<PlayoffResults>>;
        }),
      ]);

      const haveCache = !!cached && Object.keys(cached.standings).length > 0;
      if (!haveCache || preferLive(cached!.standings, s.data, s.source)) {
        setStandings(s.data);
        setSource(s.source);
        setUpdatedAt(s.updatedAt);
      }
      if (!haveCache || (p.source !== 'local' && countPlayoffWins(p.data) >= countPlayoffWins(cached!.playoffs))) {
        setPlayoffs(p.data);
      }
    } catch (err) {
      // Live failed. A snapshot already on screen is good enough unless it's old.
      if (cached && Object.keys(cached.standings).length > 0) {
        if (isCacheStale(cached.updatedAt)) {
          setError(err instanceof Error ? err.message : 'Failed to refresh NBA data');
        }
      } else {
        const local = localFallback(season);
        setStandings(local.standings);
        setPlayoffs(local.playoffs);
        setSource('local');
        setUpdatedAt(local.updatedAt);
        setError(err instanceof Error ? err.message : 'Failed to load NBA data');
      }
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    void load();
  }, [load]);

  return { standings, playoffs, source, updatedAt, loading, error, refresh: load };
}

export interface ScheduleData {
  games: NbaGame[];
  loading: boolean;
  error: string | null;
}

const ESPN_SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

/**
 * Games for a date window. NBA games are organized by date, not week.
 *
 * Falls back to calling ESPN straight from the browser when /api isn't there —
 * which is the case under plain `vite dev`, where the serverless functions
 * aren't running. Without this the Schedule tab is simply dead in local dev.
 * ESPN's scoreboard sends permissive CORS headers, and the response goes
 * through the same parser the server uses.
 */
export function useNbaSchedule(dates: string | null): ScheduleData {
  const [games, setGames] = useState<NbaGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dates) return;
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const res = await fetch(`/api/nba/scores?dates=${dates}`);
        if (res.ok) {
          const body = (await res.json()) as Sourced<NbaGame[]>;
          if (active) setGames(body.data);
          return;
        }
      } catch {
        // fall through to the direct call
      }

      // ESPN rejects date ranges, so query one day at a time.
      const pages = await Promise.all(
        expandScoreboardDates(dates).map(async (day) => {
          const direct = await fetch(`${ESPN_SCOREBOARD}?dates=${day}&limit=1000`);
          if (!direct.ok) throw new Error(`scores ${direct.status}`);
          return (await direct.json()) as Parameters<typeof parseEspnScoreboard>[0];
        }),
      );
      const events = pages.flatMap((p) => p.events ?? []);
      if (active) setGames(parseEspnScoreboard({ events }));
    };

    load()
      .catch((err) => {
        if (active) {
          setGames([]);
          setError(err instanceof Error ? err.message : 'Failed to load games');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dates]);

  return { games, loading, error };
}

/** YYYYMMDD-YYYYMMDD for a week window anchored on `from`. */
export function weekRange(from: Date, days = 6): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return `${fmt(from)}-${fmt(end)}`;
}

/**
 * A date inside the given season that reliably has games — mid-January, deep
 * into the regular season. Used to jump out of the offseason.
 */
export function midSeasonDate(season: number): Date {
  return new Date(season + 1, 0, 12);
}

/** YYYYMMDD-YYYYMMDD covering today through `days` ahead. */
export function rollingDateRange(days = 7, from: Date = new Date()): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return `${fmt(from)}-${fmt(end)}`;
}
