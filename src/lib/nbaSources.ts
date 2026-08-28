/**
 * Parsing and normalization for live NBA data.
 *
 * Everything here is pure so it can be unit-tested without network access; the
 * serverless handlers in api/nba/* do the fetching and call into this.
 *
 * THE SEASON OFF-BY-ONE: we label a season by its starting year (2025 = the
 * 2025-26 season), but ESPN labels it by its ENDING year. ESPN's `season=2026`
 * is our 2025. Getting this wrong silently returns the wrong season's data
 * rather than failing, so it lives in one clearly-named function.
 */

import { getTeamByAbbreviation, getTeamByName, TEAMS } from '../data/teams';
import type { PlayoffRound, StandingsMap, PlayoffResults } from './scoring';

/** Our season (starting year) → ESPN's season parameter (ending year). */
export function toEspnSeason(season: number): number {
  return season + 1;
}

/** ESPN's season parameter → our season. */
export function fromEspnSeason(espnSeason: number): number {
  return espnSeason - 1;
}

/**
 * Feeds spell abbreviations differently — ESPN says NY/GS/SA, SportsData.io
 * says NYK/GSW/SAS. Map everything onto our canonical team ids.
 */
const ABBR_ALIASES: Record<string, string> = {
  NYK: 'NY',
  GSW: 'GS',
  SAS: 'SA',
  NOP: 'NO',
  PHO: 'PHX',
  UTA: 'UTAH',
  WAS: 'WSH',
  BRK: 'BKN',
  CHO: 'CHA',
};

export function resolveTeamId(
  abbreviation?: string | null,
  name?: string | null,
): string | null {
  if (abbreviation) {
    const raw = abbreviation.toUpperCase();
    const canonical = ABBR_ALIASES[raw] ?? raw;
    const team = getTeamByAbbreviation(canonical);
    if (team) return team.id;
  }
  if (name) {
    const team = getTeamByName(name);
    if (team) return team.id;
  }
  return null;
}

// --- ESPN standings ---------------------------------------------------------

interface EspnStat {
  name?: string;
  value?: number;
}

interface EspnEntry {
  team?: { displayName?: string; abbreviation?: string };
  stats?: EspnStat[];
}

export interface EspnStandingsResponse {
  standings?: { entries?: EspnEntry[] };
  season?: { year?: number; displayName?: string };
}

export function parseEspnStandings(json: EspnStandingsResponse): StandingsMap {
  const out: StandingsMap = {};
  for (const entry of json?.standings?.entries ?? []) {
    const teamId = resolveTeamId(entry.team?.abbreviation, entry.team?.displayName);
    if (!teamId) continue;
    const stats = new Map(
      (entry.stats ?? []).map((s) => [s.name ?? '', s.value ?? 0]),
    );
    out[teamId] = {
      wins: Number(stats.get('wins') ?? 0),
      losses: Number(stats.get('losses') ?? 0),
    };
  }
  return out;
}

// --- ESPN playoffs ----------------------------------------------------------

/**
 * ESPN tags each postseason game with a headline like
 * "East 1st Round - Game 3" or "NBA Play-In - West - 8th Seed Game".
 */
export function roundFromHeadline(headline: string | null | undefined): PlayoffRound | null {
  const s = (headline ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('play-in') || s.includes('play in')) return 'playIn';
  if (s.includes('nba finals')) return 'finals';
  if (s.includes('1st round') || s.includes('first round')) return 'firstRound';
  if (s.includes('semifinal')) return 'confSemifinals';
  if (s.includes('conference finals') || /\b(east|west)(ern)? finals\b/.test(s)) {
    return 'confFinals';
  }
  return null;
}

interface EspnCompetitor {
  team?: { abbreviation?: string; displayName?: string };
  winner?: boolean;
  score?: string;
  homeAway?: string;
}

interface EspnCompetition {
  notes?: Array<{ headline?: string }>;
  status?: { type?: { name?: string; completed?: boolean } };
  competitors?: EspnCompetitor[];
}

export interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
}

function isFinal(comp: EspnCompetition): boolean {
  return (
    comp.status?.type?.name === 'STATUS_FINAL' || comp.status?.type?.completed === true
  );
}

/**
 * Collapse postseason games into series, then award one "series win" to
 * whoever took each series. Scoring is per series, so we never need game counts
 * beyond deciding the winner — the team with the most wins in a completed
 * matchup took it.
 */
