import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { autopickIfExpired, secondsRemaining } from './liveDraft';
import type { League } from './types';

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'error';

interface Options {
  league: League | null;
  /** Called when the server says something changed. */
  onChange: () => void;
  /** Deadline for the current pick, from draft_state. */
  pickDeadline: string | null;
  paused: boolean;
}

export interface RealtimeDraft {
  connection: ConnectionState;
  /** Seconds left on the pick clock, or null when there's no clock. */
  remaining: number | null;
  /** Who else is in the draft room right now. */
  presentMemberIds: string[];
}

/**
 * Subscribes to draft changes and runs the pick clock.
 *
 * Realtime is the fast path, not the only path: a poll runs alongside it so a
 * dropped socket degrades to a slower refresh instead of a frozen board.
 */
export function useRealtimeDraft({
  league,
  onChange,
  pickDeadline,
  paused,
}: Options): RealtimeDraft {
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [presentMemberIds, setPresentMemberIds] = useState<string[]>([]);

  // Keep the latest callback without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const leagueId = league?.id ?? null;
  const isLive = league?.draftMode === 'live' && league?.draftStatus === 'in_progress';

  // --- subscription -------------------------------------------------------
  useEffect(() => {
    if (!leagueId || !supabase) {
      setConnection('idle');
      return;
    }

    setConnection('connecting');
    const client = supabase;
    const channel = client
      .channel(`draft:${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_picks', filter: `league_id=eq.${leagueId}` },
        () => onChangeRef.current(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_state', filter: `league_id=eq.${leagueId}` },
        () => onChangeRef.current(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        () => onChangeRef.current(),
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ memberId?: string }>();
        const ids = Object.values(state)
          .flat()
          .map((p) => p.memberId)
          .filter((id): id is string => Boolean(id));
        setPresentMemberIds([...new Set(ids)]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('error');
      });

    return () => {
      void client.removeChannel(channel);
      setConnection('idle');
    };
  }, [leagueId]);

  // --- safety-net poll ----------------------------------------------------
  // Realtime can drop silently. A slow poll means the worst case is a stale
  // board for a few seconds, not a draft that appears frozen.
  useEffect(() => {
    if (!leagueId) return;
    const id = window.setInterval(() => onChangeRef.current(), 15000);
    return () => window.clearInterval(id);
  }, [leagueId]);

  // --- pick clock ---------------------------------------------------------
  useEffect(() => {
    if (!pickDeadline || paused) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(secondsRemaining(pickDeadline));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pickDeadline, paused]);

  // --- autopick on expiry -------------------------------------------------
  // Every client may call this; the server no-ops unless the deadline really
  // passed, so the first one through wins and the rest are harmless.
  const firingRef = useRef(false);
  useEffect(() => {
    if (!leagueId || !isLive || paused) return;
    if (remaining !== 0) return;
    if (firingRef.current) return;

    firingRef.current = true;
    // Small stagger so five browsers don't all fire in the same millisecond.
    const delay = 500 + Math.random() * 1500;
    const id = window.setTimeout(() => {
      autopickIfExpired(leagueId)
        .then((made) => {
          if (made) onChangeRef.current();
        })
        .catch(() => {
          /* another client got there first — nothing to do */
        })
        .finally(() => {
          firingRef.current = false;
        });
    }, delay);

    return () => {
      window.clearTimeout(id);
      firingRef.current = false;
    };
  }, [remaining, leagueId, isLive, paused]);

  return { connection, remaining, presentMemberIds };
}

/** Announce this member's presence in the draft room. */
export function usePresence(leagueId: string | null, memberId: string | null) {
  useEffect(() => {
    if (!leagueId || !memberId || !supabase) return;
    const client = supabase;
    const channel = client.channel(`draft:${leagueId}`, {
      config: { presence: { key: memberId } },
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ memberId, at: new Date().toISOString() });
      }
    });
    return () => {
      void client.removeChannel(channel);
    };
  }, [leagueId, memberId]);
}
