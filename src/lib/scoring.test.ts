import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCORING,
  CHAMPIONSHIP_RUN_POINTS,
  getRegularSeasonPoints,
  getPlayoffPoints,
  getTeamPoints,
  getRosterPoints,
  getRosterBreakdown,
  getPointsAtStake,
  type PlayoffResults,
  type ScoringConfig,
  type StandingsMap,
} from './scoring';

describe('regular season scoring', () => {
  it('awards 1 point per win', () => {
    expect(getRegularSeasonPoints({ wins: 50, losses: 32 })).toBe(50);
  });

  it('ignores losses entirely', () => {
    expect(getRegularSeasonPoints({ wins: 20, losses: 62 })).toBe(20);
  });

  it('handles a team with no games played', () => {
    expect(getRegularSeasonPoints({ wins: 0, losses: 0 })).toBe(0);
  });

  it('returns 0 for a missing record rather than throwing', () => {
    expect(getRegularSeasonPoints(null)).toBe(0);
    expect(getRegularSeasonPoints(undefined)).toBe(0);
  });

  it('has no concept of ties (NBA has none)', () => {
    // A full 82-game season is always wins + losses.
    const record = { wins: 41, losses: 41 };
    expect(record.wins + record.losses).toBe(82);
    expect(getRegularSeasonPoints(record)).toBe(41);
  });

  it('respects a custom win weight', () => {
    const config: ScoringConfig = { ...DEFAULT_SCORING, winPoints: 0.25 };
    expect(getRegularSeasonPoints({ wins: 60, losses: 22 }, config)).toBe(15);
  });
});

describe('playoff scoring — per series won', () => {
  it('awards nothing for the play-in', () => {
    expect(getPlayoffPoints({ playIn: 1 })).toBe(0);
  });

  it('awards 4 for a first-round series win', () => {
    expect(getPlayoffPoints({ firstRound: 1 })).toBe(4);
  });

  it('awards 7 for a conference semifinal win', () => {
    expect(getPlayoffPoints({ confSemifinals: 1 })).toBe(7);
  });

  it('awards 11 for a conference finals win', () => {
    expect(getPlayoffPoints({ confFinals: 1 })).toBe(11);
  });

  it('awards 16 for winning the NBA Finals', () => {
    expect(getPlayoffPoints({ finals: 1 })).toBe(16);
  });

  it('totals 38 for a full championship run', () => {
    const champion = {
      firstRound: 1,
      confSemifinals: 1,
      confFinals: 1,
      finals: 1,
    };
    expect(getPlayoffPoints(champion)).toBe(38);
    expect(CHAMPIONSHIP_RUN_POINTS).toBe(38);
  });

  it('gives the runner-up 22 (title run minus the finals)', () => {
    const runnerUp = { firstRound: 1, confSemifinals: 1, confFinals: 1 };
    expect(getPlayoffPoints(runnerUp)).toBe(22);
  });

  it('gives a conference finalist 11', () => {
    expect(getPlayoffPoints({ firstRound: 1, confSemifinals: 1 })).toBe(11);
  });

  it('scores a play-in team that then wins a round the same as any 8 seed', () => {
    expect(getPlayoffPoints({ playIn: 1, firstRound: 1 })).toBe(4);
  });

  it('awards nothing to a team that loses in the first round', () => {
    expect(getPlayoffPoints({})).toBe(0);
    expect(getPlayoffPoints(null)).toBe(0);
  });

  it('escalates strictly by round', () => {
    const { seriesPoints } = DEFAULT_SCORING;
    expect(seriesPoints.playIn).toBeLessThan(seriesPoints.firstRound);
    expect(seriesPoints.firstRound).toBeLessThan(seriesPoints.confSemifinals);
    expect(seriesPoints.confSemifinals).toBeLessThan(seriesPoints.confFinals);
    expect(seriesPoints.confFinals).toBeLessThan(seriesPoints.finals);
  });

  it('respects a custom series table', () => {
    const config: ScoringConfig = {
      winPoints: 1,
      seriesPoints: {
        playIn: 1,
        firstRound: 2,
        confSemifinals: 4,
        confFinals: 6,
        finals: 10,
      },
    };
    expect(getPlayoffPoints({ firstRound: 1, confSemifinals: 1 }, config)).toBe(6);
  });
});

describe('team + roster totals', () => {
  const standings: StandingsMap = {
    'boston-celtics': { wins: 60, losses: 22 },
    'los-angeles-lakers': { wins: 45, losses: 37 },
    'washington-wizards': { wins: 18, losses: 64 },
  };

  const playoffs: PlayoffResults = {
    'boston-celtics': {
      firstRound: 1,
      confSemifinals: 1,
      confFinals: 1,
      finals: 1,
    },
    'los-angeles-lakers': { playIn: 1, firstRound: 1 },
  };

  it('combines regular season and playoff points for a team', () => {
    // 60 wins + 38 championship run
    expect(getTeamPoints('boston-celtics', standings, playoffs)).toBe(98);
  });

  it('scores a play-in team that wins one round', () => {
    // 45 wins + 4 first round (play-in worth 0)
    expect(getTeamPoints('los-angeles-lakers', standings, playoffs)).toBe(49);
  });

  it('scores a non-playoff team on wins alone', () => {
    expect(getTeamPoints('washington-wizards', standings, playoffs)).toBe(18);
  });

  it('returns 0 for an unknown team', () => {
    expect(getTeamPoints('not-a-team', standings, playoffs)).toBe(0);
  });

  it('sums a roster', () => {
    const roster = ['boston-celtics', 'los-angeles-lakers', 'washington-wizards'];
    // 98 + 49 + 18
    expect(getRosterPoints(roster, standings, playoffs)).toBe(165);
  });

  it('handles missing playoff data (mid regular season)', () => {
    const roster = ['boston-celtics', 'washington-wizards'];
    expect(getRosterPoints(roster, standings, null)).toBe(78);
  });

  it('produces a per-team breakdown that sums to the roster total', () => {
    const roster = ['boston-celtics', 'los-angeles-lakers', 'washington-wizards'];
    const breakdown = getRosterBreakdown(roster, standings, playoffs);

    expect(breakdown).toHaveLength(3);
    expect(breakdown[0]).toEqual({
      teamId: 'boston-celtics',
      wins: 60,
      losses: 22,
      regularSeasonPoints: 60,
      playoffPoints: 38,
      totalPoints: 98,
    });

    const summed = breakdown.reduce((sum, row) => sum + row.totalPoints, 0);
    expect(summed).toBe(getRosterPoints(roster, standings, playoffs));
  });
});

describe('points at stake', () => {
  it('reports the value of winning the current series', () => {
    expect(getPointsAtStake('firstRound')).toBe(4);
    expect(getPointsAtStake('finals')).toBe(16);
    expect(getPointsAtStake('playIn')).toBe(0);
  });
});

describe('game balance', () => {
  it('makes a title run worth about a strong team’s whole regular season', () => {
    const strongTeamSeason = getRegularSeasonPoints({ wins: 40, losses: 42 });
    // Within a few points of 40 — the calibration the design depends on.
    expect(Math.abs(CHAMPIONSHIP_RUN_POINTS - strongTeamSeason)).toBeLessThanOrEqual(5);
  });

  it('keeps a deep run meaningful but not larger than a full roster season', () => {
    // A 6-player league roster of 5 teams averaging 41 wins ≈ 205 points.
    const typicalRoster = 5 * 41;
    expect(CHAMPIONSHIP_RUN_POINTS).toBeLessThan(typicalRoster * 0.25);
  });
});
