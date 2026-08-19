/**
 * Snake draft order for NBA Bruball.
 *
 * League sizes are 5 or 6 — both divide the 30 NBA teams evenly:
 *   6 players × 5 teams each, or 5 players × 6 teams each.
 */

import { TEAM_COUNT } from '../data/teams';

export type LeagueSize = 5 | 6;

export const VALID_LEAGUE_SIZES: LeagueSize[] = [5, 6];

export function isValidLeagueSize(size: number): size is LeagueSize {
  return VALID_LEAGUE_SIZES.includes(size as LeagueSize);
}

/** How many teams each member ends up with. */
export function getTeamsPerMember(size: LeagueSize): number {
  return TEAM_COUNT / size;
}

/** Total picks in a completed draft — always 30, since every team is drafted. */
export function getTotalPicks(size: LeagueSize): number {
  return getTeamsPerMember(size) * size;
}

export interface DraftSlotAssignment {
  /** 1-based overall pick number. */
  pickNumber: number;
  /** 1-based round. */
  round: number;
  /** 1-based draft slot of the member who owns this pick. */
  draftSlot: number;
}

/**
 * Build the full snake order.
 *
 * Round 1 goes 1→N, round 2 goes N→1, and so on. For a 6-player league that's
 * pick 1 → slot 1, pick 6 → slot 6, pick 7 → slot 6, pick 12 → slot 1, ...
 */
export function buildSnakeOrder(size: LeagueSize): DraftSlotAssignment[] {
  const teamsPer = getTeamsPerMember(size);
  const order: DraftSlotAssignment[] = [];

  for (let round = 1; round <= teamsPer; round += 1) {
    const isReverse = round % 2 === 0;
    for (let i = 0; i < size; i += 1) {
      const draftSlot = isReverse ? size - i : i + 1;
      order.push({
        pickNumber: (round - 1) * size + i + 1,
        round,
        draftSlot,
      });
    }
  }

  return order;
}

/** Which draft slot is on the clock for a given 1-based overall pick. */
export function getSlotForPick(pickNumber: number, size: LeagueSize): number {
  if (pickNumber < 1 || pickNumber > getTotalPicks(size)) {
    throw new Error(`Pick ${pickNumber} out of range for a ${size}-player league`);
  }
  const round = Math.ceil(pickNumber / size);
  const indexInRound = (pickNumber - 1) % size;
  const isReverse = round % 2 === 0;
  return isReverse ? size - indexInRound : indexInRound + 1;
}

/** All overall pick numbers belonging to one draft slot. */
export function getPicksForSlot(draftSlot: number, size: LeagueSize): number[] {
  return buildSnakeOrder(size)
    .filter((pick) => pick.draftSlot === draftSlot)
    .map((pick) => pick.pickNumber);
}

/** Teams still available given what's already been taken in this league. */
export function getAvailableTeams(
  allTeamIds: string[],
  draftedTeamIds: string[],
): string[] {
  const taken = new Set(draftedTeamIds);
  return allTeamIds.filter((id) => !taken.has(id));
}
