import { describe, it, expect } from 'vitest';
import {
  TEAMS,
  TEAM_COUNT,
  DIVISIONS,
  getTeamById,
  getTeamByAbbreviation,
  getTeamByName,
  getTeamsByConference,
  getTeamsByDivision,
  normalizeTeamName,
} from './teams';

describe('NBA team list', () => {
  it('has exactly 30 teams', () => {
    expect(TEAMS).toHaveLength(30);
    expect(TEAM_COUNT).toBe(30);
  });

  it('splits 15 East / 15 West', () => {
    expect(getTeamsByConference('East')).toHaveLength(15);
    expect(getTeamsByConference('West')).toHaveLength(15);
  });

  it('has 6 divisions of exactly 5 teams', () => {
    const divisions = [...DIVISIONS.East, ...DIVISIONS.West];
    expect(divisions).toHaveLength(6);
    divisions.forEach((division) => {
      expect(getTeamsByDivision(division)).toHaveLength(5);
    });
  });

  it('has unique ids and abbreviations', () => {
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(30);
    expect(new Set(TEAMS.map((t) => t.abbreviation)).size).toBe(30);
    expect(new Set(TEAMS.map((t) => t.name)).size).toBe(30);
  });

  it('gives every team complete metadata', () => {
    TEAMS.forEach((team) => {
      expect(team.id).toMatch(/^[a-z0-9-]+$/);
      expect(team.name.length).toBeGreaterThan(0);
      expect(team.city.length).toBeGreaterThan(0);
      expect(team.nickname.length).toBeGreaterThan(0);
      expect(team.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(team.secondaryColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(team.logoUrl).toMatch(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nba\/500\/.+\.png$/);
    });
  });
});

describe('team lookups', () => {
  it('finds by id', () => {
    expect(getTeamById('boston-celtics')?.name).toBe('Boston Celtics');
    expect(getTeamById('nope')).toBeUndefined();
  });

  it('finds by abbreviation, case-insensitively', () => {
    expect(getTeamByAbbreviation('BOS')?.id).toBe('boston-celtics');
    expect(getTeamByAbbreviation('bos')?.id).toBe('boston-celtics');
  });

  it('finds by full name', () => {
    expect(getTeamByName('Golden State Warriors')?.id).toBe('golden-state-warriors');
  });

  it('finds by nickname', () => {
    expect(getTeamByName('Celtics')?.id).toBe('boston-celtics');
  });

  it('reconciles the Clippers naming difference across feeds', () => {
    // ESPN says "LA Clippers", other feeds say "Los Angeles Clippers".
    expect(getTeamByName('LA Clippers')?.id).toBe('la-clippers');
    expect(getTeamByName('Los Angeles Clippers')?.id).toBe('la-clippers');
  });

  it('still distinguishes the Lakers from the Clippers', () => {
    expect(getTeamByName('Los Angeles Lakers')?.id).toBe('los-angeles-lakers');
  });

  it('normalizes punctuation and case', () => {
    expect(normalizeTeamName('Portland Trail Blazers')).toBe('portlandtrailblazers');
    expect(getTeamByName('philadelphia 76ers')?.id).toBe('philadelphia-76ers');
  });
});
