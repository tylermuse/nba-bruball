import { describe, it, expect } from 'vitest';
import { getDefaultSeason, formatSeason, getSeasonPhase } from './season';

/**
 * Build a local-time date. Using `new Date('2026-08-01')` would parse as UTC
 * midnight, which is the previous day in negative-offset timezones — that
 * would make these boundary tests fail depending on where they run.
 */
const localDate = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0);

describe('getDefaultSeason', () => {
  it('treats January–July as the back half of last year’s season', () => {
    expect(getDefaultSeason(localDate(2027, 1, 15))).toBe(2026);
    expect(getDefaultSeason(localDate(2027, 4, 1))).toBe(2026);
    expect(getDefaultSeason(localDate(2027, 6, 20))).toBe(2026); // Finals
    expect(getDefaultSeason(localDate(2027, 7, 31))).toBe(2026);
  });

  it('rolls over to the new season on August 1', () => {
    expect(getDefaultSeason(localDate(2026, 8, 1))).toBe(2026);
    expect(getDefaultSeason(localDate(2026, 9, 15))).toBe(2026);
    expect(getDefaultSeason(localDate(2026, 10, 20))).toBe(2026); // opening night
    expect(getDefaultSeason(localDate(2026, 12, 25))).toBe(2026); // Christmas
  });

  it('flips exactly at the July 31 / August 1 boundary', () => {
    expect(getDefaultSeason(localDate(2026, 7, 31))).toBe(2025);
    expect(getDefaultSeason(localDate(2026, 8, 1))).toBe(2026);
  });

  it('spans the new year within one season', () => {
    expect(getDefaultSeason(localDate(2026, 12, 1))).toBe(
      getDefaultSeason(localDate(2027, 1, 1)),
    );
  });

  it('reports 2026 for today (Aug 2026 → the 2026-27 season)', () => {
    expect(getDefaultSeason(localDate(2026, 8, 18))).toBe(2026);
  });
});

describe('formatSeason', () => {
  it('renders a two-year label', () => {
    expect(formatSeason(2026)).toBe('2026-27');
    expect(formatSeason(2025)).toBe('2025-26');
  });

  it('pads the century rollover', () => {
    expect(formatSeason(2099)).toBe('2099-00');
  });
});

describe('getSeasonPhase', () => {
  it('reports regular season from October through March', () => {
    expect(getSeasonPhase(localDate(2026, 10, 25))).toBe('regular');
    expect(getSeasonPhase(localDate(2027, 1, 10))).toBe('regular');
    expect(getSeasonPhase(localDate(2027, 3, 1))).toBe('regular');
  });

  it('reports postseason April through June', () => {
    expect(getSeasonPhase(localDate(2027, 4, 20))).toBe('postseason');
    expect(getSeasonPhase(localDate(2027, 6, 10))).toBe('postseason');
  });

  it('reports offseason July through September', () => {
    expect(getSeasonPhase(localDate(2026, 7, 15))).toBe('offseason');
    expect(getSeasonPhase(localDate(2026, 8, 18))).toBe('offseason');
    expect(getSeasonPhase(localDate(2026, 9, 30))).toBe('offseason');
  });
});
