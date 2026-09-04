import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Lock,
  RotateCcw,
  Shuffle,
  Undo2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { TEAMS, getTeamById } from '../data/teams';
import { TeamLogo } from './TeamLogo';
import { VALUATION_BOARD_2026 } from '../lib/valuation';
import { TAU_PRESETS } from '../lib/cpuAI';
import { ALL_DIVISIONS } from '../lib/draftReservations';
import {
  contestedTeamsFor,
  currentRound,
  divisionChoiceBoard,
  loadDraft,
  makeCpuPick,
  makePick,
  memberName,
  onTheClock,
  picksByMember,
  reservedForCurrentMember,
  resetDraft,
  rosterValuation,
  ROUNDS,
  saveDraft,
  setMemberCpuHomer,
  setMemberCpuTau,
  setMemberIsCpu,
  shuffleOrder,
  startDraft,
  totalPicks,
  undoLastPick,
  type PickTag,
  type PracticeDraftState,
} from '../lib/practiceDraftStore';
import { cn } from '../lib/utils';

const TAG_LABEL: Record<PickTag, string> = {
  homer: 'Homer',
  reach: 'Reach',
  reserved: 'Reserved',
};

const TAG_CLASS: Record<PickTag, string> = {
  homer: 'bg-amber-100 text-amber-800',
  reach: 'bg-red-100 text-red-700',
  reserved: 'bg-blue-100 text-blue-700',
};

function TagBadge({ tag }: { tag?: PickTag }) {
  if (!tag) return null;
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', TAG_CLASS[tag])}>
      {TAG_LABEL[tag]}
    </span>
  );
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * A fully offline practice draft — never touches Supabase or a real league.
 * Exists so a solo user can try the draft flow and CPU AI without needing
 * four other signed-in accounts. See lib/practiceDraftStore.ts.
 */
