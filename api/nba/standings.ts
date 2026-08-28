import { getStandings } from '../_lib/fetchers';
import { getDefaultSeason } from '../../src/lib/season';

export default async function handler(req: { query: Record<string, string> }, res: any) {
  try {
    const season = Number(req.query.season) || getDefaultSeason();
    const result = await getStandings(season);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
