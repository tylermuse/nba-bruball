/**
 * NBA season helpers.
 *
 * The NBA runs ~October → June, so a "season" spans two calendar years. We
 * label a season by its STARTING year: the 2026-27 season is season 2026.
 *
 * The NFL app cut over in August; for the NBA we cut over on August 1, which
 * sits in the dead middle of the offseason (after the Finals, before camp).
 */

export const SEASON_CUTOVER_MONTH = 8; // August

/**
 * Starting year of the current or upcoming NBA season.
 *
 * Uses the viewer's local calendar date — a season boundary that lands mid
 * offseason is never time-sensitive enough for UTC vs. local to matter.
 */
export function getDefaultSeason(now: Date = new Date()): number {
  const month = now.getMonth() + 1; // 1–12
  const year = now.getFullYear();
  // Jan–Jul: we're in the back half of a season that started last year.
  // Aug–Dec: the season starting this year is current or about to tip off.
  return month < SEASON_CUTOVER_MONTH ? year - 1 : year;
}

/** Display label for a season, e.g. 2026 → "2026-27". */
export function formatSeason(season: number): string {
  const endYear = (season + 1) % 100;
  return `${season}-${String(endYear).padStart(2, '0')}`;
}

export type SeasonPhase = 'offseason' | 'regular' | 'postseason';

/**
 * Rough phase of the season for UI copy. Approximate by design — the live data
 * layer reports the authoritative phase when live data is available.
 */
export function getSeasonPhase(now: Date = new Date()): SeasonPhase {
  const month = now.getMonth() + 1;
  if (month >= 10 || month <= 3) return 'regular';
  if (month === 4 || month === 5 || month === 6) return 'postseason';
  return 'offseason';
}
