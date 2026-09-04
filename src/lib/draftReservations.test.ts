import { describe, expect, it } from 'vitest';
import { TEAMS } from '../data/teams';
import {
  ALL_DIVISIONS,
  divisionsOwnedBy,
  isFullyForced,
  nextForcedPick,
  reservedForMember,
  reservedTeams,
} from './draftReservations';
import type { DraftBoardPick } from './draftApi';
import type { LeagueMember } from './types';

function member(id: string, draftSlot: number): LeagueMember {
  return { id, leagueId: 'league-1', profileId: id, role: 'member', teamName: id, draftSlot };
}

function pick(memberId: string, teamId: string, pickNumber: number): DraftBoardPick {
  return {
    pickNumber,
    round: Math.ceil(pickNumber / 5),
    memberId,
    teamName: memberId,
    draftSlot: null,
    teamId,
    pickedAt: new Date().toISOString(),
  };
}

const MEMBERS = ['a', 'b', 'c', 'd', 'e'].map((id, i) => member(id, i + 1));

describe('ALL_DIVISIONS', () => {
  it('has 6 divisions covering all 30 teams, 5 each', () => {
    expect(ALL_DIVISIONS).toHaveLength(6);
    ALL_DIVISIONS.forEach((d) => {
      expect(TEAMS.filter((t) => t.division === d)).toHaveLength(5);
    });
  });
});

describe('reservedTeams', () => {
  it('is empty with no picks', () => {
    expect(reservedTeams([], MEMBERS)).toEqual([]);
  });

  it('reserves the last team in a division for the one member who has not locked it', () => {
    const division = ALL_DIVISIONS[0];
    const divisionTeams = TEAMS.filter((t) => t.division === division);
    // a, b, c, d each take one team from this division; e is left out.
    const picks: DraftBoardPick[] = divisionTeams
      .slice(0, 4)
      .map((t, i) => pick(MEMBERS[i].id, t.id, i + 1));

    const reserved = reservedTeams(picks, MEMBERS);
    const entry = reserved.find((r) => r.division === division);
    expect(entry).toBeDefined();
    expect(entry?.memberId).toBe('e');
    expect(entry?.teamId).toBe(divisionTeams[4].id);
  });

  it('does not reserve a division with more than one team left', () => {
    const division = ALL_DIVISIONS[0];
    const divisionTeams = TEAMS.filter((t) => t.division === division);
    const picks: DraftBoardPick[] = divisionTeams
      .slice(0, 2)
      .map((t, i) => pick(MEMBERS[i].id, t.id, i + 1));
    expect(reservedTeams(picks, MEMBERS).find((r) => r.division === division)).toBeUndefined();
  });
});

describe('isFullyForced / nextForcedPick', () => {
  it('is false while at least one division is still contested', () => {
    expect(isFullyForced([], MEMBERS, 'a')).toBe(false);
  });

  it('is true once every remaining open division is reserved for that member', () => {
    // Give member "e" all 6 divisions reserved by draining every other
    // division down to its last team via a,b,c,d, and locking e out of
    // nothing themselves (they own 0 divisions).
    const picks: DraftBoardPick[] = [];
    let pickNumber = 1;
    ALL_DIVISIONS.forEach((division) => {
      const teams = TEAMS.filter((t) => t.division === division);
      teams.slice(0, 4).forEach((t, i) => {
        picks.push(pick(MEMBERS[i].id, t.id, pickNumber++));
      });
    });

    expect(isFullyForced(picks, MEMBERS, 'e')).toBe(true);
    const forced = nextForcedPick(picks, MEMBERS, 'e');
    expect(forced).not.toBeNull();
    expect(forced?.memberId).toBe('e');
    expect(divisionsOwnedBy(picks, 'e').size).toBe(0);
  });

  it('reservedForMember only returns entries for that member', () => {
    const division = ALL_DIVISIONS[1];
    const teams = TEAMS.filter((t) => t.division === division);
    const picks: DraftBoardPick[] = teams.slice(0, 4).map((t, i) => pick(MEMBERS[i].id, t.id, i + 1));
    expect(reservedForMember(picks, MEMBERS, 'e')).toHaveLength(1);
    expect(reservedForMember(picks, MEMBERS, 'a')).toHaveLength(0);
  });
});
