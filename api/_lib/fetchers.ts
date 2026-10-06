/**
 * Live NBA data fetchers with a three-tier fallback:
 *   SportsData.io (if a key is configured) → ESPN public API → local snapshot.
 *
 * Each tier is validated before use — a partial or malformed payload falls
 * through to the next source rather than silently zeroing out rosters.
 *
 * Secrets: SPORTSDATAIO_API_KEY is read from the environment only. Never
 * prefix it with VITE_, which would ship it to the browser.
 */

import {
  parseEspnStandings,
  parseEspnPlayoffs,
  parseEspnScoreboard,
  parseSportsDataStandings,
  isPlausibleStandings,
  isPlausiblePlayoffs,
  toEspnSeason,
  playoffMonths,
  expandScoreboardDates,
  type NbaGame,
} from '../../src/lib/nbaSources.js';
import type { PlayoffResults, StandingsMap } from '../../src/lib/scoring.js';
import snapshot2025 from '../../src/data/season-2025.json' with { type: 'json' };

export type SourceName = 'sportsdata' | 'espn' | 'local';

export interface Sourced<T> {
  data: T;
  source: SourceName;
  season: number;
  updatedAt: string;
  /** Populated when a tier was skipped, so failures stay visible. */
  notes?: string[];
}

const ESPN_BASE = 'https://site.api.espn.com/apis';
const SPORTSDATA_BASE = 'https://api.sportsdata.io/v3/nba/scores/json';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  try {
    const res = await fetch(url, init);
    if (!res.ok) return hit?.value ?? null;
    const json = await res.json();
    cache.set(url, { at: Date.now(), value: json });
    return json;
  } catch {
    return hit?.value ?? null;
  }
}

const ESPN_SCOREBOARD = `${ESPN_BASE}/site/v2/sports/basketball/nba/scoreboard`;

/**
 * Events from one scoreboard call per `dates` value (a day or a YYYYMM month —
 * ESPN rejects ranges). Null if any call failed, so a missing day or month is
 * never mistaken for "no games".
 */
async function getScoreboardEvents(dates: string[]): Promise<unknown[] | null> {
  const pages = await Promise.all(
    dates.map((d) => getJson(`${ESPN_SCOREBOARD}?dates=${d}&limit=1000`)),
  );
  if (pages.some((p) => !p)) return null;
  return pages.flatMap((p) => (p as { events?: unknown[] }).events ?? []);
}

function localSnapshot(season: number) {
  // Only the completed 2025-26 season is bundled. Other seasons get empty data
  // rather than the wrong season's numbers.
  if (season === snapshot2025.season) {
    return {
      standings: snapshot2025.standings as StandingsMap,
      playoffs: snapshot2025.playoffs as PlayoffResults,
      updatedAt: snapshot2025.updatedAt,
    };
  }
  return { standings: {} as StandingsMap, playoffs: {} as PlayoffResults, updatedAt: new Date().toISOString() };
}

export async function getStandings(season: number): Promise<Sourced<StandingsMap>> {
  const notes: string[] = [];
  const key = process.env.SPORTSDATAIO_API_KEY;

  if (key) {
    const rows = await getJson(
      `${SPORTSDATA_BASE}/Standings/${season}?key=${key}`,
    );
    if (Array.isArray(rows)) {
      const parsed = parseSportsDataStandings(rows);
      if (isPlausibleStandings(parsed)) {
        return { data: parsed, source: 'sportsdata', season, updatedAt: new Date().toISOString(), notes };
      }
      notes.push('sportsdata: implausible standings');
    } else {
      notes.push('sportsdata: no data');
    }
  } else {
    notes.push('sportsdata: no API key');
  }

  const espn = await getJson(
    `${ESPN_BASE}/v2/sports/basketball/nba/standings?season=${toEspnSeason(season)}&seasontype=2&level=1`,
  );
  if (espn) {
    const parsed = parseEspnStandings(espn as never);
    if (isPlausibleStandings(parsed)) {
      return { data: parsed, source: 'espn', season, updatedAt: new Date().toISOString(), notes };
    }
    notes.push(
      Object.keys(parsed).length === 0
        ? 'espn: season has no games yet'
        : 'espn: implausible standings',
    );
  } else {
    notes.push('espn: request failed');
  }

  const local = localSnapshot(season);
  return { data: local.standings, source: 'local', season, updatedAt: local.updatedAt, notes };
}

export async function getPlayoffs(season: number): Promise<Sourced<PlayoffResults>> {
  const notes: string[] = [];
  const events = await getScoreboardEvents(playoffMonths(season));
  if (events) {
    const parsed = parseEspnPlayoffs(events as never);
    if (isPlausiblePlayoffs(parsed) && Object.keys(parsed).length > 0) {
      return { data: parsed, source: 'espn', season, updatedAt: new Date().toISOString(), notes };
    }
    notes.push(
      Object.keys(parsed).length === 0
        ? 'espn: no playoff results yet'
        : 'espn: implausible playoff data',
    );
  } else {
    notes.push('espn: request failed');
  }

  const local = localSnapshot(season);
  return { data: local.playoffs, source: 'local', season, updatedAt: local.updatedAt, notes };
}

/**
 * NBA games are organized by date, not by week — this is the main structural
 * difference from the NFL version's schedule fetcher.
 */
export async function getScores(dates: string): Promise<Sourced<NbaGame[]>> {
  const notes: string[] = [];
  const events = await getScoreboardEvents(expandScoreboardDates(dates));
  if (events) {
    const games = parseEspnScoreboard({ events } as never);
    return { data: games, source: 'espn', season: 0, updatedAt: new Date().toISOString(), notes };
  }
  notes.push('espn: request failed');
  return { data: [], source: 'local', season: 0, updatedAt: new Date().toISOString(), notes };
}