export function parseEspnPlayoffs(events: EspnEvent[]): PlayoffResults {
  interface Series {
    round: PlayoffRound;
    wins: Record<string, number>;
  }
  const series = new Map<string, Series>();

  for (const event of events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp || !isFinal(comp)) continue;

    const round = roundFromHeadline(comp.notes?.[0]?.headline);
    if (!round) continue;

    const ids = (comp.competitors ?? [])
      .map((c) => resolveTeamId(c.team?.abbreviation, c.team?.displayName))
      .filter((id): id is string => Boolean(id))
      .sort();
    if (ids.length !== 2) continue;

    const key = `${round}|${ids.join('-')}`;
    if (!series.has(key)) series.set(key, { round, wins: {} });
    const entry = series.get(key)!;

    const winner = (comp.competitors ?? []).find((c) => c.winner === true);
    const winnerId = winner
      ? resolveTeamId(winner.team?.abbreviation, winner.team?.displayName)
      : null;
    if (winnerId) entry.wins[winnerId] = (entry.wins[winnerId] ?? 0) + 1;
  }

  const out: PlayoffResults = {};
  for (const entry of series.values()) {
    const ranked = Object.entries(entry.wins).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) continue;

    // Only award a DECIDED series. Without this, the team leading an
    // in-progress series banks the full points after game 1 — and at 2-2 the
    // stable sort would hand it to whoever won game 1, i.e. possibly the team
    // that goes on to lose. Best-of-7 clinches at 4; the play-in is one game.
    const clinch = entry.round === 'playIn' ? 1 : 4;
    const [winnerId, topWins] = ranked[0];
    if (topWins < clinch) continue;

    out[winnerId] ??= {};
    // A play-in team can win two games (9/10 seed, then the 7/8 loser), but a
    // team can only take a given bracket round once.
    const prior = out[winnerId][entry.round] ?? 0;
    out[winnerId][entry.round] = entry.round === 'playIn' ? prior + 1 : 1;
  }
  return out;
}

// --- ESPN scoreboard (games by date) ---------------------------------------

export interface NbaGame {
  id: string;
  date: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
  winnerTeamId: string | null;
  /** Present for postseason games. */
  round: PlayoffRound | null;
  headline: string | null;
}

export function parseEspnScoreboard(json: { events?: EspnEvent[] }): NbaGame[] {
  const games: NbaGame[] = [];
  for (const event of json?.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const competitors = comp.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0];
    const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1];
    const headline = comp.notes?.[0]?.headline ?? null;
    const winner = competitors.find((c) => c.winner === true);

    games.push({
      id: String(event.id ?? ''),
      date: String(event.date ?? ''),
      homeTeamId: resolveTeamId(home?.team?.abbreviation, home?.team?.displayName),
      awayTeamId: resolveTeamId(away?.team?.abbreviation, away?.team?.displayName),
      homeScore: home?.score != null ? Number(home.score) : null,
      awayScore: away?.score != null ? Number(away.score) : null,
      completed: isFinal(comp),
      winnerTeamId: winner
        ? resolveTeamId(winner.team?.abbreviation, winner.team?.displayName)
        : null,
      round: roundFromHeadline(headline),
      headline,
    });
  }
  return games;
}

// --- SportsData.io ----------------------------------------------------------

interface SportsDataStanding {
  Team?: string;
  Key?: string;
  Name?: string;
  City?: string;
  Wins?: number;
  Losses?: number;
}

export function parseSportsDataStandings(rows: SportsDataStanding[]): StandingsMap {
  const out: StandingsMap = {};
  for (const row of rows ?? []) {
    const teamId = resolveTeamId(
      row.Key ?? row.Team,
      row.City && row.Name ? `${row.City} ${row.Name}` : row.Name,
    );
    if (!teamId) continue;
    out[teamId] = { wins: Number(row.Wins ?? 0), losses: Number(row.Losses ?? 0) };
  }
  return out;
}

// --- sanity checks ----------------------------------------------------------

/**
 * A standings payload is only trustworthy if it covers the whole league and the
 * wins and losses balance. A partial or malformed response should fall through
 * to the next source rather than quietly zeroing out someone's roster.
 */
export function isPlausibleStandings(standings: StandingsMap | null | undefined): boolean {
  if (!standings) return false;
  const entries = Object.values(standings);
  if (entries.length !== TEAMS.length) return false;
  let wins = 0;
  let losses = 0;
  for (const rec of entries) {
    if (!Number.isFinite(rec.wins) || !Number.isFinite(rec.losses)) return false;
    if (rec.wins < 0 || rec.losses < 0) return false;
    if (rec.wins + rec.losses > 82) return false;
    wins += rec.wins;
    losses += rec.losses;
  }
  // Every win is someone else's loss.
  return wins === losses;
}

/** Playoff payloads should never claim a team won a bracket round twice. */
export function isPlausiblePlayoffs(playoffs: PlayoffResults | null | undefined): boolean {
  if (!playoffs) return false;
  for (const rounds of Object.values(playoffs)) {
    for (const [round, value] of Object.entries(rounds)) {
      const count = value as number;
      if (!Number.isFinite(count) || count < 0) return false;
      // The play-in legitimately allows two wins for a 9/10 seed that advances;
      // capping it at 1 here would reject a valid postseason and throw away the
      // entire playoff payload. Every other round is once-only.
      const max = round === 'playIn' ? 2 : 1;
      if (count > max) return false;
    }
  }
  // At most one champion.
  const champions = Object.values(playoffs).filter((r) => (r.finals ?? 0) > 0);
  return champions.length <= 1;
}

/** Default playoff window for a season, used when querying by date range. */
export function playoffDateRange(season: number): { start: string; end: string } {
  // Play-In starts mid-April; the Finals end by late June of the following year.
  const year = season + 1;
  return { start: `${year}0410`, end: `${year}0701` };
}
