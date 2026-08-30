import { describe, it, expect } from 'vitest';
import { isCacheStale, CACHE_MAX_AGE_MS, weekRange, midSeasonDate } from './useNbaData';

describe('cache staleness', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  it('accepts a snapshot from this morning', () => {
    expect(isCacheStale('2026-11-20T10:00:00Z', now)).toBe(false);
  });

  it('accepts one missed nightly run', () => {
    // The job runs daily; a single failure should not trigger a live fetch.
    expect(isCacheStale('2026-11-19T10:00:00Z', now)).toBe(false);
  });

  it('treats more than two days as stale', () => {
    expect(isCacheStale('2026-11-17T10:00:00Z', now)).toBe(true);
  });

  it('treats a missing or unparseable timestamp as stale', () => {
    expect(isCacheStale(null, now)).toBe(true);
    expect(isCacheStale(undefined, now)).toBe(true);
    expect(isCacheStale('not-a-date', now)).toBe(true);
  });

  it('uses a two-day window', () => {
    expect(CACHE_MAX_AGE_MS).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

describe('week helpers', () => {
  it('builds a 7-day range from an anchor', () => {
    expect(weekRange(new Date(2026, 0, 12), 6)).toBe('20260112-20260118');
  });

  it('handles a month boundary', () => {
    expect(weekRange(new Date(2026, 0, 28), 6)).toBe('20260128-20260203');
  });

  it('lands mid-January of the season’s second year', () => {
    // Season 2025 = the 2025-26 season, so mid-season is January 2026.
    const d = midSeasonDate(2025);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
  });
});