export function PracticeDraft() {
  const [state, setState] = useState<PracticeDraftState>(loadDraft);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const board = VALUATION_BOARD_2026;

  const apply = (next: PracticeDraftState) => {
    setState(next);
    saveDraft(next);
  };

  const move = (index: number, dir: -1 | 1) => {
    const order = [...state.order];
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    apply({ ...state, order });
  };

  const [resetArmed, setResetArmed] = useState(false);
  const handleReset = () => {
    if (resetArmed) {
      setResetArmed(false);
      apply(resetDraft(state));
    } else {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 3000);
    }
  };

  const clock = useMemo(() => onTheClock(state), [state]);
  const clockMember = useMemo(() => state.members.find((m) => m.id === clock) ?? null, [state, clock]);
  const reservedForClock = useMemo(
    () => (clock ? reservedForCurrentMember(state, clock) : []),
    [state, clock],
  );
  const choiceBoard = useMemo(
    () => (clock ? divisionChoiceBoard(state, clock, board) : []),
    [state, clock],
  );

  useEffect(() => {
    setSelectedDivision(null);
  }, [clock]);

  // Auto-play CPU turns, chaining through consecutive CPU seats.
  useEffect(() => {
    if (state.status !== 'active' || !clockMember?.isCpu) return;
    const timer = window.setTimeout(() => {
      const next = makeCpuPick(state, board);
      if (next === state) return;
      const last = next.picks[next.picks.length - 1];
      const t = last ? getTeamById(last.teamId) : null;
      apply(next);
      if (t && last?.tag !== 'reserved') {
        toast(`${t.name} to ${memberName(state, clockMember.id)}`, {
          description: `Pick ${last!.pickNumber} of ${totalPicks(state)}`,
        });
      }
    }, 650);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const round = currentRound(state);
  const overall = state.picks.length + 1;
  const total = totalPicks(state);
  const decidedPicks = state.picks.filter((p) => p.tag !== 'reserved').length;

  // ---------------- SETUP ----------------
  if (state.status === 'setup') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-orange-700 uppercase">
            <FlaskConical className="size-3.5" /> Practice draft
          </p>
          <p className="mt-1 text-sm text-gray-700">
            A local sandbox — nothing here touches your real league. Snake draft, {ROUNDS} rounds,
            one team from each of the NBA's 6 divisions.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Draft order
          </p>
          <div className="space-y-2">
            {state.order.map((id, i) => {
              const member = state.members.find((m) => m.id === id);
              const isCpu = !!member?.isCpu;
              return (
                <div key={id} className="space-y-2 rounded-lg border border-gray-100 p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {memberName(state, id)}
                    </div>
                    <div className="flex overflow-hidden rounded-full border border-gray-300">
                      <button
                        type="button"
                        onClick={() => apply(setMemberIsCpu(state, id, false))}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 text-xs font-semibold',
                          !isCpu ? 'bg-gray-900 text-white' : 'bg-white text-gray-500',
                        )}
                      >
                        <User className="size-3" /> Human
                      </button>
                      <button
                        type="button"
                        onClick={() => apply(setMemberIsCpu(state, id, true))}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 text-xs font-semibold',
                          isCpu ? 'bg-gray-900 text-white' : 'bg-white text-gray-500',
                        )}
                      >
                        <Bot className="size-3" /> CPU
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${memberName(state, id)} up`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="flex size-7 items-center justify-center rounded-md border border-gray-300 disabled:opacity-30"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${memberName(state, id)} down`}
                        disabled={i === state.order.length - 1}
                        onClick={() => move(i, 1)}
                        className="flex size-7 items-center justify-center rounded-md border border-gray-300 disabled:opacity-30"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>
                  </div>

                  {isCpu && member?.cpu && (
                    <div className="flex flex-wrap items-center gap-2 pl-8">
                      <div className="flex overflow-hidden rounded-md border border-gray-300 text-xs font-semibold">
                        {(Object.entries(TAU_PRESETS) as Array<[string, number]>).map(([label, tau]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => apply(setMemberCpuTau(state, id, tau))}
                            className={cn(
                              'px-2 py-1',
                              member.cpu?.tau === tau ? 'bg-orange-600 text-white' : 'bg-white text-gray-600',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        Homer:
                        <select
                          value={member.cpu.homerTeamId ?? ''}
                          onChange={(e) =>
                            apply(setMemberCpuHomer(state, id, e.target.value || undefined))
                          }
                          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs"
                        >
                          <option value="">None</option>
                          {TEAMS.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => apply(shuffleOrder(state))}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
            >
              <Shuffle className="size-4" /> Shuffle
            </button>
            <button
              type="button"
              onClick={() => apply(startDraft(state))}
              className="flex flex-1 items-center justify-center rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Start practice draft
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- COMPLETE ----------------
  if (state.status === 'complete') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="size-6 shrink-0 text-green-600" />
          <div>
            <p className="font-medium text-gray-900">Practice draft complete</p>
            <p className="text-sm text-gray-600">All {total} picks are in.</p>
          </div>
        </div>

        {state.members.map((m) => {
          const picks = picksByMember(state, m.id);
          const { points, title } = rosterValuation(state, m.id, board);
          return (
            <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <p className="flex items-center gap-1.5 font-medium text-gray-900">
                  {m.name}
                  {m.isCpu && (
                    <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase">
                      <Bot className="size-3" /> CPU
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{picks.length} teams</p>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {points.toFixed(1)} projected pts ({((points / board.poolPoints) * 100).toFixed(1)}%
                of pool) · {pct(title)} title share
              </p>
              <div className="mt-2 space-y-1.5">
                {picks.map((p) => {
                  const t = getTeamById(p.teamId);
                  const v = board.byId[p.teamId];
                  return (
                    <div
                      key={p.teamId}
                      className="flex items-center gap-2 rounded-lg border border-gray-100 py-1.5 pr-2 pl-2"
                      style={t ? { borderLeftWidth: 4, borderLeftColor: t.primaryColor } : undefined}
                    >
                      {t && <TeamLogo team={t} size={24} />}
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                        {t?.name ?? p.teamId}
                      </span>
                      {v && <span className="text-xs text-gray-400">{v.points.toFixed(1)} pts</span>}
                      <TagBadge tag={p.tag} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={handleReset}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm',
            resetArmed ? 'border-red-300 text-red-600' : 'border-gray-300 text-gray-700',
          )}
        >
          <RotateCcw className="size-4" /> {resetArmed ? 'Tap again to reset' : 'Reset practice draft'}
        </button>
      </div>
    );
  }

  // ---------------- ACTIVE ----------------
  const clockName = memberName(state, clock);
  const rosterProjection = clock ? rosterValuation(state, clock, board) : { points: 0, title: 0 };
  const ownedDivisions = clock ? picksByMember(state, clock).map((p) => getTeamById(p.teamId)?.division) : [];

  const pick = (teamId: string) => {
    const next = makePick(state, teamId);
    if (next === state) return;
    const t = getTeamById(teamId);
    apply(next);
    setSelectedDivision(null);
    toast.success(`${t?.name ?? 'Team'} to ${clockName}`, { description: `Pick ${overall} of ${total}` });
  };

  return (
    <div className="space-y-4">
      {/* On the clock */}
      <div
        className={cn(
          'rounded-xl p-4',
          'bg-orange-600 text-white shadow-lg shadow-orange-600/20',
        )}
      >
        <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-white/80 uppercase">
          <span>On the clock</span>
          <span className="normal-case">
            Round {round} / {ROUNDS} · Pick {overall} / {total}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
          {clockName}
          {clockMember?.isCpu && (
            <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase">
              <Bot className="size-3" /> CPU
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-white/90">
          {ALL_DIVISIONS.length - new Set(ownedDivisions).size} division
          {ALL_DIVISIONS.length - new Set(ownedDivisions).size === 1 ? '' : 's'} left to fill
          {clockMember?.isCpu && ' · thinking…'}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {clockName}'s board
          </p>
          <p className="text-xs text-gray-400">
            {rosterProjection.points.toFixed(1)} pts · {pct(rosterProjection.title)} title share
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ALL_DIVISIONS.map((d) => {
            const owned = picksByMember(state, clock ?? '').find(
              (p) => getTeamById(p.teamId)?.division === d,
            );
            const t = owned ? getTeamById(owned.teamId) : null;
            const isReserved = reservedForClock.some((r) => r.division === d);
            return (
              <div
                key={d}
                className={cn(
                  'flex min-h-[46px] flex-col justify-center rounded-lg border px-1.5 py-1.5 text-center',
                  t ? 'border-transparent text-white' : 'border-gray-200 bg-gray-50',
                )}
                style={t ? { backgroundColor: t.primaryColor } : undefined}
              >
                <span className={cn('text-[10px] font-bold', t ? 'text-white/85' : 'text-gray-400')}>
                  {d}
                </span>
                <span className={cn('mt-0.5 text-[11px] font-semibold', t ? 'text-white' : 'text-gray-300')}>
                  {t ? t.city : isReserved ? <Lock className="mx-auto size-3" /> : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {reservedForClock.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-blue-700 uppercase">
            <Lock className="size-3.5" /> Locked in for {clockName}
          </p>
          <div className="space-y-1.5">
            {reservedForClock.map((r) => {
              const t = getTeamById(r.teamId);
              return (
                <div key={r.division} className="flex items-center gap-2 text-sm text-blue-900">
                  {t && <TeamLogo team={t} size={22} />}
                  <span className="flex-1 truncate">{t?.name ?? r.teamId}</span>
                  <span className="text-xs text-blue-600">{r.division}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!clockMember?.isCpu && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Pick a division for {clockName}
          </p>
          <p className="mb-2 text-xs text-gray-500">
            Divisions {clockName} has already locked or has reserved are hidden.
          </p>
          <div className="space-y-2">
            {choiceBoard.map((d) => {
              const expanded = d.division === selectedDivision;
              const teams = expanded
                ? TEAMS.filter((t) => t.division === d.division && contestedTeamsFor(state, clock!).some((c) => c.id === t.id))
                    .map((t) => ({ team: t, valuation: board.byId[t.id] }))
                    .sort((a, b) => (b.valuation?.points ?? 0) - (a.valuation?.points ?? 0))
                : [];
              return (
                <div key={d.division}>
                  <button
                    type="button"
                    onClick={() => {
                      if (d.availableCount === 1) {
                        pick(d.bestTeamId);
                      } else {
                        setSelectedDivision(expanded ? null : d.division);
                      }
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{d.division}</p>
                      <p className="text-xs text-gray-400">
                        {d.availableCount} team{d.availableCount === 1 ? '' : 's'} available
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-orange-600">
                          Best: {getTeamById(d.bestTeamId)?.name ?? '—'}
                        </p>
                        <p className="text-xs text-gray-400">{d.bestPoints.toFixed(1)} pts</p>
                      </div>
                      {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-2 ml-2 space-y-2 border-l-2 border-gray-100 pl-3">
                      {teams.map(({ team, valuation }) => (
                        <div
                          key={team.id}
                          className="flex items-center gap-2 rounded-lg border border-gray-100 py-1.5 pr-2 pl-2"
                          style={{ borderLeftWidth: 4, borderLeftColor: team.primaryColor }}
                        >
                          <TeamLogo team={team} size={24} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{team.name}</p>
                            {valuation && (
                              <p className="text-xs text-gray-400">
                                {valuation.points.toFixed(1)} pts · {pct(valuation.title)} title
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => pick(team.id)}
                            className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-700"
                          >
                            Draft
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {choiceBoard.length === 0 && (
              <p className="text-xs text-gray-500">Nothing contested right now — resolving automatically…</p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={state.picks.length === 0}
          onClick={() => apply(undoLastPick(state))}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
        >
          <Undo2 className="size-4" /> Undo pick
        </button>
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm',
            resetArmed ? 'border-red-300 text-red-600' : 'border-gray-300 text-gray-700',
          )}
        >
          <RotateCcw className="size-4" /> {resetArmed ? 'Tap again' : 'Reset'}
        </button>
      </div>

      {state.picks.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Picks so far</p>
            <p className="text-xs text-gray-400">
              {decidedPicks} decided · {state.picks.length - decidedPicks} auto-filled
            </p>
          </div>
          <div className="space-y-1.5">
            {[...state.picks].reverse().map((p) => {
              const t = getTeamById(p.teamId);
              return (
                <div
                  key={p.pickNumber}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 py-1.5 pr-2 pl-2"
                  style={t ? { borderLeftWidth: 4, borderLeftColor: t.primaryColor } : undefined}
                >
                  <span className="w-6 shrink-0 text-xs text-gray-400">#{p.pickNumber}</span>
                  {t && <TeamLogo team={t} size={24} />}
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{t?.name ?? p.teamId}</span>
                  <TagBadge tag={p.tag} />
                  <span className="shrink-0 text-xs text-gray-400">{memberName(state, p.memberId)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
