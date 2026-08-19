export type Conference = 'East' | 'West';

export type Division =
  | 'Atlantic'
  | 'Central'
  | 'Southeast'
  | 'Northwest'
  | 'Pacific'
  | 'Southwest';

export interface Team {
  /** Stable slug used as the primary key everywhere (DB, draft picks, rosters). */
  id: string;
  /** Full display name, e.g. "Boston Celtics". */
  name: string;
  city: string;
  /** Nickname only, e.g. "Celtics". */
  nickname: string;
  /** ESPN/SportsData abbreviation, e.g. "BOS". */
  abbreviation: string;
  conference: Conference;
  division: Division;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
}

const logo = (abbr: string) =>
  `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`;

export const TEAMS: Team[] = [
  // ---------------- Eastern Conference — Atlantic ----------------
  {
    id: 'boston-celtics',
    name: 'Boston Celtics',
    city: 'Boston',
    nickname: 'Celtics',
    abbreviation: 'BOS',
    conference: 'East',
    division: 'Atlantic',
    primaryColor: '#007A33',
    secondaryColor: '#BA9653',
    logoUrl: logo('BOS'),
  },
  {
    id: 'brooklyn-nets',
    name: 'Brooklyn Nets',
    city: 'Brooklyn',
    nickname: 'Nets',
    abbreviation: 'BKN',
    conference: 'East',
    division: 'Atlantic',
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    logoUrl: logo('BKN'),
  },
  {
    id: 'new-york-knicks',
    name: 'New York Knicks',
    city: 'New York',
    nickname: 'Knicks',
    abbreviation: 'NY',
    conference: 'East',
    division: 'Atlantic',
    primaryColor: '#006BB6',
    secondaryColor: '#F58426',
    logoUrl: logo('NY'),
  },
  {
    id: 'philadelphia-76ers',
    name: 'Philadelphia 76ers',
    city: 'Philadelphia',
    nickname: '76ers',
    abbreviation: 'PHI',
    conference: 'East',
    division: 'Atlantic',
    primaryColor: '#006BB6',
    secondaryColor: '#ED174C',
    logoUrl: logo('PHI'),
  },
  {
    id: 'toronto-raptors',
    name: 'Toronto Raptors',
    city: 'Toronto',
    nickname: 'Raptors',
    abbreviation: 'TOR',
    conference: 'East',
    division: 'Atlantic',
    primaryColor: '#CE1141',
    secondaryColor: '#000000',
    logoUrl: logo('TOR'),
  },

  // ---------------- Eastern Conference — Central ----------------
  {
    id: 'chicago-bulls',
    name: 'Chicago Bulls',
    city: 'Chicago',
    nickname: 'Bulls',
    abbreviation: 'CHI',
    conference: 'East',
    division: 'Central',
    primaryColor: '#CE1141',
    secondaryColor: '#000000',
    logoUrl: logo('CHI'),
  },
  {
    id: 'cleveland-cavaliers',
    name: 'Cleveland Cavaliers',
    city: 'Cleveland',
    nickname: 'Cavaliers',
    abbreviation: 'CLE',
    conference: 'East',
    division: 'Central',
    primaryColor: '#860038',
    secondaryColor: '#FDBB30',
    logoUrl: logo('CLE'),
  },
  {
    id: 'detroit-pistons',
    name: 'Detroit Pistons',
    city: 'Detroit',
    nickname: 'Pistons',
    abbreviation: 'DET',
    conference: 'East',
    division: 'Central',
    primaryColor: '#C8102E',
    secondaryColor: '#1D42BA',
    logoUrl: logo('DET'),
  },
  {
    id: 'indiana-pacers',
    name: 'Indiana Pacers',
    city: 'Indiana',
    nickname: 'Pacers',
    abbreviation: 'IND',
    conference: 'East',
    division: 'Central',
    primaryColor: '#002D62',
    secondaryColor: '#FDBB30',
    logoUrl: logo('IND'),
  },
  {
    id: 'milwaukee-bucks',
    name: 'Milwaukee Bucks',
    city: 'Milwaukee',
    nickname: 'Bucks',
    abbreviation: 'MIL',
    conference: 'East',
    division: 'Central',
    primaryColor: '#00471B',
    secondaryColor: '#EEE1C6',
    logoUrl: logo('MIL'),
  },

  // ---------------- Eastern Conference — Southeast ----------------
  {
    id: 'atlanta-hawks',
    name: 'Atlanta Hawks',
    city: 'Atlanta',
    nickname: 'Hawks',
    abbreviation: 'ATL',
    conference: 'East',
    division: 'Southeast',
    primaryColor: '#E03A3E',
    secondaryColor: '#C1D32F',
    logoUrl: logo('ATL'),
  },
  {
    id: 'charlotte-hornets',
    name: 'Charlotte Hornets',
    city: 'Charlotte',
    nickname: 'Hornets',
    abbreviation: 'CHA',
    conference: 'East',
    division: 'Southeast',
    primaryColor: '#1D1160',
    secondaryColor: '#00788C',
    logoUrl: logo('CHA'),
  },
  {
    id: 'miami-heat',
    name: 'Miami Heat',
    city: 'Miami',
    nickname: 'Heat',
    abbreviation: 'MIA',
    conference: 'East',
    division: 'Southeast',
    primaryColor: '#98002E',
    secondaryColor: '#F9A01B',
    logoUrl: logo('MIA'),
  },
  {
    id: 'orlando-magic',
    name: 'Orlando Magic',
    city: 'Orlando',
    nickname: 'Magic',
    abbreviation: 'ORL',
    conference: 'East',
    division: 'Southeast',
    primaryColor: '#0077C0',
    secondaryColor: '#C4CED4',
    logoUrl: logo('ORL'),
  },
  {
    id: 'washington-wizards',
    name: 'Washington Wizards',
    city: 'Washington',
    nickname: 'Wizards',
    abbreviation: 'WSH',
    conference: 'East',
    division: 'Southeast',
    primaryColor: '#002B5C',
    secondaryColor: '#E31837',
    logoUrl: logo('WSH'),
  },

  // ---------------- Western Conference — Northwest ----------------
  {
    id: 'denver-nuggets',
    name: 'Denver Nuggets',
    city: 'Denver',
    nickname: 'Nuggets',
    abbreviation: 'DEN',
    conference: 'West',
    division: 'Northwest',
    primaryColor: '#0E2240',
    secondaryColor: '#FEC524',
    logoUrl: logo('DEN'),
  },
  {
    id: 'minnesota-timberwolves',
    name: 'Minnesota Timberwolves',
    city: 'Minnesota',
    nickname: 'Timberwolves',
    abbreviation: 'MIN',
    conference: 'West',
    division: 'Northwest',
    primaryColor: '#0C2340',
    secondaryColor: '#236192',
    logoUrl: logo('MIN'),
  },
  {
    id: 'oklahoma-city-thunder',
    name: 'Oklahoma City Thunder',
    city: 'Oklahoma City',
    nickname: 'Thunder',
    abbreviation: 'OKC',
    conference: 'West',
    division: 'Northwest',
    primaryColor: '#007AC1',
    secondaryColor: '#EF3B24',
    logoUrl: logo('OKC'),
  },
  {
    id: 'portland-trail-blazers',
    name: 'Portland Trail Blazers',
    city: 'Portland',
    nickname: 'Trail Blazers',
    abbreviation: 'POR',
    conference: 'West',
    division: 'Northwest',
    primaryColor: '#E03A3E',
    secondaryColor: '#000000',
    logoUrl: logo('POR'),
  },
  {
    id: 'utah-jazz',
    name: 'Utah Jazz',
    city: 'Utah',
    nickname: 'Jazz',
    abbreviation: 'UTAH',
    conference: 'West',
    division: 'Northwest',
    primaryColor: '#002B5C',
    secondaryColor: '#00471B',
    logoUrl: logo('UTAH'),
  },

  // ---------------- Western Conference — Pacific ----------------
  {
    id: 'golden-state-warriors',
    name: 'Golden State Warriors',
    city: 'Golden State',
    nickname: 'Warriors',
    abbreviation: 'GS',
    conference: 'West',
    division: 'Pacific',
    primaryColor: '#1D428A',
    secondaryColor: '#FFC72C',
    logoUrl: logo('GS'),
  },
  {
    id: 'la-clippers',
    name: 'LA Clippers',
    city: 'Los Angeles',
    nickname: 'Clippers',
    abbreviation: 'LAC',
    conference: 'West',
    division: 'Pacific',
    primaryColor: '#C8102E',
    secondaryColor: '#1D428A',
    logoUrl: logo('LAC'),
  },
  {
    id: 'los-angeles-lakers',
    name: 'Los Angeles Lakers',
    city: 'Los Angeles',
    nickname: 'Lakers',
    abbreviation: 'LAL',
    conference: 'West',
    division: 'Pacific',
    primaryColor: '#552583',
    secondaryColor: '#FDB927',
    logoUrl: logo('LAL'),
  },
  {
    id: 'phoenix-suns',
    name: 'Phoenix Suns',
    city: 'Phoenix',
    nickname: 'Suns',
    abbreviation: 'PHX',
    conference: 'West',
    division: 'Pacific',
    primaryColor: '#1D1160',
    secondaryColor: '#E56020',
    logoUrl: logo('PHX'),
  },
  {
    id: 'sacramento-kings',
    name: 'Sacramento Kings',
    city: 'Sacramento',
    nickname: 'Kings',
    abbreviation: 'SAC',
    conference: 'West',
    division: 'Pacific',
    primaryColor: '#5A2D81',
    secondaryColor: '#63727A',
    logoUrl: logo('SAC'),
  },

  // ---------------- Western Conference — Southwest ----------------
  {
    id: 'dallas-mavericks',
    name: 'Dallas Mavericks',
    city: 'Dallas',
    nickname: 'Mavericks',
    abbreviation: 'DAL',
    conference: 'West',
    division: 'Southwest',
    primaryColor: '#00538C',
    secondaryColor: '#002B5E',
    logoUrl: logo('DAL'),
  },
  {
    id: 'houston-rockets',
    name: 'Houston Rockets',
    city: 'Houston',
    nickname: 'Rockets',
    abbreviation: 'HOU',
    conference: 'West',
    division: 'Southwest',
    primaryColor: '#CE1141',
    secondaryColor: '#000000',
    logoUrl: logo('HOU'),
  },
  {
    id: 'memphis-grizzlies',
    name: 'Memphis Grizzlies',
    city: 'Memphis',
    nickname: 'Grizzlies',
    abbreviation: 'MEM',
    conference: 'West',
    division: 'Southwest',
    primaryColor: '#5D76A9',
    secondaryColor: '#12173F',
    logoUrl: logo('MEM'),
  },
  {
    id: 'new-orleans-pelicans',
    name: 'New Orleans Pelicans',
    city: 'New Orleans',
    nickname: 'Pelicans',
    abbreviation: 'NO',
    conference: 'West',
    division: 'Southwest',
    primaryColor: '#0C2340',
    secondaryColor: '#C8102E',
    logoUrl: logo('NO'),
  },
  {
    id: 'san-antonio-spurs',
    name: 'San Antonio Spurs',
    city: 'San Antonio',
    nickname: 'Spurs',
    abbreviation: 'SA',
    conference: 'West',
    division: 'Southwest',
    primaryColor: '#C4CED4',
    secondaryColor: '#000000',
    logoUrl: logo('SA'),
  },
];

