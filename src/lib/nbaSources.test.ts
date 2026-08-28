import { describe, it, expect } from 'vitest';
import {
  toEspnSeason,
  fromEspnSeason,
  resolveTeamId,
  parseEspnStandings,
  parseEspnPlayoffs,
  parseEspnScoreboard,
  parseSportsDataStandings,
  roundFromHeadline,
  isPlausibleStandings,
  isPlausiblePlayoffs,
  playoffDateRange,
} from './nbaSources';
import { getRosterPoints, getPlayoffPoints, DEFAULT_SCORING } from './scoring';
import { TEAMS } from '../data/teams';
import snapshot from '../data/season-2025.json';
import type { PlayoffResults, StandingsMap } from './scoring';

describe('season mapping', () => {
  it('converts our starting-year season to ESPN’s ending-year param', () => {
    // We call it 2025 (the 2025-26 season); ESPN calls it 2026.
    expect(toEspnSeason(2025)).toBe(2026);
    expect(toEspnSeason(2026)).toBe(2027);
  });

  it('round-trips', () => {
    expect(fromEspnSeason(toEspnSeason(2025))).toBe(2025);
  });
});

describe('team resolution across feeds', () => {
  it('maps ESPN abbreviations', () => {
    expect(resolveTeamId('NY')).toBe('new-york-knicks');
    expect(resolveTeamId('GS')).toBe('golden-state-warriors');
    expect(resolveTeamId('SA')).toBe('san-antonio-spurs');
    expect(resolveTeamId('UTAH')).toBe('utah-jazz');
  });

  it('maps SportsData.io style abbreviations via aliases', () => {
    expect(resolveTeamId('NYK')).toBe('new-york-knicks');
    expect(resolveTeamId('GSW')).toBe('golden-state-warriors');
    expect(resolveTeamId('SAS')).toBe('san-antonio-spurs');
    expect(resolveTeamId('NOP')).toBe('new-orleans-pelicans');
    expect(resolveTeamId('PHO')).toBe('phoenix-suns');
    expect(resolveTeamId('UTA')).toBe('utah-jazz');
  });

  it('falls back to full name', () => {
    expect(resolveTeamId(null, 'Los Angeles Lakers')).toBe('los-angeles-lakers');
    expect(resolveTeamId('ZZZ', 'LA Clippers')).toBe('la-clippers');
  });

  it('returns null for an unknown team rather than guessing', () => {
    expect(resolveTeamId('ZZZ', 'Seattle SuperSonics')).toBeNull();
  });
});

describe('ESPN standings parsing', () => {
  const fixture = {
    standings: {
      entries: [
        {
          team: { displayName: 'Oklahoma City Thunder', abbreviation: 'OKC' },
          stats: [
            { name: 'wins', value: 64 },
            { name: 'losses', value: 18 },
            { name: 'winPercent', value: 0.78 },
          ],
        },
        {
          team: { displayName: 'Washington Wizards', abbreviation: 'WSH' },
          stats: [
            { name: 'wins', value: 17 },
            { name: 'losses', value: 65 },
          ],
        },
      ],
    },
  };

  it('keys standings by our team ids', () => {
    const parsed = parseEspnStandings(fixture);
    expect(parsed['oklahoma-city-thunder']).toEqual({ wins: 64, losses: 18 });
    expect(parsed['washington-wizards']).toEqual({ wins: 17, losses: 65 });
  });

  it('ignores unknown teams instead of throwing', () => {
    const parsed = parseEspnStandings({
      standings: { entries: [{ team: { abbreviation: 'ZZZ' }, stats: [] }] },
    });
    expect(Object.keys(parsed)).toHaveLength(0);
  });

  it('handles an empty response (season not started)', () => {
    expect(parseEspnStandings({})).toEqual({});
  });
});

describe('playoff round detection', () => {
  it('recognizes every headline format ESPN used in 2025-26', () => {
    expect(roundFromHeadline('NBA Play-In - East - 7th Place vs 8th Place')).toBe('playIn');
    expect(roundFromHeadline('NBA Play-In - West - 8th Seed Game')).toBe('playIn');
    expect(roundFromHeadline('East 1st Round - Game 3')).toBe('firstRound');
    expect(roundFromHeadline('West 1st Round - Game 7')).toBe('firstRound');
    expect(roundFromHeadline('East Semifinals - Game 2')).toBe('confSemifinals');
    expect(roundFromHeadline('West Conference Finals - Game 1')).toBe('confFinals');
    expect(roundFromHeadline('East Finals - Game 4')).toBe('confFinals');
    expect(roundFromHeadline('NBA Finals - Game 5')).toBe('finals');
  });

  it('does not mistake the conference finals for the NBA Finals', () => {
    expect(roundFromHeadline('West Finals - Game 1')).toBe('confFinals');
    expect(roundFromHeadline('NBA Finals - Game 1')).toBe('finals');
  });

  it('returns null for regular-season or missing headlines', () => {
    expect(roundFromHeadline('')).toBeNull();
    expect(roundFromHeadline(null)).toBeNull();
    expect(roundFromHeadline('Regular Season')).toBeNull();
  });
});

