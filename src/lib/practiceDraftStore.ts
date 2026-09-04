/**
 * Local practice-draft engine — a fully offline sandbox for trying out the
 * draft flow and CPU AI. This never touches Supabase, RLS, or a real league:
 * it's pure client state in localStorage, reusing the same snake-order math
 * (lib/draft.ts), reserved-division invariant (lib/draftReservations.ts),
 * valuation model, and CPU AI as the real live draft.
 *
 * There's no CPU concept in a real NBA Bruball league (it's 5 real people),
 * so this exists purely so a solo user — testing the app, or just curious
 * how a draft might shake out — can run one without needing four other
 * signed-in accounts.
 */
import { TEAMS, getTeamById, type Team } from '../data/teams';
import { buildSnakeOrder, getTeamsPerMember, getTotalPicks, type LeagueSize } from './draft';
import {
  ALL_DIVISIONS,
  divisionsOwnedBy,
  nextForcedPick,
  reservedForMember,
  reservedTeams,
  type ReservedTeam,
} from './draftReservations';
import { VALUATION_BOARD_2026, type ValuationBoard } from './valuation';
import {
  randomStrategy,
  softmaxSample,
  strategyScore,
  TAU_PRESETS,
  type CpuProfile,
} from './cpuAI';
import type { DraftBoardPick } from './draftApi';
import type { LeagueMember } from './types';

export interface PracticeMember {
  id: string;
  name: string;
  isCpu?: boolean;
  cpu?: CpuProfile;
}

export type PracticeDraftStatus = 'setup' | 'active' | 'complete';
export type PickTag = 'homer' | 'reach' | 'reserved';

export interface PracticePick extends DraftBoardPick {
  tag?: PickTag;
}

export interface PracticeDraftState {
  status: PracticeDraftStatus;
  members: PracticeMember[];
  /** Round-1 (draftSlot 1..size) order of member ids; snake reverses each round. */
  order: string[];
  picks: PracticePick[];
  startedAt: string | null;
}

export const LEAGUE_SIZE: LeagueSize = 5;
export const ROUNDS = getTeamsPerMember(LEAGUE_SIZE); // 6

export const DEFAULT_MEMBERS: PracticeMember[] = [
  { id: 'tyler', name: 'Tyler' },
  { id: 'austin', name: 'Austin' },
  { id: 'lindy', name: 'Lindy' },
  { id: 'nick', name: 'Nick' },
  { id: 'seth', name: 'Seth' },
];

const KEY = 'nba-bruball:practiceDraft';

function freshState(members: PracticeMember[] = DEFAULT_MEMBERS): PracticeDraftState {
  return {
    status: 'setup',
    members,
    order: members.map((m) => m.id),
    picks: [],
    startedAt: null,
  };
}

function normalize(raw: any): PracticeDraftState {
  const members: PracticeMember[] =
    Array.isArray(raw?.members) && raw.members.length ? raw.members : DEFAULT_MEMBERS;
  const order: string[] =
    Array.isArray(raw?.order) && raw.order.length ? raw.order : members.map((m) => m.id);
  const picks: PracticePick[] = Array.isArray(raw?.picks) ? raw.picks : [];
  const status: PracticeDraftStatus =
    raw?.status === 'active' || raw?.status === 'complete' ? raw.status : 'setup';
  return { status, members, order, picks, startedAt: raw?.startedAt ?? null };
}

export function loadDraft(): PracticeDraftState {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* ignore corrupt state */
  }
  return freshState();
}

export function saveDraft(state: PracticeDraftState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
}

/** Members reshaped to satisfy draftReservations' LeagueMember-shaped input. */
function asLeagueMembers(state: PracticeDraftState): LeagueMember[] {
  return state.members.map((m, i) => ({
    id: m.id,
    leagueId: 'practice',
    profileId: m.id,
    role: 'member' as const,
    teamName: m.name,
    draftSlot: i + 1,
  }));
}

/** Flat list of member ids in pick order across all snake rounds. */
export function pickOrder(state: PracticeDraftState): string[] {
  const base = state.order.length ? state.order : state.members.map((m) => m.id);
  return buildSnakeOrder(LEAGUE_SIZE).map((slot) => base[slot.draftSlot - 1]);
}

export function totalPicks(_state: PracticeDraftState): number {
  return getTotalPicks(LEAGUE_SIZE);
}

export function onTheClock(state: PracticeDraftState): string | null {
  if (state.status !== 'active') return null;
  return pickOrder(state)[state.picks.length] ?? null;
}

export function currentRound(state: PracticeDraftState): number {
  const n = state.order.length || state.members.length || 1;
  return Math.min(ROUNDS, Math.floor(state.picks.length / n) + 1);
}

