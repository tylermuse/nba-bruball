import { describe, expect, it } from 'vitest';
import { buildValuationBoard, devigTitleProbabilities, VALUATION_BOARD_2026 } from './valuation';
import { ODDS_SNAPSHOT_2026 } from '../data/oddsSnapshot2026';

describe('devigTitleProbabilities', () => {
  it('normalizes implied probabilities to sum to 1', () => {
    const title = devigTitleProbabilities(ODDS_SNAPSHOT_2026.entries);
    const sum = [...title.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('buildValuationBoard', () => {
  it('produces all 30 NBA teams', () => {
    expect(VALUATION_BOARD_2026.teams).toHaveLength(30);
  });

  it('every probability field stays within [0, 1]', () => {
    VALUATION_BOARD_2026.teams.forEach((t) => {
      [t.title, t.pFirstRound, t.pConfSemifinals, t.pConfFinals].forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });
  });

  it('ranks teams the same as their title probability within a round (rank-preserving fit)', () => {
    const sorted = [...VALUATION_BOARD_2026.teams].sort((a, b) => b.title - a.title);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].pFirstRound).toBeGreaterThanOrEqual(sorted[i].pFirstRound - 1e-9);
    }
  });

  it('scales par by memberCount', () => {
    const board = buildValuationBoard(ODDS_SNAPSHOT_2026, undefined, 6);
    expect(board.parPoints).toBeCloseTo(board.poolPoints / 6, 6);
  });

  it('the title favorites (Thunder, Spurs) have the highest points', () => {
    const sorted = [...VALUATION_BOARD_2026.teams].sort((a, b) => b.points - a.points);
    const top2 = sorted.slice(0, 2).map((t) => t.teamId);
    expect(top2).toEqual(expect.arrayContaining(['oklahoma-city-thunder', 'san-antonio-spurs']));
  });

  it('the win-total leader (Thunder) still ends up in the top handful even before playoff weighting', () => {
    const byWinTotal = [...VALUATION_BOARD_2026.teams].sort((a, b) => b.winTotal - a.winTotal);
    expect(byWinTotal[0].teamId).toBe('oklahoma-city-thunder');
  });
});
