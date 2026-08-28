import { useCallback, useEffect, useState } from 'react';
import type { PlayoffResults, StandingsMap } from './scoring';
import type { NbaGame } from './nbaSources';
import snapshot2025 from '../data/season-2025.json';

export type SourceName = 'sportsdata' | 'espn' | 'local';

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
    try {
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
      setStandings(s.data);
      setPlayoffs(p.data);
      setSource(s.source);
      setUpdatedAt(s.updatedAt);
    } catch (err) {
      const local = localFallback(season);
      setStandings(local.standings);
      setPlayoffs(local.playoffs);
      setSource('local');
      setUpdatedAt(local.updatedAt);
      setError(err instanceof Error ? err.message : 'Failed to load NBA data');
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

/** Rolling date window — NBA games are organized by date, not week. */
export function useNbaSchedule(dates: string | null): ScheduleData {
  const [games, setGames] = useState<NbaGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dates) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/nba/scores?dates=${dates}`)
      .then((r) => {
        if (!r.ok) throw new Error(`scores ${r.status}`);
        return r.json() as Promise<Sourced<NbaGame[]>>;
      })
      .then((res) => {
        if (active) setGames(res.data);
      })
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
