import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchDraftBoard,
  fetchDraftState,
  fetchRosters,
  type DraftBoardPick,
  type DraftState,
  type RosterEntry,
} from './draftApi';
import { fetchLeagueMembers } from './leagues';
import { TEAMS } from '../data/teams';
import { getSlotForPick, getTeamsPerMember, type LeagueSize } from './draft';
import type { League, LeagueMember } from './types';

export interface DraftView {
  members: LeagueMember[];
  rosters: RosterEntry[];
  picks: DraftBoardPick[];
  state: DraftState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Teams still on the board. */
  availableTeamIds: string[];
  draftedTeamIds: Set<string>;
  /** Member whose turn it is, derived from the snake order. */
  onTheClock: LeagueMember | null;
  currentPick: number;
  totalPicks: number;
  isComplete: boolean;
}

export function useDraft(league: League | null): DraftView {
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<RosterEntry[]>([]);
  const [picks, setPicks] = useState<DraftBoardPick[]>([]);
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leagueId = league?.id ?? null;

  const refresh = useCallback(async () => {
    if (!leagueId) {
      setMembers([]);
      setRosters([]);
      setPicks([]);
      setState(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, r, b, s] = await Promise.all([
        fetchLeagueMembers(leagueId),
        fetchRosters(leagueId),
        fetchDraftBoard(leagueId),
        fetchDraftState(leagueId),
      ]);
      setMembers(m);
      setRosters(r);
      setPicks(b);
      setState(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the draft');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const draftedTeamIds = useMemo(
    () => new Set(picks.map((p) => p.teamId)),
    [picks],
  );

  const availableTeamIds = useMemo(
    () => TEAMS.filter((t) => !draftedTeamIds.has(t.id)).map((t) => t.id),
    [draftedTeamIds],
  );

  const totalPicks = TEAMS.length;
  const currentPick = state?.currentPick ?? picks.length + 1;
  const isComplete = league?.draftStatus === 'complete' || currentPick > totalPicks;

  // Prefer the server's on-the-clock member; fall back to deriving it from the
  // snake order so the board still reads correctly if draft_state is stale.
  const onTheClock = useMemo(() => {
    if (!league || isComplete) return null;
    if (state?.onTheClockMemberId) {
      return members.find((m) => m.id === state.onTheClockMemberId) ?? null;
    }
    const slot = safeSlotForPick(currentPick, league.size);
    if (slot === null) return null;
    return members.find((m) => m.draftSlot === slot) ?? null;
  }, [league, members, state, currentPick, isComplete]);

  return {
    members,
    rosters,
    picks,
    state,
    loading,
    error,
    refresh,
    availableTeamIds,
    draftedTeamIds,
    onTheClock,
    currentPick,
    totalPicks,
    isComplete,
  };
}

function safeSlotForPick(pick: number, size: LeagueSize): number | null {
  try {
    return getSlotForPick(pick, size);
  } catch {
    return null;
  }
}

/** Upcoming picks, for the "on deck" strip. */
export function getUpcomingPicks(
  currentPick: number,
  size: LeagueSize,
  members: LeagueMember[],
  count = 4,
): Array<{ pickNumber: number; member: LeagueMember | null }> {
  const total = getTeamsPerMember(size) * size;
  const out: Array<{ pickNumber: number; member: LeagueMember | null }> = [];
  for (let p = currentPick; p < currentPick + count && p <= total; p += 1) {
    const slot = safeSlotForPick(p, size);
    out.push({
      pickNumber: p,
      member: slot === null ? null : members.find((m) => m.draftSlot === slot) ?? null,
    });
  }
  return out;
}
