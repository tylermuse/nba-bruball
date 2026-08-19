import { useEffect, useState } from 'react';
import { Calendar, Trophy, CircleCheckBig, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LeagueProvider, useLeagues } from './context/LeagueContext';
import { SignIn } from './components/SignIn';
import { LeagueOnboarding } from './components/LeagueOnboarding';
import { LeagueSwitcher } from './components/LeagueSwitcher';
import { TeamLogo } from './components/TeamLogo';
import { TEAMS, DIVISIONS, getTeamsByDivision, type Conference } from './data/teams';
import { DEFAULT_SCORING, CHAMPIONSHIP_RUN_POINTS, ROUND_LABELS, ROUND_ORDER } from './lib/scoring';
import { formatSeason } from './lib/season';
import { readInviteCodeFromUrl } from './lib/leagues';
import { cn } from './lib/utils';

type Tab = 'schedule' | 'leaderboard' | 'draft';

export default function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <Shell />
      </LeagueProvider>
    </AuthProvider>
  );
}

function Shell() {
  const { user, loading: authLoading } = useAuth();
  const { leagues, selectedLeague, loading: leaguesLoading, error } = useLeagues();
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // Pick up ?join=CODE from an invite link.
  useEffect(() => {
    const code = readInviteCodeFromUrl(window.location.search);
    if (code) {
      setInviteCode(code);
      setShowOnboarding(true);
    }
  }, []);

  function clearInviteFromUrl() {
    setInviteCode(null);
    setShowOnboarding(false);
    if (window.location.search.includes('join=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  if (authLoading) return <FullScreenSpinner />;
  if (!user) return <SignIn />;

  const needsLeague = !leaguesLoading && leagues.length === 0;

  if (needsLeague || showOnboarding) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-medium text-gray-900">NBA Bruball</h1>
          <p className="mt-2 text-sm text-gray-600">
            {needsLeague
              ? 'Start a league or join one with an invite code.'
              : 'Add another league.'}
          </p>
        </div>
        <LeagueOnboarding
          initialCode={inviteCode}
          onDone={clearInviteFromUrl}
          onCancel={needsLeague ? undefined : clearInviteFromUrl}
        />
      </div>
    );
  }

  if (leaguesLoading && !selectedLeague) return <FullScreenSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <h1 className="text-center text-2xl font-medium text-gray-900">NBA Bruball</h1>
        <div className="mt-1">
          <LeagueSwitcher onAddLeague={() => setShowOnboarding(true)} />
        </div>
        {selectedLeague && (
          <p className="mt-1 text-center text-xs text-gray-400">
            {formatSeason(selectedLeague.season)} Season
          </p>
        )}
      </header>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <main className="px-4 py-6">
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'leaderboard' && <LeaderboardTab />}
        {activeTab === 'draft' && <DraftTab />}
      </main>

      <nav className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white shadow-lg">
        <div className="flex justify-around">
          <TabButton
            label="Schedule"
            icon={<Calendar className="size-6" />}
            active={activeTab === 'schedule'}
            onClick={() => setActiveTab('schedule')}
          />
          <TabButton
            label="Leaderboard"
            icon={<Trophy className="size-6" />}
            active={activeTab === 'leaderboard'}
            onClick={() => setActiveTab('leaderboard')}
          />
          <TabButton
            label="Draft"
            icon={<CircleCheckBig className="size-6" />}
            active={activeTab === 'draft'}
            onClick={() => setActiveTab('draft')}
          />
        </div>
      </nav>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Loader2 className="size-6 animate-spin text-gray-400" />
    </div>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 py-3 transition-colors',
        active ? 'text-fuchsia-600' : 'text-gray-500',
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}

function PhaseNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm text-gray-700">
      {children}
    </div>
  );
}

function ScheduleTab() {
  const { selectedLeague } = useLeagues();
  const scoring = selectedLeague?.scoringConfig ?? DEFAULT_SCORING;
  const championshipRun =
    scoring.seriesPoints.firstRound +
    scoring.seriesPoints.confSemifinals +
    scoring.seriesPoints.confFinals +
    scoring.seriesPoints.finals;

  return (
    <div className="space-y-4">
      <PhaseNotice>
        Live NBA scores and points-at-stake arrive in Phase 4. NBA games are
        organized by date rather than week, so this tab will show a rolling
        window of upcoming games.
      </PhaseNotice>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-medium text-gray-900">Scoring Rules</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Regular season win</span>
            <span className="font-semibold text-gray-900">{scoring.winPoints} pt</span>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs text-gray-500">
              Playoffs — awarded to the winner of each series
            </p>
            {ROUND_ORDER.map((round) => (
              <div key={round} className="flex items-center justify-between py-1">
                <span className="text-gray-700">{ROUND_LABELS[round]}</span>
                <span className="font-semibold text-gray-900">
                  {scoring.seriesPoints[round]} pts
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="font-medium text-gray-900">Championship run</span>
            <span className="font-semibold text-fuchsia-600">
              {championshipRun || CHAMPIONSHIP_RUN_POINTS} pts
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function LeaderboardTab() {
  const { selectedLeague } = useLeagues();

  return (
    <div className="space-y-4">
      <PhaseNotice>
        The leaderboard fills in once this league drafts (Phase 3), then updates
        from live NBA results (Phase 4).
      </PhaseNotice>
      {selectedLeague && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-medium text-gray-900">
            {selectedLeague.name}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Season" value={formatSeason(selectedLeague.season)} />
            <Row
              label="Players"
              value={`${selectedLeague.memberCount} of ${selectedLeague.size}`}
            />
            <Row label="Teams each" value={String(30 / selectedLeague.size)} />
            <Row label="Draft" value={selectedLeague.draftStatus} />
            <Row label="Your role" value={selectedLeague.role} />
            <Row label="Invite code" value={selectedLeague.inviteCode} mono />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className={cn('font-medium text-gray-900 capitalize', mono && 'font-mono tracking-wider')}>
        {value}
      </dd>
    </div>
  );
}

function DraftTab() {
  return (
    <div className="space-y-4">
      <PhaseNotice>
        All {TEAMS.length} NBA teams, ready for the draft board. The snake draft
        itself lands in Phase 3.
      </PhaseNotice>

      {(['East', 'West'] as Conference[]).map((conference) => (
        <section key={conference}>
          <h2 className="mb-2 text-lg font-medium text-gray-900">
            {conference === 'East' ? 'Eastern' : 'Western'} Conference
          </h2>
          <div className="space-y-3">
            {DIVISIONS[conference].map((division) => (
              <div
                key={division}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                  {division}
                </div>
                <ul>
                  {getTeamsByDivision(division).map((team) => (
                    <li
                      key={team.id}
                      className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                    >
                      <TeamLogo team={team} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {team.name}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-gray-400">
                        {team.abbreviation}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
