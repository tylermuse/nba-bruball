import { requireSupabase } from './supabase';

/**
 * Live-draft controls. All of these are SECURITY DEFINER RPCs — the client
 * never writes draft tables directly, so turn order and permissions are
 * enforced in one place regardless of which mode the league is in.
 */

export async function pauseDraft(leagueId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('pause_draft', {
    target_league: leagueId,
  });
  if (error) throw new Error(error.message);
}

export async function resumeDraft(leagueId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('resume_draft', {
    target_league: leagueId,
  });
  if (error) throw new Error(error.message);
}

export async function setPickSeconds(leagueId: string, seconds: number): Promise<void> {
  const { error } = await requireSupabase().rpc('set_pick_seconds', {
    target_league: leagueId,
    secs: seconds,
  });
  if (error) throw new Error(error.message);
}

/**
 * No-ops server-side unless the deadline has actually passed, so it's safe for
 * every connected client to call — whoever gets there first makes the pick and
 * the rest see it via Realtime.
 */
export async function autopickIfExpired(leagueId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('autopick_if_expired', {
    target_league: leagueId,
  });
  if (error) throw new Error(error.message);
  return data !== null;
}

// --- timer maths (pure, unit-tested) ---------------------------------------

/** Whole seconds remaining, clamped at zero. */
export function secondsRemaining(
  deadline: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Urgency drives the timer's colour; 10s is the "hurry up" threshold. */
export function clockTone(seconds: number | null): 'idle' | 'normal' | 'warning' | 'expired' {
  if (seconds === null) return 'idle';
  if (seconds === 0) return 'expired';
  if (seconds <= 10) return 'warning';
  return 'normal';
}
