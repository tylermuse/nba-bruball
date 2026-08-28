import { describe, it, expect } from 'vitest';
import { secondsRemaining, formatClock, clockTone } from './liveDraft';

const at = (iso: string) => new Date(iso);

describe('secondsRemaining', () => {
  const now = at('2026-10-20T19:00:00Z');

  it('counts down to a future deadline', () => {
    expect(secondsRemaining('2026-10-20T19:01:30Z', now)).toBe(90);
    expect(secondsRemaining('2026-10-20T19:00:10Z', now)).toBe(10);
  });

  it('clamps at zero once the deadline passes', () => {
    expect(secondsRemaining('2026-10-20T18:59:30Z', now)).toBe(0);
    expect(secondsRemaining('2026-10-20T18:00:00Z', now)).toBe(0);
  });

  it('rounds up so the clock does not show 0 while time remains', () => {
    // 500ms left should read as 1 second, not 0 — showing 0 would trigger
    // the autopick UI a beat early.
    expect(secondsRemaining('2026-10-20T19:00:00.500Z', now)).toBe(1);
  });

  it('returns null when there is no clock (async drafts)', () => {
    expect(secondsRemaining(null, now)).toBeNull();
    expect(secondsRemaining(undefined, now)).toBeNull();
  });

  it('returns null for an unparseable deadline rather than NaN', () => {
    expect(secondsRemaining('not-a-date', now)).toBeNull();
  });
});

describe('formatClock', () => {
  it('formats as m:ss', () => {
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(0)).toBe('0:00');
  });

  it('handles clocks over ten minutes', () => {
    expect(formatClock(600)).toBe('10:00');
  });

  it('shows placeholders when there is no clock', () => {
    expect(formatClock(null)).toBe('--:--');
  });
});

describe('clockTone', () => {
  it('warns in the last ten seconds', () => {
    expect(clockTone(11)).toBe('normal');
    expect(clockTone(10)).toBe('warning');
    expect(clockTone(1)).toBe('warning');
  });

  it('flags expiry distinctly from the warning state', () => {
    expect(clockTone(0)).toBe('expired');
  });

  it('is idle with no clock', () => {
    expect(clockTone(null)).toBe('idle');
  });
});