export function takenTeamIds(state: PracticeDraftState): Set<string> {
  return new Set(state.picks.map((p) => p.teamId));
}

export function picksByMember(state: PracticeDraftState, memberId: string): PracticePick[] {
  return state.picks.filter((p) => p.memberId === memberId);
}

export function memberName(state: PracticeDraftState, id: string | null): string {
  if (!id) return '';
  return state.members.find((m) => m.id === id)?.name ?? id;
}

export function canPick(state: PracticeDraftState, teamId: string, memberId: string | null): boolean {
  if (!memberId) return false;
  const team = TEAMS.find((t) => t.id === teamId);
  if (!team) return false;
  if (takenTeamIds(state).has(teamId)) return false;
  const owned = new Set(picksByMember(state, memberId).map((p) => getTeamById(p.teamId)?.division));
  return !owned.has(team.division);
}

function applyPick(state: PracticeDraftState, teamId: string, tag?: PickTag): PracticeDraftState {
  const who = onTheClock(state);
  if (!who || !canPick(state, teamId, who)) return state;
  const pickNumber = state.picks.length + 1;
  const picks: PracticePick[] = [
    ...state.picks,
    {
      pickNumber,
      round: Math.ceil(pickNumber / (state.order.length || state.members.length)),
      memberId: who,
      teamName: memberName(state, who),
      draftSlot: null,
      teamId,
      pickedAt: new Date().toISOString(),
      tag,
    },
  ];
  const status: PracticeDraftStatus = picks.length >= totalPicks(state) ? 'complete' : 'active';
  return { ...state, picks, status };
}

/** Once a member has no contested divisions left, silently fill in the rest — no decision left to make. */
export function autoResolveForced(state: PracticeDraftState): PracticeDraftState {
  let current = state;
  const maxIterations = totalPicks(state) + 1;
  for (let i = 0; i < maxIterations; i++) {
    if (current.status !== 'active') break;
    const who = onTheClock(current);
    if (!who) break;
    const forced = nextForcedPick(current.picks, asLeagueMembers(current), who);
    if (!forced) break;
    current = applyPick(current, forced.teamId, 'reserved');
  }
  return current;
}

export function makePick(state: PracticeDraftState, teamId: string): PracticeDraftState {
  const next = applyPick(state, teamId);
  if (next === state) return state;
  return autoResolveForced(next);
}

export function reservedForCurrentMember(state: PracticeDraftState, memberId: string): ReservedTeam[] {
  return reservedForMember(state.picks, asLeagueMembers(state), memberId);
}

export function reservedDivisions(state: PracticeDraftState): ReservedTeam[] {
  return reservedTeams(state.picks, asLeagueMembers(state));
}

/** Choice board: available teams in a member's open, contested divisions. */
export function contestedTeamsFor(state: PracticeDraftState, memberId: string): Team[] {
  const taken = takenTeamIds(state);
  const owned = divisionsOwnedBy(state.picks, memberId);
  const reservedForMe = new Set(reservedForCurrentMember(state, memberId).map((r) => r.division));
  return TEAMS.filter(
    (t) => !taken.has(t.id) && !owned.has(t.division) && !reservedForMe.has(t.division),
  );
}

export interface DivisionChoice {
  division: string;
  availableCount: number;
  bestTeamId: string;
  bestPoints: number;
}

export function divisionChoiceBoard(
  state: PracticeDraftState,
  memberId: string,
  board: ValuationBoard = VALUATION_BOARD_2026,
): DivisionChoice[] {
  const taken = takenTeamIds(state);
  const owned = divisionsOwnedBy(state.picks, memberId);
  const reservedForMe = new Set(reservedForCurrentMember(state, memberId).map((r) => r.division));

  return ALL_DIVISIONS.filter((d) => !owned.has(d) && !reservedForMe.has(d))
    .map((division) => {
      const available = TEAMS.filter((t) => t.division === division && !taken.has(t.id));
      const best = available.reduce<{ teamId: string; points: number } | null>((acc, t) => {
        const points = board.byId[t.id]?.points ?? 0;
        return !acc || points > acc.points ? { teamId: t.id, points } : acc;
      }, null);
      return {
        division,
        availableCount: available.length,
        bestTeamId: best?.teamId ?? '',
        bestPoints: best?.points ?? 0,
      };
    })
    .filter((d) => d.availableCount > 0);
}

