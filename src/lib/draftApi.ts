import { requireSupabase } from './supabase';
import type { MemberRole } from './types';

export interface DraftBoardPick {
  pickNumber: number;
  round: number;
  memberId: string;
  teamName: string;
  draftSlot: number | null;
  teamId: string;
  pickedAt: string;
}

export interface RosterEntry {
  memberId: string;
  profileId: string;
  teamName: string;
  role: MemberRole;
  draftSlot: number | null;
  teamIds: string[];
}

export interface DraftState {
  leagueId: string;
  currentPick: number;
  onTheClockMemberId: string | null;
  pickDeadline: string | null;
}

export async function fetchDraftBoard(leagueId: string): Promise<DraftBoardPick[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('draft_board', { target_league: leagueId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    pickNumber: Number(row.pick_number),
    round: Number(row.round),
    memberId: String(row.member_id),
    teamName: String(row.team_name ?? ''),
    draftSlot: row.draft_slot === null ? null : Number(row.draft_slot),
    teamId: String(row.team_id),
    pickedAt: String(row.picked_at),
  }));
}

export async function fetchRosters(leagueId: string): Promise<RosterEntry[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('league_rosters', { target_league: leagueId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    memberId: String(row.member_id),
    profileId: String(row.profile_id),
    teamName: String(row.team_name ?? ''),
    role: row.role as MemberRole,
    draftSlot: row.draft_slot === null ? null : Number(row.draft_slot),
    teamIds: (row.team_ids as string[] | null) ?? [],
  }));
}

export async function fetchDraftState(leagueId: string): Promise<DraftState | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('draft_state')
    .select('league_id, current_pick, on_the_clock_member_id, pick_deadline')
    .eq('league_id', leagueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    leagueId: data.league_id as string,
    currentPick: Number(data.current_pick),
    onTheClockMemberId: (data.on_the_clock_member_id as string | null) ?? null,
    pickDeadline: (data.pick_deadline as string | null) ?? null,
  };
}

export async function startDraft(leagueId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('start_draft', { target_league: leagueId });
  if (error) throw new Error(error.message);
}

export async function makePick(
  leagueId: string,
  teamId: string,
  forMemberId?: string,
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('make_pick', {
    target_league: leagueId,
    team: teamId,
    for_member: forMemberId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function undoLastPick(leagueId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('undo_last_pick', { target_league: leagueId });
  if (error) throw new Error(error.message);
}

export async function resetDraft(leagueId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('reset_draft', { target_league: leagueId });
  if (error) throw new Error(error.message);
}
