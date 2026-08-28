import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Play, Shuffle } from 'lucide-react';
import { setDraftOrder } from '../lib/leagues';
import { startDraft } from '../lib/draftApi';
import { setPickSeconds } from '../lib/liveDraft';
import { setDraftMode } from '../lib/leagues';
import type { League, LeagueMember } from '../lib/types';
import { cn } from '../lib/utils';

interface Props {
  league: League;
  members: LeagueMember[];
  onChanged: () => Promise<void> | void;
}

/** Commissioner arranges the snake order, then starts the draft. */
export function DraftOrderSetup({ league, members, onChanged }: Props) {
  const isCommissioner = league.role === 'commissioner';
  const [order, setOrder] = useState<LeagueMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sorted = [...members].sort((a, b) => {
      if (a.draftSlot && b.draftSlot) return a.draftSlot - b.draftSlot;
      if (a.draftSlot) return -1;
      if (b.draftSlot) return 1;
      return a.teamName.localeCompare(b.teamName);
    });
    setOrder(sorted);
  }, [members]);

  const full = members.length === league.size;
  const slotsSet = members.every((m) => m.draftSlot !== null);

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  function shuffle() {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
  }

  async function saveOrder() {
    setBusy(true);
    setError(null);
    try {
      await setDraftOrder(league.id, order.map((m) => m.id));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the order');
    } finally {
      setBusy(false);
    }
  }

  async function changeMode(mode: 'async' | 'live') {
    setBusy(true);
    setError(null);
    try {
      await setDraftMode(league.id, mode);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change draft mode');
    } finally {
      setBusy(false);
    }
  }

  async function changeClock(seconds: number) {
    setBusy(true);
    setError(null);
    try {
      await setPickSeconds(league.id, seconds);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the pick clock');
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      await startDraft(league.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the draft');
    } finally {
      setBusy(false);
    }
  }

  if (!isCommissioner) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-lg font-medium text-gray-900">Waiting to draft</h2>
          <p className="text-sm text-gray-600">
            {full
              ? 'The commissioner will start the draft.'
              : `Waiting on ${league.size - members.length} more player${
                  league.size - members.length === 1 ? '' : 's'
                } to join.`}
          </p>
        </div>
        <MemberList order={order} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Draft order</h2>
          <button
            type="button"
            onClick={shuffle}
            className="flex items-center gap-1.5 text-sm text-fuchsia-600"
          >
            <Shuffle className="size-4" /> Shuffle
          </button>
        </div>

        {!full && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {members.length} of {league.size} players have joined. Share the invite
            code <span className="font-mono font-semibold">{league.inviteCode}</span> —
            everyone must join before the draft can start.
          </p>
        )}

        <ul className="divide-y divide-gray-100">
          {order.map((member, index) => (
            <li key={member.id} className="flex items-center gap-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-700">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {member.teamName || 'Unnamed'}
                {member.role === 'commissioner' && (
                  <span className="ml-1.5 text-xs text-gray-400">commissioner</span>
                )}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  aria-label="Move down"
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowDown className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-gray-200 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Draft mode</p>
          <div className="grid grid-cols-2 gap-2">
            {(['async', 'live'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void changeMode(option)}
                className={cn(
                  'rounded-lg border px-3 py-3 text-left text-sm transition-colors',
                  league.draftMode === option
                    ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-900'
                    : 'border-gray-300 text-gray-700',
                )}
              >
                <span className="block font-medium">
                  {option === 'async' ? 'Async' : 'Live'}
                </span>
                <span className="block text-xs text-gray-500">
                  {option === 'async'
                    ? 'Pick any time'
                    : 'Timed picks, everyone together'}
                </span>
              </button>
            ))}
          </div>

          {league.draftMode === 'live' && (
            <div className="mt-3">
              <label htmlFor="pick-clock" className="mb-1 block text-sm text-gray-700">
                Seconds per pick
              </label>
              <select
                id="pick-clock"
                value={league.pickSeconds}
                onChange={(e) => void changeClock(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              >
                {[30, 60, 90, 120, 180, 300].map((n) => (
                  <option key={n} value={n}>
                    {n} seconds
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={saveOrder}
          disabled={busy || !full}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save order
        </button>

        <button
          type="button"
          onClick={begin}
          disabled={busy || !full || !slotsSet}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white',
            'bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50',
          )}
        >
          <Play className="size-4" /> Start draft
        </button>

        {!slotsSet && full && (
          <p className="mt-2 text-center text-xs text-gray-500">
            Save the order before starting.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function MemberList({ order }: { order: LeagueMember[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-2 text-sm font-medium text-gray-700">Players</h3>
      <ul className="divide-y divide-gray-100">
        {order.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-6 text-gray-400">{m.draftSlot ?? '–'}</span>
            <span className="flex-1 truncate text-gray-900">
              {m.teamName || 'Unnamed'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
