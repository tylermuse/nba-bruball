import { getScores } from '../_lib/fetchers';

/**
 * NBA games are keyed by date, not week. `dates` accepts YYYYMMDD or a
 * YYYYMMDD-YYYYMMDD range, matching ESPN's scoreboard parameter.
 */
export default async function handler(req: { query: Record<string, string> }, res: any) {
  try {
    const dates = req.query.dates || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const result = await getScores(dates);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
