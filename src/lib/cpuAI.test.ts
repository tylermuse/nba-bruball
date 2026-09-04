import { describe, expect, it } from 'vitest';
import { homerAdjustedPoints, softmaxSample, strategyScore, type CpuProfile } from './cpuAI';
import type { TeamValuation } from './valuation';

function team(teamId: string, points: number, division = 'Atlantic'): TeamValuation {
  return {
    teamId,
    division: division as TeamValuation['division'],
    winTotal: points,
    title: 0,
    pFirstRound: 0,
    pConfSemifinals: 0,
    pConfFinals: 0,
    points,
  };
}

describe('homerAdjustedPoints', () => {
  it('adds 2.5 only for the homer team', () => {
    const profile: CpuProfile = { strategy: 'chalk', tau: 1, homerTeamId: 'a' };
    expect(homerAdjustedPoints(team('a', 10), profile)).toBe(12.5);
    expect(homerAdjustedPoints(team('b', 10), profile)).toBe(10);
  });
});

describe('strategyScore', () => {
  it('chalk just returns points (plus any homer bonus)', () => {
    const profile: CpuProfile = { strategy: 'chalk', tau: 1 };
    expect(strategyScore(team('a', 10), profile, [], false)).toBe(10);
  });

  it('scarcity rewards a steep drop-off in the division', () => {
    const profile: CpuProfile = { strategy: 'scarcity', tau: 1 };
    const top = team('a', 15);
    const mates = [top, team('b', 5), team('c', 4)];
    // v + 0.8 * (v - min) = 15 + 0.8 * (15 - 4) = 23.8
    expect(strategyScore(top, profile, mates, false)).toBeCloseTo(23.8, 6);
  });

  it('scarcity gives a flat division no bonus', () => {
    const profile: CpuProfile = { strategy: 'scarcity', tau: 1 };
    const flat = [team('a', 10), team('b', 10), team('c', 10)];
    expect(strategyScore(flat[0], profile, flat, false)).toBeCloseTo(10, 6);
  });

  it('blocker multiplies by 1.5 only when the next drafter could also take it', () => {
    const profile: CpuProfile = { strategy: 'blocker', tau: 1 };
    const t = team('a', 10);
    expect(strategyScore(t, profile, [t], true)).toBeCloseTo(15, 6);
    expect(strategyScore(t, profile, [t], false)).toBeCloseTo(10, 6);
  });
});

describe('softmaxSample', () => {
  it('is deterministic for a single candidate', () => {
    expect(softmaxSample([{ teamId: 'only', value: 5 }], 1, () => 0.5)).toBe('only');
  });

  it('rand()=0 always returns the first candidate (start of the cumulative distribution)', () => {
    const candidates = [
      { teamId: 'high', value: 20 },
      { teamId: 'low', value: 1 },
    ];
    expect(softmaxSample(candidates, 1, () => 0)).toBe('high');
  });

  it('picks the top team overwhelmingly more often at low TAU over many draws', () => {
    const candidates = [
      { teamId: 'top', value: 13 },
      { teamId: 'mid', value: 11 },
      { teamId: 'low', value: 9 },
    ];
    let topCount = 0;
    const N = 2000;
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < N; i++) {
      if (softmaxSample(candidates, 0.3, rand) === 'top') topCount++;
    }
    expect(topCount / N).toBeGreaterThan(0.85);
  });

  it('spreads picks out more at high TAU than low TAU', () => {
    const candidates = [
      { teamId: 'top', value: 13 },
      { teamId: 'mid', value: 11 },
      { teamId: 'low', value: 9 },
    ];
    const countTop = (tau: number) => {
      let seed2 = 7;
      const r2 = () => {
        seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff;
        return seed2 / 0x7fffffff;
      };
      let top = 0;
      for (let i = 0; i < 2000; i++) if (softmaxSample(candidates, tau, r2) === 'top') top++;
      return top;
    };
    expect(countTop(0.3)).toBeGreaterThan(countTop(2.0));
  });
});
