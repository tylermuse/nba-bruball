/**
 * NBA Bruball scoring.
 *
 * Design decisions (see plan):
 *  - Regular season: 1 point per win. No ties exist in the NBA.
 *  - Playoffs: points awarded to the WINNER of each series, escalating by round.
 *    Play-In is worth nothing; only the real bracket scores.
 *  - A championship run banks 4 + 7 + 11 + 16 = 38 points, roughly a strong
 *    team's entire regular season, so a title roughly doubles that team's value.
 *
 * Everything here is pure and unit-tested. No fetching, no React.
 */

export type PlayoffRound =
  | 'playIn'
  | 'firstRound'
  | 'confSemifinals'
  | 'confFinals'
  | 'finals';

export interface ScoringConfig {
  /** Points per regular-season win. */
  winPoints: number;
  /** Points awarded to the winner of a series in each round. */
  seriesPoints: Record<PlayoffRound, number>;
}

export const DEFAULT_SCORING: ScoringConfig = {
  winPoints: 1,
  seriesPoints: {
    playIn: 0,
    firstRound: 4,
    confSemifinals: 7,
    confFinals: 11,
    finals: 16,
  },
};

/** Total a single team earns by winning the title from the first round. */
export const CHAMPIONSHIP_RUN_POINTS =
  DEFAULT_SCORING.seriesPoints.firstRound +
  DEFAULT_SCORING.seriesPoints.confSemifinals +
  DEFAULT_SCORING.seriesPoints.confFinals +
  DEFAULT_SCORING.seriesPoints.finals;

export const ROUND_LABELS: Record<PlayoffRound, string> = {
  playIn: 'Play-In',
  firstRound: 'First Round',
  confSemifinals: 'Conf. Semifinals',
  confFinals: 'Conf. Finals',
  finals: 'NBA Finals',
};

export const ROUND_ORDER: PlayoffRound[] = [
  'playIn',
  'firstRound',
  'confSemifinals',
  'confFinals',
  'finals',
];

/** A team's regular-season record. NBA has no ties. */
export interface TeamRecord {
  wins: number;
  losses: number;
}

/** Series wins per round for one team, e.g. { firstRound: 1, confSemifinals: 1 }. */
export type SeriesWins = Partial<Record<PlayoffRound, number>>;

/** Map of teamId → that team's series wins by round. */
export type PlayoffResults = Record<string, SeriesWins>;

/** Map of teamId → regular-season record. */
export type StandingsMap = Record<string, TeamRecord>;

export function getRegularSeasonPoints(
  record: TeamRecord | null | undefined,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  if (!record) return 0;
  return record.wins * config.winPoints;
}

export function getPlayoffPoints(
  seriesWins: SeriesWins | null | undefined,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  if (!seriesWins) return 0;
  return ROUND_ORDER.reduce((sum, round) => {
    const won = seriesWins[round] ?? 0;
    return sum + won * config.seriesPoints[round];
  }, 0);
}

/** Total points for a single NBA team: regular season + playoffs. */
export function getTeamPoints(
  teamId: string,
  standings: StandingsMap | null | undefined,
  playoffs: PlayoffResults | null | undefined,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  const regular = getRegularSeasonPoints(standings?.[teamId], config);
  const playoff = getPlayoffPoints(playoffs?.[teamId], config);
  return regular + playoff;
}

/** Total points for a fantasy roster (a league member's drafted teams). */
export function getRosterPoints(
  teamIds: string[],
  standings: StandingsMap | null | undefined,
  playoffs: PlayoffResults | null | undefined,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  return teamIds.reduce(
    (sum, teamId) => sum + getTeamPoints(teamId, standings, playoffs, config),
    0,
  );
}

export interface RosterBreakdown {
  teamId: string;
  wins: number;
  losses: number;
  regularSeasonPoints: number;
  playoffPoints: number;
  totalPoints: number;
}

/** Per-team detail for a roster — powers the Leaderboard drill-down. */
export function getRosterBreakdown(
  teamIds: string[],
  standings: StandingsMap | null | undefined,
  playoffs: PlayoffResults | null | undefined,
  config: ScoringConfig = DEFAULT_SCORING,
): RosterBreakdown[] {
  return teamIds.map((teamId) => {
    const record = standings?.[teamId];
    const regularSeasonPoints = getRegularSeasonPoints(record, config);
    const playoffPoints = getPlayoffPoints(playoffs?.[teamId], config);
    return {
      teamId,
      wins: record?.wins ?? 0,
      losses: record?.losses ?? 0,
      regularSeasonPoints,
      playoffPoints,
      totalPoints: regularSeasonPoints + playoffPoints,
    };
  });
}

/** Points a team stands to gain by winning its current series. */
export function getPointsAtStake(
  round: PlayoffRound,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  return config.seriesPoints[round];
}
