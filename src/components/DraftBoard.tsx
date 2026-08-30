import { useMemo, useState } from 'react';
import { Loader2, Undo2, RotateCcw, Search, Trophy } from 'lucide-react';
import { TEAMS, getTeamById, DIVISIONS, type Conference } from '../data/teams';
import { TeamLogo } from './TeamLogo';
import { makePick, undoLastPick, resetDraft } from '../lib/draftApi';
import { pauseDraft, resumeDraft } from '../lib/liveDraft';
import { getUpcomingPicks, type DraftView } from '../lib/useDraft';
import { useRealtimeDraft, usePresence } from '../lib/useRealtimeDraft';
import { DraftClock } from './DraftClock';
import type { League } from '../lib/types';
import { cn } from '../lib/utils';

interface Props {
  league: League;
  draft: DraftView;
  /** league_members.id for the signed-in user, if they are a member. */
  myMemberId: string | null;
}

export function DraftBoard({ league, draft, myMemberId }: Props) {
  const [query, setQuery] = useState('');
  const [busyTeam, setBusyTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'available' | 'picks'>('available');

  const isCommissioner = league.role === 'commissioner';
  const myTurn = draft.onTheClock?.id === myMemberId;
  const paused = draft.state?.paused ?? false;
  const canPick = !draft.isComplete && !paused && (isCommissioner || myTurn);
  const isLive = league.draftMode === 'live';

  // Live picks arrive over Realtime; the clock and autopick ride along with it.
  const { connection, remaining, presentMemberIds } = useRealtimeDraft({
    league,
    onChange: draft.refresh,
    pickDeadline: draft.state?.pickDeadline ?? null,
    paused,
  });
  usePresence(league.id, myMemberId);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEAMS.filter((t) => !draft.draftedTeamIds.has(t.id)).filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.abbreviation.toLowerCase().includes(q) ||
        t.division.toLowerCase().includes(q),
    );
  }, [draft.draftedTeamIds, query]);

  const upcoming = useMemo(
    () => getUpcomingPicks(draft.currentPick, league.size, draft.members, 4),
    [draft.currentPick, draft.members, league.size],
  );

  async function pick(teamId: string) {
    setBusyTeam(teamId);
    setError(null);
    try {
      await makePick(league.id, teamId);
      await draft.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make that pick');
    } finally {
      setBusyTeam(null);
    }
  }

  async function undo() {
    setError(null);
    try {
      await undoLastPick(league.id);
      await draft.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo');
    }
  }

  async function reset() {
    if (!window.confirm('Reset the draft? Every pick in this league will be erased.')) {
      return;
    }
    setError(null);
    try {
      await resetDraft(league.id);
      await draft.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset');
    }
  }

  async function togglePause(next: 'pause' | 'resume') {
    setError(null);
    try {
      if (next === 'pause') await pauseDraft(league.id);
      else await resumeDraft(league.id);
      await draft.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the draft state');
    }
  }

  return (
    <div className="space-y-4">
      {isLive && !draft.isComplete && (
        <DraftClock
          remaining={remaining}
          paused={paused}
          connection={connection}
          isCommissioner={isCommissioner}
          onPause={() => togglePause('pause')}
          onResume={() => togglePause('resume')}
          presentCount={presentMemberIds.length}
        />
      )}

      {/* On the clock */}
      {draft.isComplete ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <Trophy className="size-6 shrink-0 text-green-600" />
          <div>
            <p className="font-medium text-gray-900">Draft complete</p>
            <p className="text-sm text-gray-600">
              All {draft.totalPicks} teams are spoken for.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
          <p className="text-xs tracking-wide text-fuchsia-700 uppercase">
            Pick {draft.currentPick} of {draft.totalPicks} · Round{' '}
            {Math.ceil(draft.currentPick / league.size)}
          </p>
          <p className="mt-0.5 text-lg font-medium text-gray-900">
            {draft.onTheClock
              ? `${draft.onTheClock.teamName || 'Unnamed'} is on the clock`
              : 'Waiting…'}
            {myTurn && <span className="ml-2 text-sm text-fuchsia-700">(you)</span>}
          </p>
          {upcoming.length > 1 && (
            <p className="mt-1 text-xs text-gray-600">
              Next:{' '}
              {upcoming
                .slice(1)
                .map((u) => u.member?.teamName || '—')
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Commissioner controls */}
      {isCommissioner && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={draft.picks.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            <Undo2 className="size-4" /> Undo pick
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <RotateCcw className="size-4" /> Reset draft
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('available')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
            tab === 'available' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600',
          )}
        >
          Available ({available.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('picks')}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
            tab === 'picks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600',
          )}
        >
          Picks ({draft.picks.length})
        </button>
      </div>

      {tab === 'available' ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams"
              className="w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-base outline-none focus:border-fuchsia-500"
            />
          </div>

          {(['East', 'West'] as Conference[]).map((conference) => {
            const inConf = available.filter((t) => t.conference === conference);
            if (!inConf.length) return null;
            return (
              <section key={conference}>
                <h3 className="mb-2 text-sm font-medium text-gray-700">
                  {conference === 'East' ? 'Eastern' : 'Western'} Conference
                </h3>
                <div className="space-y-3">
                  {DIVISIONS[conference].map((division) => {
                    const teams = inConf.filter((t) => t.division === division);
                    if (!teams.length) return null;
                    return (
                      <div
                        key={division}
                        className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                      >
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                          {division}
                        </div>
                        <ul>
                          {teams.map((team) => (
                            <li
                              key={team.id}
                              className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                            >
                              <TeamLogo team={team} size={32} />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                                {team.name}
                              </span>
                              {canPick ? (
                                <button
                                  type="button"
                                  onClick={() => pick(team.id)}
                                  disabled={busyTeam !== null}
                                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-700 disabled:opacity-50"
                                >
                                  {busyTeam === team.id && (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  )}
                                  Draft
                                </button>
                              ) : (
                                <span className="shrink-0 text-xs text-gray-400">
                                  {team.abbreviation}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {!available.length && (
            <p className="py-8 text-center text-sm text-gray-500">
              {query ? 'No teams match that search.' : 'Every team has been drafted.'}
            </p>
          )}
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {draft.picks.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">No picks yet.</p>
          ) : (
            <ul>
              {/* Chronological, so the log reads the way the draft happened. */}
              {[...draft.picks]
                .sort((a, b) => a.pickNumber - b.pickNumber)
                .map((p) => {
                const team = getTeamById(p.teamId);
                return (
                  <li
                    key={p.pickNumber}
                    className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                  >
                    <span className="w-10 shrink-0 text-xs text-gray-400">
                      {p.round}.{String(((p.pickNumber - 1) % league.size) + 1)}
                    </span>
                    {team && <TeamLogo team={team} size={28} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {team?.name ?? p.teamId}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {p.teamName || 'Unnamed'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">
                      #{p.pickNumber}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
