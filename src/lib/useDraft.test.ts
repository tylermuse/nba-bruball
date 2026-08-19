import { describe, it, expect } from 'vitest';
import { getUpcomingPicks } from './useDraft';
import { getSlotForPick } from './draft';
import type { LeagueMember } from './types';

function makeMembers(size: number): LeagueMember[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `m${i + 1}`,
    leagueId: 'l1',
    profileId: `p${i + 1}`,
    role: i === 0 ? ('commissioner' as const) : ('member' as const),
    teamName: `Player ${i + 1}`,
    draftSlot: i + 1,
  }));
}

describe('getUpcomingPicks', () => {
  it('lists the next few picks in snake order for a 6-player league', () => {
    const members = makeMembers(6);
    const upcoming = getUpcomingPicks(5, 6, members, 4);
    expect(upcoming.map((u) => u.pickNumber)).toEqual([5, 6, 7, 8]);
    // Round 1 ends 5,6 then round 2 reverses: 6,5
    expect(upcoming.map((u) => u.member?.draftSlot)).toEqual([5, 6, 6, 5]);
  });

  it('shows the back-to-back turn at the snake point', () => {
    const members = makeMembers(6);
    const upcoming = getUpcomingPicks(6, 6, members, 2);
    expect(upcoming[0].member?.id).toBe(upcoming[1].member?.id);
  });

  it('handles a 5-player league', () => {
    const members = makeMembers(5);
    const upcoming = getUpcomingPicks(1, 5, members, 5);
    expect(upcoming.map((u) => u.member?.draftSlot)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not run past the final pick', () => {
    const members = makeMembers(6);
    const upcoming = getUpcomingPicks(29, 6, members, 4);
    expect(upcoming.map((u) => u.pickNumber)).toEqual([29, 30]);
  });

  it('returns nothing once the draft is over', () => {
    expect(getUpcomingPicks(31, 6, makeMembers(6), 4)).toEqual([]);
  });

  it('tolerates members whose slots are not set yet', () => {
    const members = makeMembers(6).map((m) => ({ ...m, draftSlot: null }));
    const upcoming = getUpcomingPicks(1, 6, members, 2);
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].member).toBeNull();
  });
});

describe('snake order agrees with the database formula', () => {
  // Mirrors public.slot_for_pick(pick_number, league_size) in 0003_draft.sql.
  const slotSql = (pick: number, size: number) => {
    const round = Math.ceil(pick / size);
    return round % 2 === 0 ? size - ((pick - 1) % size) : ((pick - 1) % size) + 1;
  };

  it('matches for every pick in both league sizes', () => {
    ([5, 6] as const).forEach((size) => {
      for (let pick = 1; pick <= 30; pick += 1) {
        expect(getSlotForPick(pick, size)).toBe(slotSql(pick, size));
      }
    });
  });
});
