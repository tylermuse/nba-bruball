/**
 * Reserved-division detection — ported from the NFL Bruball draft-engine
 * spec's §1/§3.2 invariant, generalized from 8 divisions/4 teams/4 managers
 * to NBA's 6 divisions/5 teams/5 managers (5-player, one-per-division
 * leagues only; see `make_pick_internal`'s `l.size = 5` gate server-side).
 *
 * Invariant: if a division has exactly one available team left, the other
 * (size - 1) teams are necessarily held by (size - 1) distinct managers, so
 * that team can only ever go to whichever single manager hasn't locked the
 * division yet. Pure functions over already-fetched draft state — no
 * network calls, no schema changes. The server's `make_pick` still owns
 * the actual authorization; this only decides what the UI should present
 * as a live "choice" versus something already decided.
 */
import { TEAMS, DIVISIONS, getTeamById, type Division } from '../data/teams';
import type { DraftBoardPick } from './draftApi';
import type { LeagueMember } from './types';

export const ALL_DIVISIONS: Division[] = [...DIVISIONS.East, ...DIVISIONS.West];

export interface ReservedTeam {
  division: Division;
  teamId: string;
  memberId: string;
}

export function divisionsOwnedBy(picks: DraftBoardPick[], memberId: string): Set<Division> {
  const owned = new Set<Division>();
  picks.forEach((p) => {
    if (p.memberId !== memberId) return;
    const team = getTeamById(p.teamId);
    if (team) owned.add(team.division);
  });
  return owned;
}

export function reservedTeams(
  picks: DraftBoardPick[],
  members: LeagueMember[],
): ReservedTeam[] {
  const taken = new Set(picks.map((p) => p.teamId));
  const result: ReservedTeam[] = [];

  ALL_DIVISIONS.forEach((division) => {
    const available = TEAMS.filter((t) => t.division === division && !taken.has(t.id));
    if (available.length !== 1) return;
    const openMembers = members.filter((m) => !divisionsOwnedBy(picks, m.id).has(division));
    if (openMembers.length === 1) {
      result.push({ division, teamId: available[0].id, memberId: openMembers[0].id });
    }
  });

  return result;
}

export function reservedForMember(
  picks: DraftBoardPick[],
  members: LeagueMember[],
  memberId: string,
): ReservedTeam[] {
  return reservedTeams(picks, members).filter((r) => r.memberId === memberId);
}

/** True once every remaining open division for this member is reserved — no real choice left. */
export function isFullyForced(
  picks: DraftBoardPick[],
  members: LeagueMember[],
  memberId: string,
): boolean {
  const owned = divisionsOwnedBy(picks, memberId);
  const openDivisions = ALL_DIVISIONS.filter((d) => !owned.has(d));
  if (openDivisions.length === 0) return false;
  const reserved = reservedTeams(picks, members);
  return openDivisions.every((d) =>
    reserved.some((r) => r.division === d && r.memberId === memberId),
  );
}

/** The single reserved pick this member should auto-claim next, if any. */
export function nextForcedPick(
  picks: DraftBoardPick[],
  members: LeagueMember[],
  memberId: string,
): ReservedTeam | null {
  if (!isFullyForced(picks, members, memberId)) return null;
  const owned = divisionsOwnedBy(picks, memberId);
  const nextDivision = ALL_DIVISIONS.find((d) => !owned.has(d));
  const reserved = reservedTeams(picks, members);
  return reserved.find((r) => r.division === nextDivision && r.memberId === memberId) ?? null;
}
