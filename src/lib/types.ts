import type { ScoringConfig } from './scoring';
import type { LeagueSize } from './draft';

export type DraftMode = 'async' | 'live';
export type DraftStatus = 'pending' | 'in_progress' | 'complete';
export type MemberRole = 'commissioner' | 'member';

/**
 * Note on naming: the database uses `profile_id`, `season`, and `team_name`.
 * We map to camelCase here but keep the same concepts — `teamName` is the
 * member's fantasy team name, not an NBA team.
 */

/** A league as returned by the `my_leagues()` RPC. */
export interface League {
  id: string;
  name: string;
  season: number;
  size: LeagueSize;
  draftMode: DraftMode;
  draftStatus: DraftStatus;
  inviteCode: string;
  scoringConfig: ScoringConfig;
  pickSeconds: number;
  /** The current user's role in this league. */
  role: MemberRole;
  memberCount: number;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  profileId: string;
  role: MemberRole;
  teamName: string;
  draftSlot: number | null;
}

export interface DraftPick {
  id: string;
  leagueId: string;
  memberId: string;
  pickNumber: number;
  round: number;
  teamId: string;
}

/** Public-safe league preview shown before joining. */
export interface LeaguePreview {
  id: string;
  name: string;
  season: number;
  size: number;
  memberCount: number;
  draftStatus: DraftStatus;
}

// --- row shapes as they come back from Postgres (snake_case) ---------------

export interface LeagueRow {
  id: string;
  name: string;
  season: number;
  size: number;
  draft_mode: DraftMode;
  draft_status: DraftStatus;
  invite_code: string;
  scoring_config: ScoringConfig;
  pick_seconds: number;
  role: MemberRole;
  member_count: number;
}

export interface LeagueMemberRow {
  id: string;
  league_id: string;
  profile_id: string;
  role: MemberRole;
  team_name: string;
  draft_slot: number | null;
}

export interface DraftPickRow {
  id: string;
  league_id: string;
  member_id: string;
  pick_number: number;
  round: number;
  team_id: string;
}

export interface LeaguePreviewRow {
  id: string;
  name: string;
  season: number;
  size: number;
  member_count: number;
  draft_status: DraftStatus;
}

// --- mappers ---------------------------------------------------------------

export function mapLeague(row: LeagueRow): League {
  return {
    id: row.id,
    name: row.name,
    season: row.season,
    size: row.size as LeagueSize,
    draftMode: row.draft_mode,
    draftStatus: row.draft_status,
    inviteCode: row.invite_code,
    scoringConfig: row.scoring_config,
    pickSeconds: row.pick_seconds ?? 90,
    role: row.role,
    memberCount: Number(row.member_count),
  };
}

export function mapMember(row: LeagueMemberRow): LeagueMember {
  return {
    id: row.id,
    leagueId: row.league_id,
    profileId: row.profile_id,
    role: row.role,
    teamName: row.team_name,
    draftSlot: row.draft_slot,
  };
}

export function mapPick(row: DraftPickRow): DraftPick {
  return {
    id: row.id,
    leagueId: row.league_id,
    memberId: row.member_id,
    pickNumber: row.pick_number,
    round: row.round,
    teamId: row.team_id,
  };
}

export function mapPreview(row: LeaguePreviewRow): LeaguePreview {
  return {
    id: row.id,
    name: row.name,
    season: row.season,
    size: row.size,
    memberCount: Number(row.member_count),
    draftStatus: row.draft_status,
  };
}
