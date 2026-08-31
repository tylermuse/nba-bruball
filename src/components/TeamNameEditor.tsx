import { useState, type FormEvent } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { setMyTeamName } from '../lib/leagues';

interface Props {
  leagueId: string;
  currentName: string;
  onSaved: () => Promise<void> | void;
}

/**
 * Members join with a name derived from their email, which reads badly on the
 * leaderboard. This lets them set an actual team name.
 */
export function TeamNameEditor({ leagueId, currentName, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Pick a name');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setMyTeamName(leagueId, trimmed);
      await onSaved();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Your team name</p>
          <p className="truncate font-medium text-gray-900">
            {currentName || 'Unnamed'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setValue(currentName);
            setEditing(true);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          <Pencil className="size-3.5" /> Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save}>
      <label htmlFor="team-name" className="mb-1 block text-xs text-gray-500">
        Your team name
      </label>
      <div className="flex gap-2">
        <input
          id="team-name"
          autoFocus
          maxLength={40}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-orange-500"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label="Save team name"
          className="flex shrink-0 items-center justify-center rounded-lg bg-orange-600 px-3 text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          aria-label="Cancel"
          className="flex shrink-0 items-center justify-center rounded-lg border border-gray-300 px-3 text-gray-600"
        >
          <X className="size-4" />
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