describe('ESPN playoff series derivation', () => {
  const game = (headline: string, home: string, away: string, homeWon: boolean) => ({
    competitions: [
      {
        notes: [{ headline }],
        status: { type: { name: 'STATUS_FINAL' } },
        competitors: [
          { team: { abbreviation: home }, homeAway: 'home', winner: homeWon },
          { team: { abbreviation: away }, homeAway: 'away', winner: !homeWon },
        ],
      },
    ],
  });

  it('awards the series to whoever won the most games in it', () => {
    const events = [
      game('East 1st Round - Game 1', 'CLE', 'TOR', true),
      game('East 1st Round - Game 2', 'CLE', 'TOR', true),
      game('East 1st Round - Game 3', 'TOR', 'CLE', true),
      game('East 1st Round - Game 4', 'TOR', 'CLE', true),
      game('East 1st Round - Game 5', 'CLE', 'TOR', true),
      game('East 1st Round - Game 6', 'TOR', 'CLE', true),
      game('East 1st Round - Game 7', 'CLE', 'TOR', true),
    ];
    const parsed = parseEspnPlayoffs(events);
    expect(parsed['cleveland-cavaliers']).toEqual({ firstRound: 1 });
    expect(parsed['toronto-raptors']).toBeUndefined();
  });

  it('counts a sweep as one series win, not four', () => {
    const events = [1, 2, 3, 4].map((n) =>
      game(`West 1st Round - Game ${n}`, 'OKC', 'PHX', true),
    );
    expect(parseEspnPlayoffs(events)['oklahoma-city-thunder']).toEqual({ firstRound: 1 });
  });

  it('keeps rounds separate for a team that advances', () => {
    const events = [
      game('East 1st Round - Game 1', 'NY', 'ATL', true),
      game('East Semifinals - Game 1', 'NY', 'PHI', true),
      game('East Finals - Game 1', 'NY', 'CLE', true),
      game('NBA Finals - Game 1', 'NY', 'SA', true),
    ];
    const parsed = parseEspnPlayoffs(events);
    expect(parsed['new-york-knicks']).toEqual({
      firstRound: 1,
      confSemifinals: 1,
      confFinals: 1,
      finals: 1,
    });
  });

  it('ignores games that are not final', () => {
    const inProgress = {
      competitions: [
        {
          notes: [{ headline: 'NBA Finals - Game 6' }],
          status: { type: { name: 'STATUS_IN_PROGRESS' } },
          competitors: [
            { team: { abbreviation: 'NY' }, homeAway: 'home', winner: false },
            { team: { abbreviation: 'SA' }, homeAway: 'away', winner: false },
          ],
        },
      ],
    };
    expect(parseEspnPlayoffs([inProgress])).toEqual({});
  });
});

describe('scoreboard parsing', () => {
  it('extracts a game with scores and winner', () => {
    const games = parseEspnScoreboard({
      events: [
        {
          id: '1',
          date: '2026-04-15T23:30Z',
          competitions: [
            {
              notes: [{ headline: 'NBA Play-In - East - 7th Place vs 8th Place' }],
              status: { type: { name: 'STATUS_FINAL' } },
              competitors: [
                { team: { abbreviation: 'PHI' }, homeAway: 'home', score: '109', winner: true },
                { team: { abbreviation: 'ORL' }, homeAway: 'away', score: '97', winner: false },
              ],
            },
          ],
        },
      ],
    });
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      homeTeamId: 'philadelphia-76ers',
      awayTeamId: 'orlando-magic',
      homeScore: 109,
      awayScore: 97,
      completed: true,
      winnerTeamId: 'philadelphia-76ers',
      round: 'playIn',
    });
  });
});

describe('SportsData.io standings parsing', () => {
  it('maps its abbreviations onto our ids', () => {
    const parsed = parseSportsDataStandings([
      { Key: 'NYK', City: 'New York', Name: 'Knicks', Wins: 53, Losses: 29 },
      { Key: 'GSW', City: 'Golden State', Name: 'Warriors', Wins: 37, Losses: 45 },
    ]);
    expect(parsed['new-york-knicks']).toEqual({ wins: 53, losses: 29 });
    expect(parsed['golden-state-warriors']).toEqual({ wins: 37, losses: 45 });
  });
});

