import { describe, it, expect } from 'vitest';
import {
  buildSnakeOrder,
  getSlotForPick,
  getPicksForSlot,
  getTeamsPerMember,
  getTotalPicks,
  getAvailableTeams,
  isValidLeagueSize,
} from './draft';
import { TEAMS, TEAM_COUNT } from '../data/teams';

describe('league sizes', () => {
  it('accepts only 5 and 6', () => {
    expect(isValidLeagueSize(5)).toBe(true);
    expect(isValidLeagueSize(6)).toBe(true);
    expect(isValidLeagueSize(4)).toBe(false);
    expect(isValidLeagueSize(8)).toBe(false);
    expect(isValidLeagueSize(10)).toBe(false);
  });

  it('divides all 30 teams evenly', () => {
    expect(getTeamsPerMember(5)).toBe(6);
    expect(getTeamsPerMember(6)).toBe(5);
    expect(getTeamsPerMember(5) * 5).toBe(TEAM_COUNT);
    expect(getTeamsPerMember(6) * 6).toBe(TEAM_COUNT);
  });

  it('always drafts every team', () => {
    expect(getTotalPicks(5)).toBe(30);
    expect(getTotalPicks(6)).toBe(30);
  });
});

describe('snake order — 6 players × 5 teams', () => {
  const order = buildSnakeOrder(6);

  it('has 30 picks', () => {
    expect(order).toHaveLength(30);
  });

  it('numbers picks sequentially', () => {
    order.forEach((pick, i) => expect(pick.pickNumber).toBe(i + 1));
  });

  it('runs round 1 forward and round 2 backward', () => {
    const round1 = order.slice(0, 6).map((p) => p.draftSlot);
    const round2 = order.slice(6, 12).map((p) => p.draftSlot);
    expect(round1).toEqual([1, 2, 3, 4, 5, 6]);
    expect(round2).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('gives the turn twice in a row at the snake point', () => {
    expect(order[5].draftSlot).toBe(6); // pick 6
    expect(order[6].draftSlot).toBe(6); // pick 7
  });

  it('gives every member exactly 5 picks', () => {
    for (let slot = 1; slot <= 6; slot += 1) {
      expect(getPicksForSlot(slot, 6)).toHaveLength(5);
    }
  });

  it('gives slot 1 picks 1, 12, 13, 24, 25', () => {
    expect(getPicksForSlot(1, 6)).toEqual([1, 12, 13, 24, 25]);
  });
});

describe('snake order — 5 players × 6 teams', () => {
  const order = buildSnakeOrder(5);

  it('has 30 picks', () => {
    expect(order).toHaveLength(30);
  });

  it('runs round 1 forward and round 2 backward', () => {
    expect(order.slice(0, 5).map((p) => p.draftSlot)).toEqual([1, 2, 3, 4, 5]);
    expect(order.slice(5, 10).map((p) => p.draftSlot)).toEqual([5, 4, 3, 2, 1]);
  });

  it('gives every member exactly 6 picks', () => {
    for (let slot = 1; slot <= 5; slot += 1) {
      expect(getPicksForSlot(slot, 5)).toHaveLength(6);
    }
  });

  it('ends the draft with slot 1 (even final round)', () => {
    expect(order[29].draftSlot).toBe(1);
  });
});

describe('getSlotForPick', () => {
  it('matches buildSnakeOrder for every pick in both sizes', () => {
    ([5, 6] as const).forEach((size) => {
      buildSnakeOrder(size).forEach((pick) => {
        expect(getSlotForPick(pick.pickNumber, size)).toBe(pick.draftSlot);
      });
    });
  });

  it('rejects out-of-range picks', () => {
    expect(() => getSlotForPick(0, 6)).toThrow();
    expect(() => getSlotForPick(31, 6)).toThrow();
  });
});

describe('snake fairness', () => {
  it('balances total draft capital across slots', () => {
    // Sum of pick numbers should be near-identical for each slot in a snake.
    ([5, 6] as const).forEach((size) => {
      const totals: number[] = [];
      for (let slot = 1; slot <= size; slot += 1) {
        totals.push(getPicksForSlot(slot, size).reduce((a, b) => a + b, 0));
      }
      const spread = Math.max(...totals) - Math.min(...totals);
      // Snake drafts aren't perfectly equal, but should be tightly clustered.
      expect(spread).toBeLessThanOrEqual(size);
    });
  });
});

describe('team availability', () => {
  const allIds = TEAMS.map((t) => t.id);

  it('starts with all 30 teams on the board', () => {
    expect(getAvailableTeams(allIds, [])).toHaveLength(30);
  });

  it('removes drafted teams', () => {
    const available = getAvailableTeams(allIds, ['boston-celtics', 'miami-heat']);
    expect(available).toHaveLength(28);
    expect(available).not.toContain('boston-celtics');
    expect(available).not.toContain('miami-heat');
  });

  it('empties the board once every team is drafted', () => {
    expect(getAvailableTeams(allIds, allIds)).toHaveLength(0);
  });
});
