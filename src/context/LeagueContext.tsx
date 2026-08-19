import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMyLeagues } from '../lib/leagues';
import type { League } from '../lib/types';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'nba-bruball:selected-league';

interface LeagueContextValue {
  leagues: League[];
  selectedLeague: League | null;
  selectLeague: (leagueId: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const LeagueContext = createContext<LeagueContextValue | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setLeagues([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLeagues(await fetchMyLeagues());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectLeague = useCallback((leagueId: string) => {
    setSelectedId(leagueId);
    try {
      localStorage.setItem(STORAGE_KEY, leagueId);
    } catch {
      // Storage can be unavailable in private mode; selection just won't persist.
    }
  }, []);

  // Fall back to the first league if the stored one is gone (or never set).
  const selectedLeague = useMemo(() => {
    if (!leagues.length) return null;
    return leagues.find((l) => l.id === selectedId) ?? leagues[0];
  }, [leagues, selectedId]);

  const value = useMemo<LeagueContextValue>(
    () => ({ leagues, selectedLeague, selectLeague, refresh, loading, error }),
    [leagues, selectedLeague, selectLeague, refresh, loading, error],
  );

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeagues(): LeagueContextValue {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeagues must be used inside a LeagueProvider');
  return ctx;
}
