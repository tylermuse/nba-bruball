import { getStandings, getPlayoffs } from '../_lib/fetchers';
import { getDefaultSeason } from '../../src/lib/season';
import { isPlausibleStandings } from '../../src/lib/nbaSources';

/**
 * Nightly NBA snapshot → Supabase.
 *
 * Runs on a Vercel cron (see vercel.json) at 5am ET, late enough that even
 * West-coast games are final. The app then reads the cached snapshot instead of
 * calling a third-party API on every page load.
 *
 * Secrets: SUPABASE_SERVICE_ROLE_KEY is required to write past RLS, and is
 * server-side only — never expose it with a VITE_ prefix.
 */

function unauthorized(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = process.env.CRON_SECRET;
  // Vercel signs its own cron invocations with this header.
  const auth = req.headers.authorization;
  if (!secret) return false; // no secret configured — allow (dev)
  return auth !== `Bearer ${secret}`;
}

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined>; query: Record<string, string> },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (k: string, v: string) => void;
  },
) {
  if (unauthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: 'Supabase service credentials are not configured' });
    return;
  }

  // Sync the current season, plus the previous one while the new season is
  // still young and leagues may still be looking at last year's results.
  const current = Number(req.query.season) || getDefaultSeason();
  const seasons = req.query.season ? [current] : [current, current - 1];

  const results: Array<Record<string, unknown>> = [];

  for (const season of seasons) {
    try {
      const [standings, playoffs] = await Promise.all([
        getStandings(season),
        getPlayoffs(season),
      ]);

      const teamCount = Object.keys(standings.data).length;

      // Never overwrite a good snapshot with an empty or partial one — a bad
      // upstream response should leave yesterday's data in place.
      if (teamCount === 0 || !isPlausibleStandings(standings.data)) {
        results.push({ season, skipped: true, reason: 'implausible or empty standings', teamCount });
        continue;
      }

      const response = await fetch(`${url}/rest/v1/nba_season_cache`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          season,
          standings: standings.data,
          playoffs: playoffs.data,
          source: standings.source,
          team_count: teamCount,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        results.push({ season, ok: false, status: response.status, body: await response.text() });
        continue;
      }

      results.push({
        season,
        ok: true,
        teamCount,
        source: standings.source,
        playoffTeams: Object.keys(playoffs.data).length,
      });
    } catch (err) {
      results.push({ season, ok: false, error: err instanceof Error ? err.message : 'failed' });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ syncedAt: new Date().toISOString(), results });
}
