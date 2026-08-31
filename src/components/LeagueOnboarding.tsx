import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, Users } from 'lucide-react';
import {
  createLeague,
  joinLeague,
  peekLeague,
  isValidInviteCode,
  normalizeInviteCode,
} from '../lib/leagues';
import { useLeagues } from '../context/LeagueContext';
import { getDefaultSeason, formatSeason } from '../lib/season';
import type { LeagueSize } from '../lib/draft';
import type { LeaguePreview } from '../lib/types';
import { cn } from '../lib/utils';

interface Props {
  /** Invite code lifted from the URL, if the user followed an invite link. */
  initialCode?: string | null;
  onDone: () => void;
  /** Hidden when the user has no leagues yet. */
  onCancel?: () => void;
}

export function LeagueOnboarding({ initialCode, onDone, onCancel }: Props) {
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-4 flex rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors',
            mode === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600',
          )}
        >
          <Plus className="size-4" /> Create
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors',
            mode === 'join' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600',
          )}
        >
          <Users className="size-4" /> Join
        </button>
      </div>

      {mode === 'create' ? (
        <CreateLeagueForm onDone={onDone} />
      ) : (
        <JoinLeagueForm initialCode={initialCode} onDone={onDone} />
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full text-center text-sm text-gray-500 underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function CreateLeagueForm({ onDone }: { onDone: () => void }) {
  const { refresh, selectLeague } = useLeagues();
  const [name, setName] = useState('');
  const size: LeagueSize = 5;
  const [season] = useState(getDefaultSeason());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const leagueId = await createLeague({ name, size, season });
      await refresh();
      selectLeague(leagueId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the league');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <label htmlFor="league-name" className="mb-2 block text-sm font-medium text-gray-700">
        League name
      </label>
      <input
        id="league-name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="The Association"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-orange-500"
      />

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-sm font-medium text-gray-900">5 players · 6 teams each</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Everyone drafts one team from each of the 6 divisions.
        </p>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        Season <span className="font-medium text-gray-900">{formatSeason(season)}</span>
      </p>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Create league
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}

function JoinLeagueForm({
  initialCode,
  onDone,
}: {
  initialCode?: string | null;
  onDone: () => void;
}) {
  const { refresh, selectLeague } = useLeagues();
  const [code, setCode] = useState(initialCode ?? '');
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up the league as soon as a complete code is entered.
  useEffect(() => {
    const normalized = normalizeInviteCode(code);
    if (!isValidInviteCode(normalized)) {
      setPreview(null);
      return;
    }
    let active = true;
    setError(null);
    peekLeague(normalized)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        if (!result) setError('No league found for that code');
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Lookup failed');
      });
    return () => {
      active = false;
    };
  }, [code]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const leagueId = await joinLeague(code);
      await refresh();
      selectLeague(leagueId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  const full = preview ? preview.memberCount >= preview.size : false;
  const started = preview ? preview.draftStatus !== 'pending' : false;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <label htmlFor="invite-code" className="mb-2 block text-sm font-medium text-gray-700">
        Invite code
      </label>
      <input
        id="invite-code"
        required
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC123"
        maxLength={6}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-xl tracking-[0.3em] uppercase outline-none focus:border-orange-500"
      />

      {preview && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-900">{preview.name}</p>
          <p className="mt-0.5 text-gray-600">
            {formatSeason(preview.season)} · {preview.memberCount} of {preview.size}{' '}
            players
          </p>
          {full && <p className="mt-2 text-red-600">This league is full.</p>}
          {started && !full && (
            <p className="mt-2 text-red-600">This league’s draft has already started.</p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !preview || full || started}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Join league
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}
