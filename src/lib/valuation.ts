/**
 * Draft-time valuation model — ported from the NFL Bruball draft-engine spec.
 *
 * Turns a frozen odds snapshot into a single points currency used to value
 * teams during the draft (best-available hints, autopick, CPU practice
 * opponents). Independent of the live in-season scoring in scoring.ts.
 *
 * Method (unchanged from the NFL version, generalized to NBA's round
 * structure): devig the championship odds into a title probability, then fit
 * a rank-preserving power curve per playoff round so the probabilities sum to
 * how many teams actually win that round. Points = win total + each round's
 * series-win probability times that round's scoring weight. NBA's Finals
 * round IS the title (winning it = champion), so unlike the NFL model there's
 * no separate champion bonus layered on top — matches DEFAULT_SCORING, where
 * `finals` already carries the full weight of winning it all.
 */
import { getTeamById, type Team } from '../data/teams';
import { ODDS_SNAPSHOT_2026, type OddsSnapshot } from '../data/oddsSnapshot2026';
import { DEFAULT_SCORING, type ScoringConfig } from './scoring';

export interface TeamValuation {
  teamId: Team['id'];
  division: Team['division'];
  winTotal: number;
  /** Probability this team wins the championship (devigged). */
  title: number;
  pFirstRound: number;
  pConfSemifinals: number;
  pConfFinals: number;
  points: number;
}

export interface ValuationBoard {
  season: number;
  capturedAt: string;
  sources: OddsSnapshot['sources'];
  teams: TeamValuation[];
  byId: Record<string, TeamValuation>;
  /** Total points across all 30 teams. */
  poolPoints: number;
  /** poolPoints / memberCount — the "fair share" per manager. */
  parPoints: number;
}

// Rank-preserving power fit per round. 16 teams make the playoffs (after
// play-in), 8 win the first round, 4 win the conference semis, 2 win the
// conference finals (i.e. reach the Finals), 1 wins the Finals (champion).
// Exponents are defaults carried over from the NFL model's spacing —
// increasingly concentrated on the title favorite as rounds progress.
const ROUND_TARGETS: Array<{
  key: 'pFirstRound' | 'pConfSemifinals' | 'pConfFinals';
  teams: number;
  alpha: number;
}> = [
  { key: 'pFirstRound', teams: 8, alpha: 0.55 },
  { key: 'pConfSemifinals', teams: 4, alpha: 0.7 },
  { key: 'pConfFinals', teams: 2, alpha: 0.85 },
];

function americanOddsToImpliedProbability(americanOdds: number): number {
  return americanOdds >= 0
    ? 100 / (americanOdds + 100)
    : -americanOdds / (-americanOdds + 100);
}

export function devigTitleProbabilities(
  entries: OddsSnapshot['entries'],
): Map<string, number> {
  const raw = new Map(
    entries.map((e) => [e.teamId, americanOddsToImpliedProbability(e.championshipOdds)]),
  );
  const sumRaw = [...raw.values()].reduce((a, b) => a + b, 0);
  const title = new Map<string, number>();
  raw.forEach((v, id) => title.set(id, v / sumRaw));
  return title;
}

/**
 * Normalize title^alpha so the values sum to targetSum, clamping any team at
 * a 1.0 probability ceiling and redistributing the overflow among the
 * remaining teams.
 */
export function powerFitRound(
  title: Map<string, number>,
  alpha: number,
  targetSum: number,
): Map<string, number> {
  const result = new Map<string, number>();
  let active = new Map(title);
  let target = targetSum;

  for (let iter = 0; iter < 64 && active.size > 0; iter++) {
    const raw = new Map<string, number>();
    let rawSum = 0;
    active.forEach((v, id) => {
      const r = Math.pow(v, alpha);
      raw.set(id, r);
      rawSum += r;
    });

    if (rawSum <= 0) {
      const even = target / active.size;
      active.forEach((_, id) => result.set(id, Math.max(0, Math.min(1, even))));
      break;
    }

    const scale = target / rawSum;
    const clamped: string[] = [];
    active.forEach((_, id) => {
      const p = (raw.get(id) ?? 0) * scale;
      if (p >= 1) clamped.push(id);
    });

    if (clamped.length === 0) {
      active.forEach((_, id) => {
        result.set(id, (raw.get(id) ?? 0) * scale);
      });
      break;
    }

    clamped.forEach((id) => {
      result.set(id, 1);
      active.delete(id);
      target -= 1;
    });
  }

  return result;
}

export function buildValuationBoard(
  snapshot: OddsSnapshot = ODDS_SNAPSHOT_2026,
  scoring: ScoringConfig = DEFAULT_SCORING,
  memberCount = 5,
): ValuationBoard {
  const title = devigTitleProbabilities(snapshot.entries);

  const roundProbs = new Map<string, Map<string, number>>();
  ROUND_TARGETS.forEach(({ key, teams, alpha }) => {
    roundProbs.set(key, powerFitRound(title, alpha, teams));
  });

  const teams: TeamValuation[] = snapshot.entries.map((entry) => {
    const team = getTeamById(entry.teamId);
    if (!team) {
      throw new Error(`Unknown team in odds snapshot: ${entry.teamId}`);
    }
    const t = title.get(entry.teamId) ?? 0;
    const pFirstRound = roundProbs.get('pFirstRound')?.get(entry.teamId) ?? 0;
    const pConfSemifinals = roundProbs.get('pConfSemifinals')?.get(entry.teamId) ?? 0;
    const pConfFinals = roundProbs.get('pConfFinals')?.get(entry.teamId) ?? 0;

    const points =
      entry.winTotal * (scoring.winPoints / 1) +
      scoring.seriesPoints.firstRound * pFirstRound +
      scoring.seriesPoints.confSemifinals * pConfSemifinals +
      scoring.seriesPoints.confFinals * pConfFinals +
      scoring.seriesPoints.finals * t;

    return {
      teamId: entry.teamId,
      division: team.division,
      winTotal: entry.winTotal,
      title: t,
      pFirstRound,
      pConfSemifinals,
      pConfFinals,
      points,
    };
  });

  const poolPoints = teams.reduce((sum, t) => sum + t.points, 0);
  const byId = Object.fromEntries(teams.map((t) => [t.teamId, t]));

  return {
    season: snapshot.season,
    capturedAt: snapshot.capturedAt,
    sources: snapshot.sources,
    teams,
    byId,
    poolPoints,
    parPoints: poolPoints / memberCount,
  };
}

/** Default board built from the frozen 2026-27 snapshot and default scoring. */
export const VALUATION_BOARD_2026: ValuationBoard = buildValuationBoard();
