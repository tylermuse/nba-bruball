import { requireSupabase } from './supabase';
import {
  mapLeague,
  mapMember,
  mapPreview,
  type DraftMode,
  type League,
  type LeagueMember,
  type LeagueMemberRow,
  type LeaguePreview,
  type LeaguePreviewRow,
  type LeagueRow,
} from './types';
import type { LeagueSize } from './draft';

/** Invite codes are stored uppercase and use an unambiguous alphabet. */
export const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(code));
}

export async function fetchMyLeagues(): Promise<League[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('my_leagues');
  if (error) throw new Error(error.message);
  return ((data ?? []) as LeagueRow[]).map(mapLeague);
}

export async function createLeague(input: {
  name: string;
  size: LeagueSize;
  season: number;
  draftMode?: DraftMode;
  teamName?: string;
}): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('create_league', {
    league_name: input.name,
    league_size: input.size,
    season_year: input.season,
    mode: input.draftMode ?? 'async',
    commissioner_team_name: input.teamName ?? '',
  });
  if (error) throw new Error(error.message);
  const row = data as { id: string } | null;
  if (!row?.id) throw new Error('League creation returned no league');
  return row.id;
}

export async function peekLeague(code: string): Promise<LeaguePreview | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('peek_league_by_code', {
    code: normalizeInviteCode(code),
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LeaguePreviewRow[];
  return rows.length ? mapPreview(rows[0]) : null;
}

export async function joinLeague(
  code: string,
  teamName?: string,
): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('join_league_by_code', {
    code: normalizeInviteCode(code),
    member_team_name: teamName ?? '',
  });
  if (error) throw new Error(error.message);
  const row = data as { id: string } | null;
  if (!row?.id) throw new Error('Join returned no league');
  return row.id;
}

export async function fetchLeagueMembers(
  leagueId: string,
): Promise<LeagueMember[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('league_members')
    .select('id, league_id, profile_id, role, team_name, draft_slot')
    .eq('league_id', leagueId)
    .order('draft_slot', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LeagueMemberRow[]).map(mapMember);
}

export async function setDraftOrder(
  leagueId: string,
  memberIdsInSlotOrder: string[],
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('set_draft_order', {
    target_league: leagueId,
    member_ids: memberIdsInSlotOrder,
  });
  if (error) throw new Error(error.message);
}

export async function setMyTeamName(
  leagueId: string,
  name: string,
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('set_my_team_name', {
    target_league: leagueId,
    new_name: name,
  });
  if (error) throw new Error(error.message);
}

/** Shareable link that pre-fills the join screen. */
export function buildInviteUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/?join=${normalizeInviteCode(code)}`;
}

/** Read an invite code out of the current URL, if present. */
export function readInviteCodeFromUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get('join');
  if (!code) return null;
  const normalized = normalizeInviteCode(code);
  return isValidInviteCode(normalized) ? normalized : null;
}
