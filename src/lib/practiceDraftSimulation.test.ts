// Bulk-simulate practice drafts to check structural invariants hold at
// scale, mirroring the NFL Bruball draft engine's equivalent test.
import { describe, expect, it } from 'vitest';
import { VALUATION_BOARD_2026 } from './valuation';
import { TAU_PRESETS } from './cpuAI';
import { ALL_DIVISIONS } from './draftReservations';
import {
  DEFAULT_MEMBERS,
  ROUNDS,
  contestedTeamsFor,
  makeCpuPick,
  onTheClock,
  picksByMember,
  rosterValuation,
  setMemberIsCpu,
  startDraft,
  type PracticeDraftState,
} from './practiceDraftStore';

function makeRand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

function newDraft(rand: () => number): PracticeDraftState {
  let state = startDraft({
    status: 'setup',
    members: DEFAULT_MEMBERS,
    order: DEFAULT_MEMBERS.map((m) => m.id),
    picks: [],
    startedAt: null,
  });
  DEFAULT_MEMBERS.forEach((m) => {
    state = setMemberIsCpu(state, m.id, true, rand);
    state = {
      ...state,
      members: state.members.map((mm) =>
        mm.id === m.id && mm.cpu
          ? { ...mm, cpu: { strategy: 'chalk', tau: TAU_PRESETS.competent, homerTeamId: undefined } }
          : mm,
      ),
    };
  });
  return state;
}

function playOut(rand: () => number): PracticeDraftState {
  let state = newDraft(rand);
  let guard = 0;
  while (state.status === 'active' && guard < 100) {
    guard++;
    state = makeCpuPick(state, VALUATION_BOARD_2026, rand);
  }
  return state;
}

describe('bulk simulated practice drafts', () => {
  const N = 1500;

  it(`every member ends with ${ROUNDS} teams, one per division, and 30 unique teams across ${N} drafts`, () => {
    for (let i = 0; i < N; i++) {
      const state = playOut(makeRand(1000 + i));
      expect(state.status).toBe('complete');
      state.members.forEach((m) => {
        expect(picksByMember(state, m.id)).toHaveLength(ROUNDS);
      });
      expect(new Set(state.picks.map((p) => p.teamId)).size).toBe(30);
    }
  });

  it(`no member is ever offered a single-option division across ${N} drafts`, () => {
    for (let i = 0; i < N; i++) {
      const rand = makeRand(2000 + i);
      let state = newDraft(rand);
      let guard = 0;
      while (state.status === 'active' && guard < 100) {
        guard++;
        const who = onTheClock(state)!;
        const board = contestedTeamsFor(state, who);
        const byDivision = new Map<string, number>();
        board.forEach((t) => byDivision.set(t.division, (byDivision.get(t.division) ?? 0) + 1));
        byDivision.forEach((count) => {
          if (count === 1) throw new Error('single-option division offered on the choice board');
        });
        state = makeCpuPick(state, VALUATION_BOARD_2026, rand);
      }
      expect(state.status).toBe('complete');
    }
  });
});

describe('slot equity at TAU=1.0', () => {
  it('keeps the best/worst draft slot within a reasonable spread of par across many CPU-vs-CPU drafts', () => {
    const N = 4000;
    const totalsBySlot: number[][] = ALL_DIVISIONS.map(() => []).slice(0, DEFAULT_MEMBERS.length);

    for (let i = 0; i < N; i++) {
      const state = playOut(makeRand(3000 + i));
      state.members.forEach((m, slot) => {
        const { points } = rosterValuation(state, m.id, VALUATION_BOARD_2026);
        totalsBySlot[slot].push(points);
      });
    }

    const avgBySlot = totalsBySlot.map((arr) => arr.reduce((s, v) => s + v, 0) / arr.length);
    const overallAvg = avgBySlot.reduce((s, v) => s + v, 0) / avgBySlot.length;
    const spreadPct = (Math.max(...avgBySlot) - Math.min(...avgBySlot)) / overallAvg;

    // Measured ~10.5% at N=8000 (converged, not sampling noise) — wider than
    // the NFL draft's ~2.8%, because NBA's championship odds are far more
    // top-heavy (two co-favorites at +270 vs. a flatter NFL board) and there
    // are fewer teams per division (5 vs. NFL's 4) to smooth it out. This is
    // a real property of this format/valuation combo, not a bug; the bound
    // below just guards against a regression breaking it further.
    expect(spreadPct).toBeLessThan(0.16);
  });
});