export const TEAM_COUNT = TEAMS.length;

const TEAMS_BY_ID = new Map(TEAMS.map((team) => [team.id, team]));
const TEAMS_BY_ABBR = new Map(TEAMS.map((team) => [team.abbreviation, team]));

export function getTeamById(id: string): Team | undefined {
  return TEAMS_BY_ID.get(id);
}

export function getTeamByAbbreviation(abbr: string): Team | undefined {
  return TEAMS_BY_ABBR.get(abbr.toUpperCase());
}

/**
 * Loose name matcher so upstream feeds (ESPN vs SportsData) that spell teams
 * slightly differently ("LA Clippers" vs "Los Angeles Clippers") still resolve.
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^losangeles/, 'la');
}

const TEAMS_BY_NORMALIZED_NAME = new Map(
  TEAMS.map((team) => [normalizeTeamName(team.name), team]),
);

export function getTeamByName(name: string): Team | undefined {
  const direct = TEAMS_BY_NORMALIZED_NAME.get(normalizeTeamName(name));
  if (direct) return direct;
  // Fall back to nickname match ("Celtics" → Boston Celtics).
  const normalized = normalizeTeamName(name);
  return TEAMS.find((team) => normalizeTeamName(team.nickname) === normalized);
}

export function getTeamsByConference(conference: Conference): Team[] {
  return TEAMS.filter((team) => team.conference === conference);
}

export function getTeamsByDivision(division: Division): Team[] {
  return TEAMS.filter((team) => team.division === division);
}

export const DIVISIONS: Record<Conference, Division[]> = {
  East: ['Atlantic', 'Central', 'Southeast'],
  West: ['Northwest', 'Pacific', 'Southwest'],
};
