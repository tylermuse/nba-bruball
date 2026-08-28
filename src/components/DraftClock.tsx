import { Pause, Play, Radio, WifiOff } from 'lucide-react';
import { formatClock, clockTone } from '../lib/liveDraft';
import type { ConnectionState } from '../lib/useRealtimeDraft';
import { cn } from '../lib/utils';

interface Props {
  remaining: number | null;
  paused: boolean;
  connection: ConnectionState;
  isCommissioner: boolean;
  onPause: () => void;
  onResume: () => void;
  presentCount: number;
}

export function DraftClock({
  remaining,
  paused,
  connection,
  isCommissioner,
  onPause,
  onResume,
  presentCount,
}: Props) {
  const tone = paused ? 'idle' : clockTone(remaining);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <div
        className={cn(
          'flex h-14 w-20 shrink-0 items-center justify-center rounded-lg font-mono text-2xl font-semibold tabular-nums',
          tone === 'warning' && 'bg-red-50 text-red-600',
          tone === 'expired' && 'animate-pulse bg-red-100 text-red-700',
          tone === 'normal' && 'bg-gray-100 text-gray-900',
          tone === 'idle' && 'bg-gray-100 text-gray-400',
        )}
        aria-live="polite"
        aria-label={paused ? 'Draft paused' : `${remaining ?? 0} seconds remaining`}
      >
        {paused ? '⏸' : formatClock(remaining)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          {connection === 'live' ? (
            <>
              <Radio className="size-3.5 text-green-600" />
              <span className="text-green-700">Live</span>
            </>
          ) : connection === 'error' ? (
            <>
              <WifiOff className="size-3.5 text-amber-600" />
              <span className="text-amber-700">Reconnecting…</span>
            </>
          ) : (
            <span className="text-gray-400">Connecting…</span>
          )}
          {presentCount > 0 && (
            <span className="text-gray-400">· {presentCount} in the room</span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-gray-600">
          {paused
            ? 'Paused by the commissioner'
            : remaining === 0
              ? 'Time — autopicking…'
              : 'Pick clock'}
        </p>
      </div>

      {isCommissioner && (
        <button
          type="button"
          onClick={paused ? onResume : onPause}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      )}
    </div>
  );
}