export function rosterValuation(
  state: PracticeDraftState,
  memberId: string,
  board: ValuationBoard = VALUATION_BOARD_2026,
): { points: number; title: number } {
  return picksByMember(state, memberId).reduce(
    (acc, p) => {
      const v = board.byId[p.teamId];
      return { points: acc.points + (v?.points ?? 0), title: acc.title + (v?.title ?? 0) };
    },
    { points: 0, title: 0 },
  );
}

/** Have the CPU manager on the clock choose a team via their strategy + softmax(TAU). */
export function cpuChoosePick(
  state: PracticeDraftState,
  board: ValuationBoard = VALUATION_BOARD_2026,
  rand: () => number = Math.random,
): { teamId: string; tag?: PickTag } | null {
  const who = onTheClock(state);
  if (!who) return null;
  const member = state.members.find((m) => m.id === who);
  const profile: CpuProfile = member?.cpu ?? { strategy: 'chalk', tau: TAU_PRESETS.competent };

  let candidates = contestedTeamsFor(state, who);
  if (!candidates.length) {
    candidates = TEAMS.filter((t) => canPick(state, t.id, who));
  }
  if (!candidates.length) return null;

  const taken = takenTeamIds(state);
  const order = pickOrder(state);
  const nextMemberId = order[state.picks.length + 1] ?? null;
  const nextOwned = nextMemberId
    ? new Set(picksByMember(state, nextMemberId).map((p) => getTeamById(p.teamId)?.division))
    : new Set<string | undefined>();

  const scored = candidates.map((team) => {
    const valuation = board.byId[team.id];
    const divisionMates = TEAMS.filter((t) => t.division === team.division && !taken.has(t.id))
      .map((t) => board.byId[t.id])
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
    const isLegalForNext = !!nextMemberId && !nextOwned.has(team.division);
    const value = valuation ? strategyScore(valuation, profile, divisionMates, isLegalForNext) : 0;
    return { teamId: team.id, value };
  });

  const maxValue = Math.max(...scored.map((s) => s.value));
  const teamId = softmaxSample(scored, profile.tau || TAU_PRESETS.competent, rand);
  const chosen = scored.find((s) => s.teamId === teamId)!;

  let tag: PickTag | undefined;
  if (profile.homerTeamId === teamId) tag = 'homer';
  else if (chosen.value < maxValue - 0.5) tag = 'reach';

  return { teamId, tag };
}

export function makeCpuPick(
  state: PracticeDraftState,
  board: ValuationBoard = VALUATION_BOARD_2026,
  rand: () => number = Math.random,
): PracticeDraftState {
  const choice = cpuChoosePick(state, board, rand);
  if (!choice) return state;
  const next = applyPick(state, choice.teamId, choice.tag);
  if (next === state) return state;
  return autoResolveForced(next);
}

export function undoLastPick(state: PracticeDraftState): PracticeDraftState {
  if (!state.picks.length) return state;
  return {
    ...state,
    picks: state.picks.slice(0, -1),
    status: state.status === 'complete' ? 'active' : state.status,
  };
}

export function startDraft(state: PracticeDraftState): PracticeDraftState {
  return { ...state, status: 'active', picks: [], startedAt: new Date().toISOString() };
}

export function resetDraft(state: PracticeDraftState): PracticeDraftState {
  return freshState(state.members);
}

export function shuffleOrder(state: PracticeDraftState): PracticeDraftState {
  const order = [...(state.order.length ? state.order : state.members.map((m) => m.id))];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...state, order };
}

export function setMemberIsCpu(
  state: PracticeDraftState,
  memberId: string,
  isCpu: boolean,
  rand: () => number = Math.random,
): PracticeDraftState {
  const members = state.members.map((m) => {
    if (m.id !== memberId) return m;
    if (!isCpu) return { ...m, isCpu: false, cpu: undefined };
    const cpu: CpuProfile = m.cpu ?? {
      strategy: randomStrategy(rand),
      tau: TAU_PRESETS.competent,
      homerTeamId: TEAMS[Math.floor(rand() * TEAMS.length)]?.id,
    };
    return { ...m, isCpu: true, cpu };
  });
  return { ...state, members };
}

export function setMemberCpuTau(state: PracticeDraftState, memberId: string, tau: number): PracticeDraftState {
  const members = state.members.map((m) =>
    m.id === memberId && m.cpu ? { ...m, cpu: { ...m.cpu, tau } } : m,
  );
  return { ...state, members };
}

export function setMemberCpuHomer(
  state: PracticeDraftState,
  memberId: string,
  homerTeamId: Team['id'] | undefined,
): PracticeDraftState {
  const members = state.members.map((m) =>
    m.id === memberId && m.cpu ? { ...m, cpu: { ...m.cpu, homerTeamId } } : m,
  );
  return { ...state, members };
}
