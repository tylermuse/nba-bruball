// Market snapshot backing the draft valuation model — ported from the NFL
// Bruball draft-engine spec, adapted to the NBA. Frozen at draft time; do not
// recompute against live odds mid-season or roster values will drift.
import type { Team } from './teams';

export interface OddsEntry {
  teamId: Team['id'];
  /** Sportsbook regular-season win total. */
  winTotal: number;
  /** American odds to win the NBA championship, stored as the number after
   * the sign (e.g. 270 for "+270", -150 for "-150"). */
  championshipOdds: number;
}

export interface OddsSnapshot {
  season: number;
  capturedAt: string;
  sources: {
    winTotals: string;
    championshipFutures: string;
  };
  entries: OddsEntry[];
}

export const ODDS_SNAPSHOT_2026: OddsSnapshot = {
  season: 2026, // 2026-27 season
  capturedAt: '2026-07-24T00:00:00.000Z',
  sources: {
    winTotals: 'BetMGM',
    championshipFutures: 'DraftKings',
  },
  entries: [
    { teamId: 'atlanta-hawks', winTotal: 43.5, championshipOdds: 7000 },
    { teamId: 'boston-celtics', winTotal: 51.5, championshipOdds: 1300 },
    { teamId: 'brooklyn-nets', winTotal: 24.5, championshipOdds: 100000 },
    { teamId: 'charlotte-hornets', winTotal: 37.5, championshipOdds: 10000 },
    { teamId: 'chicago-bulls', winTotal: 27.5, championshipOdds: 70000 },
    { teamId: 'cleveland-cavaliers', winTotal: 47.5, championshipOdds: 2500 },
    { teamId: 'dallas-mavericks', winTotal: 34.5, championshipOdds: 18000 },
    { teamId: 'denver-nuggets', winTotal: 49.5, championshipOdds: 2500 },
    { teamId: 'detroit-pistons', winTotal: 49.5, championshipOdds: 2500 },
    { teamId: 'golden-state-warriors', winTotal: 40.5, championshipOdds: 6000 },
    { teamId: 'houston-rockets', winTotal: 47.5, championshipOdds: 5000 },
    { teamId: 'indiana-pacers', winTotal: 44.5, championshipOdds: 4000 },
    { teamId: 'la-clippers', winTotal: 30.5, championshipOdds: 50000 },
    { teamId: 'los-angeles-lakers', winTotal: 46.5, championshipOdds: 3500 },
    { teamId: 'memphis-grizzlies', winTotal: 28.5, championshipOdds: 100000 },
    { teamId: 'miami-heat', winTotal: 46.5, championshipOdds: 3000 },
    { teamId: 'milwaukee-bucks', winTotal: 26.5, championshipOdds: 70000 },
    { teamId: 'minnesota-timberwolves', winTotal: 48.5, championshipOdds: 2500 },
    { teamId: 'new-orleans-pelicans', winTotal: 27.5, championshipOdds: 40000 },
    { teamId: 'new-york-knicks', winTotal: 52.5, championshipOdds: 900 },
    { teamId: 'oklahoma-city-thunder', winTotal: 60.5, championshipOdds: 270 },
    { teamId: 'orlando-magic', winTotal: 43.5, championshipOdds: 8000 },
    { teamId: 'philadelphia-76ers', winTotal: 50.5, championshipOdds: 900 },
    { teamId: 'phoenix-suns', winTotal: 38.5, championshipOdds: 12000 },
    { teamId: 'portland-trail-blazers', winTotal: 43.5, championshipOdds: 8000 },
    { teamId: 'sacramento-kings', winTotal: 21.5, championshipOdds: 100000 },
    { teamId: 'san-antonio-spurs', winTotal: 59.5, championshipOdds: 270 },
    { teamId: 'toronto-raptors', winTotal: 45.5, championshipOdds: 2500 },
    { teamId: 'utah-jazz', winTotal: 35.5, championshipOdds: 20000 },
    { teamId: 'washington-wizards', winTotal: 35.5, championshipOdds: 15000 },
  ],
};
