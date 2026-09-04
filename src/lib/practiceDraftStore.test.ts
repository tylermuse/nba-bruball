import { describe, expect, it } from 'vitest';
import { TEAMS } from '../data/teams';
import { VALUATION_BOARD_2026 } from './valuation';
import { ALL_DIVISIONS } from './draftReservations';
import {
  DEFAULT_MEMBERS,
  ROUNDS,
  contestedTeamsFor,
  makeCpuPick,
  makePick,
  onTheClock,
  picksByMember,
  reservedDivisions,
  rosterValuation,
  setMemberIsCpu,
  startDraft,
  undoLastPick,
  type PracticeDraftState,
  type PracticeMember,
} from './practiceDraftStore';

function freshActive(members: PracticeMember[] = DEFAULT_MEMBERS): PracticeDraftState {
  return startDraft({
    status: 'setup',
    members,
    order: members.map((m) => m.id),
    picks: [],
    startedAt: null,
  });
}

describe('snake order', () => {
  it('goes in order round 1, reverses round 2', () => {
    const state = freshActive();
    let s = state;
    const seen: string[] = [];
    for (let i = 0; i < state.order.length; i++) {
      const who = onTheClock(s)!;
      seen.push(who);
      const team = contestedTeamsFor(s, who)[0];
      s = makePick(s, team.id);
    }
    expect(seen).toEqual(state.order);
    expect(onTheClock(s)).toBe(state.order[state.order.length - 1]);
  });
});

describe('reservedDivisions / autoResolveForced', () => {
  it('auto-completes the draft with 6 teams per member, one per division, 30 unique teams', () => {
    let state = freshActive();
    let guard = 0;
    while (state.status === 'active' && guard < 100) {
      guard++;
      const who = onTheClock(state)!;
      const candidates = contestedTeamsFor(state, who);
      if (!candidates.length) break;
      state = makePick(state, candidates[0].id);
    }
    expect(state.status).toBe('complete');
    state.members.forEach((m) => {
      const picks = picksByMember(state, m.id);
      expect(picks).toHaveLength(ROUNDS);
      const divisions = new Set(picks.map((p) => TEAMS.find((t) => t.id === p.teamId)?.division));
      expect(divisions.size).toBe(ALL_DIVISIONS.length);
    });
    expect(new Set(state.picks.map((p) => p.teamId)).size).toBe(30);
  });

  it('never leaves a member with a single-option division on the contested board', () => {
    let state = freshActive();
    let guard = 0;
    while (state.status === 'active' && guard < 100) {
      guard++;
      const who = onTheClock(state)!;
      const board = contestedTeamsFor(state, who);
      const byDivision = new Map<string, number>();
      board.forEach((t) => byDivision.set(t.division, (byDivision.get(t.division) ?? 0) + 1));
      byDivision.forEach((count) => expect(count).not.toBe(1));
      if (!board.length) break;
      state = makePick(state, board[0].id);
    }
  });
});

describe('undoLastPick', () => {
  it('removes exactly the last pick and reopens a completed draft', () => {
    let state = freshActive();
    while (state.status === 'active') {
      const who = onTheClock(state)!;
      const candidates = contestedTeamsFor(state, who);
      state = makePick(state, candidates[0].id);
    }
    const before = state.picks.length;
    state = undoLastPick(state);
    expect(state.picks.length).toBe(before - 1);
    expect(state.status).toBe('active');
  });
});

describe('CPU picks', () => {
  it('a CPU manager always makes legal picks and the draft completes cleanly', () => {
    let state = freshActive();
    state = setMemberIsCpu(state, 'austin', true, () => 0.2);
    state = setMemberIsCpu(state, 'seth', true, () => 0.8);
    let guard = 0;
    while (state.status === 'active' && guard < 100) {
      guard++;
      const who = onTheClock(state)!;
      const member = state.members.find((m) => m.id === who)!;
      if (member.isCpu) {
        state = makeCpuPick(state, VALUATION_BOARD_2026, () => 0.5);
      } else {
        const candidates = contestedTeamsFor(state, who);
        state = makePick(state, candidates[0].id);
      }
    }
    expect(state.status).toBe('complete');
    expect(new Set(state.picks.map((p) => p.teamId)).size).toBe(30);
  });
});

describe('rosterValuation', () => {
  it('sums points and title share across a roster', () => {
    let state = freshActive();
    const who = onTheClock(state)!;
    const team = contestedTeamsFor(state, who)[0];
    state = makePick(state, team.id);
    const { points, title } = rosterValuation(state, who, VALUATION_BOARD_2026);
    const expected = VALUATION_BOARD_2026.byId[team.id];
    expect(points).toBeCloseTo(expected.points, 6);
    expect(title).toBeCloseTo(expected.title, 6);
  });
});

describe('reservedDivisions', () => {
  it('is empty at the start of a fresh draft', () => {
    expect(reservedDivisions(freshActive())).toEqual([]);
  });
});