describe('payload sanity checks (fallback gating)', () => {
  const full = (): StandingsMap =>
    Object.fromEntries(TEAMS.map((t) => [t.id, { wins: 41, losses: 41 }]));

  it('accepts a balanced full-league payload', () => {
    expect(isPlausibleStandings(full())).toBe(true);
  });

  it('rejects a partial league — a truncated feed must fall through', () => {
    const partial = full();
    delete partial['boston-celtics'];
    expect(isPlausibleStandings(partial)).toBe(false);
  });

  it('rejects unbalanced wins and losses', () => {
    const bad = full();
    bad['boston-celtics'] = { wins: 82, losses: 0 };
    expect(isPlausibleStandings(bad)).toBe(false);
  });

  it('rejects impossible game counts', () => {
    const bad = full();
    bad['boston-celtics'] = { wins: 90, losses: 0 };
    expect(isPlausibleStandings(bad)).toBe(false);
  });

  it('rejects null/empty', () => {
    expect(isPlausibleStandings(null)).toBe(false);
    expect(isPlausibleStandings({})).toBe(false);
  });

  it('rejects playoff data claiming two champions', () => {
    const bad: PlayoffResults = {
      'new-york-knicks': { finals: 1 },
      'san-antonio-spurs': { finals: 1 },
    };
    expect(isPlausiblePlayoffs(bad)).toBe(false);
  });

  it('rejects a team winning the same round twice', () => {
    expect(isPlausiblePlayoffs({ 'new-york-knicks': { firstRound: 2 } })).toBe(false);
  });
});

describe('playoff date range', () => {
  it('spans April to July of the season’s ending year', () => {
    expect(playoffDateRange(2025)).toEqual({ start: '20260410', end: '20260701' });
  });
});

// ---------------------------------------------------------------------------
// The real test: score the actual 2025-26 season.
// ---------------------------------------------------------------------------

describe('scoring the real 2025-26 season', () => {
  const standings = snapshot.standings as StandingsMap;
  const playoffs = snapshot.playoffs as PlayoffResults;

  it('has a complete, internally consistent snapshot', () => {
    expect(Object.keys(standings)).toHaveLength(30);
    const wins = Object.values(standings).reduce((s, r) => s + r.wins, 0);
    const losses = Object.values(standings).reduce((s, r) => s + r.losses, 0);
    expect(wins).toBe(losses);
    expect(wins).toBe((30 * 82) / 2);
    expect(isPlausibleStandings(standings)).toBe(true);
    expect(isPlausiblePlayoffs(playoffs)).toBe(true);
  });

  it('scores the champion at 38 playoff points', () => {
    // New York won the 2026 Finals over San Antonio.
    expect(getPlayoffPoints(playoffs['new-york-knicks'])).toBe(38);
  });

  it('scores the runner-up at 22', () => {
    expect(getPlayoffPoints(playoffs['san-antonio-spurs'])).toBe(22);
  });

  it('scores a conference semifinalist at 11', () => {
    // OKC won the first round and the semis, then lost the conference finals.
    expect(getPlayoffPoints(playoffs['oklahoma-city-thunder'])).toBe(11);
  });

  it('gives play-in wins no points on their own', () => {
    // Golden State won a play-in game but no playoff series.
    expect(getPlayoffPoints(playoffs['golden-state-warriors'])).toBe(0);
  });

  it('gives a play-in team credit only for the series it actually won', () => {
    // Philadelphia came through the play-in and won a first-round series.
    expect(getPlayoffPoints(playoffs['philadelphia-76ers'])).toBe(4);
  });

  it('totals a champion’s season correctly', () => {
    // NY: 53 regular-season wins + 38 playoff points.
    expect(getRosterPoints(['new-york-knicks'], standings, playoffs)).toBe(53 + 38);
  });

  it('makes a title run worth roughly a strong team’s regular season', () => {
    const nyTitleRun = getPlayoffPoints(playoffs['new-york-knicks']);
    const okcRegularSeason = standings['oklahoma-city-thunder'].wins;
    // 38 vs 64 — big, but it does not eclipse a full season.
    expect(nyTitleRun).toBeLessThan(okcRegularSeason);
    expect(nyTitleRun).toBeGreaterThan(okcRegularSeason / 2);
  });

  it('ranks a real 6-team roster the way the season actually went', () => {
    // Champion + best record beats a roster of also-rans.
    const contenders = ['new-york-knicks', 'oklahoma-city-thunder'];
    const stragglers = ['washington-wizards', 'brooklyn-nets'];
    expect(getRosterPoints(contenders, standings, playoffs)).toBeGreaterThan(
      getRosterPoints(stragglers, standings, playoffs),
    );
  });

  it('respects a league’s custom scoring config', () => {
    const doubled = {
      ...DEFAULT_SCORING,
      seriesPoints: { ...DEFAULT_SCORING.seriesPoints, finals: 32 },
    };
    expect(getPlayoffPoints(playoffs['new-york-knicks'], doubled)).toBe(38 + 16);
  });
});
