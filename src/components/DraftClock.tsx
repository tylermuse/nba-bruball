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
  /** True when it's the signed-in user's pick — turns the clock into the hero. */
  myTurn?: boolean;
}

function ConnBadge({
  connection,
  presentCount,
  tint,
}: {
  connection: ConnectionState;
  presentCount: number;
  tint?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {connection === 'live' ? (
        <>
          <Radio className={cn('size-3.5', tint ? 'text-white' : 'text-green-600')} />
          <span className={tint ? 'text-white/90' : 'text-green-700'}>Live</span>
        </>
      ) : connection === 'error' ? (
        <>
          <WifiOff className={cn('size-3.5', tint ? 'text-white' : 'text-amber-600')} />
          <span className={tint ? 'text-white/90' : 'text-amber-700'}>Reconnecting…</span>
        </>
      ) : (
        <span className={tint ? 'text-white/80' : 'text-gray-400'}>Connecting…</span>
      )}
      {presentCount > 0 && (
        <span className={tint ? 'text-white/70' : 'text-gray-400'}>
          · {presentCount} in the room
        </span>
      )}
    </div>
  );
}

export function DraftClock({
  remaining,
  paused,
  connection,
  isCommissioner,
  onPause,
  onResume,
  presentCount,
  myTurn = false,
}: Props) {
  const tone = paused ? 'idle' : clockTone(remaining);

  // Your pick: the clock takes over the screen. Urgent when time is short.
  if (myTurn && !paused) {
    const urgent = tone === 'warning' || tone === 'expired';
    return (
      <div
        className={cn(
          'rounded-xl p-4 text-white shadow-lg',
          urgent ? 'bg-red-600 shadow-red-600/25' : 'bg-orange-600 shadow-orange-600/25',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider uppercase text-white/90">
            You're on the clock
          </span>
          <ConnBadge connection={connection} presentCount={presentCount} tint />
        </div>
        <div className="mt-1 flex items-end gap-3">
          <span
            className={cn(
              'font-mono text-5xl leading-none font-bold tabular-nums',
              tone === 'expired' && 'animate-pulse',
            )}
          >
            {formatClock(remaining)}
          </span>
          <span className="pb-1.5 text-sm text-white/80">
            {remaining === 0 ? 'Time — autopicking…' : 'left to pick'}
          </span>
          {isCommissioner && (
            <button
              type="button"
              onClick={onPause}
              aria-label="Pause draft"
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-white/40 px-3 py-2 text-sm text-white"
            >
              <Pause className="size-4" /> Pause
            </button>
          )}
        </div>
      </div>
    );
  }

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
        {paused ? <Pause className="size-6" /> : formatClock(remaining)}
      </div>

      <div className="min-w-0 flex-1">
        <ConnBadge connection={connection} presentCount={presentCount} />
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
