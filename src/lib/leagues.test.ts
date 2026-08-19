import { describe, it, expect } from 'vitest';
import {
  normalizeInviteCode,
  isValidInviteCode,
  buildInviteUrl,
  readInviteCodeFromUrl,
} from './leagues';
import { mapLeague, mapMember, mapPreview } from './types';

describe('invite codes', () => {
  it('uppercases and trims', () => {
    expect(normalizeInviteCode('  abc123  ')).toBe('ABC123');
  });

  it('strips spaces and dashes people type', () => {
    expect(normalizeInviteCode('ABC-123')).toBe('ABC123');
    expect(normalizeInviteCode('AB C1 23')).toBe('ABC123');
  });

  it('accepts a valid 6-character code', () => {
    expect(isValidInviteCode('ABC234')).toBe(true);
    expect(isValidInviteCode('abc234')).toBe(true);
  });

  it('rejects wrong lengths', () => {
    expect(isValidInviteCode('ABC23')).toBe(false);
    expect(isValidInviteCode('ABC2345')).toBe(false);
    expect(isValidInviteCode('')).toBe(false);
  });

  it('rejects ambiguous characters excluded from the alphabet', () => {
    // O/0 and I/1 are deliberately not in the generator's alphabet.
    expect(isValidInviteCode('ABC0EF')).toBe(false);
    expect(isValidInviteCode('ABC1EF')).toBe(false);
    expect(isValidInviteCode('ABCOEF')).toBe(false);
    expect(isValidInviteCode('ABCIEF')).toBe(false);
  });

  it('rejects punctuation', () => {
    expect(isValidInviteCode('ABC!23')).toBe(false);
  });
});

describe('invite links', () => {
  it('builds a shareable url', () => {
    expect(buildInviteUrl('abc234', 'https://nba.bruball.app')).toBe(
      'https://nba.bruball.app/?join=ABC234',
    );
  });

  it('reads a code back out of a query string', () => {
    expect(readInviteCodeFromUrl('?join=ABC234')).toBe('ABC234');
    expect(readInviteCodeFromUrl('?foo=1&join=abc234')).toBe('ABC234');
  });

  it('round-trips', () => {
    const url = buildInviteUrl('XYZ789', 'https://example.com');
    const search = url.slice(url.indexOf('?'));
    expect(readInviteCodeFromUrl(search)).toBe('XYZ789');
  });

  it('returns null when there is no code', () => {
    expect(readInviteCodeFromUrl('')).toBeNull();
    expect(readInviteCodeFromUrl('?other=1')).toBeNull();
  });

  it('returns null for a malformed code rather than trying to join', () => {
    expect(readInviteCodeFromUrl('?join=NOPE')).toBeNull();
    expect(readInviteCodeFromUrl('?join=ABC0EF')).toBeNull();
  });
});

describe('row mappers', () => {
  it('maps a league row to camelCase', () => {
    const league = mapLeague({
      id: 'l1',
      name: 'The Association',
      season_year: 2026,
      size: 6,
      draft_mode: 'async',
      draft_status: 'pending',
      invite_code: 'ABC234',
      scoring_config: {
        winPoints: 1,
        seriesPoints: {
          playIn: 0,
          firstRound: 4,
          confSemifinals: 7,
          confFinals: 11,
          finals: 16,
        },
      },
      role: 'commissioner',
      member_count: 3,
    });

    expect(league.seasonYear).toBe(2026);
    expect(league.draftStatus).toBe('pending');
    expect(league.inviteCode).toBe('ABC234');
    expect(league.memberCount).toBe(3);
    expect(league.scoringConfig.seriesPoints.finals).toBe(16);
  });

  it('coerces counts that arrive as strings from postgres bigint', () => {
    const preview = mapPreview({
      id: 'l1',
      name: 'Test',
      season_year: 2026,
      size: 6,
      // Postgres bigint often serializes as a string.
      member_count: '4' as unknown as number,
      draft_status: 'pending',
    });
    expect(preview.memberCount).toBe(4);
    expect(typeof preview.memberCount).toBe('number');
  });

  it('preserves a null draft slot before the order is set', () => {
    const member = mapMember({
      id: 'm1',
      league_id: 'l1',
      user_id: 'u1',
      role: 'member',
      display_name: 'Tyler',
      draft_slot: null,
    });
    expect(member.draftSlot).toBeNull();
    expect(member.displayName).toBe('Tyler');
  });
});
