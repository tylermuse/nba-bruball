import { useState } from 'react';
import { Calendar, Trophy, CircleCheckBig } from 'lucide-react';
import { TEAMS, DIVISIONS, getTeamsByDivision, type Conference } from './data/teams';
import { TeamLogo } from './components/TeamLogo';
import {
  DEFAULT_SCORING,
  CHAMPIONSHIP_RUN_POINTS,
  ROUND_LABELS,
  ROUND_ORDER,
} from './lib/scoring';
import { getDefaultSeason, formatSeason } from './lib/season';
import { isSupabaseConfigured } from './lib/supabase';
import { cn } from './lib/utils';

type Tab = 'schedule' | 'leaderboard' | 'draft';

const season = getDefaultSeason();

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('schedule');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <h1 className="text-center text-2xl font-medium text-gray-900">NBA Bruball</h1>
        <p className="mt-1 text-center text-sm text-gray-600">
          {formatSeason(season)} Season
        </p>
      </header>

      <main className="px-4 py-6">
        {activeTab === 'schedule' && <SchedulePlaceholder />}
        {activeTab === 'leaderboard' && <LeaderboardPlaceholder />}
        {activeTab === 'draft' && <TeamBoard />}
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

function SchedulePlaceholder() {
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
            <span className="font-semibold text-gray-900">
              {DEFAULT_SCORING.winPoints} pt
            </span>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs text-gray-500">
              Playoffs — awarded to the winner of each series
            </p>
            {ROUND_ORDER.map((round) => (
              <div key={round} className="flex items-center justify-between py-1">
                <span className="text-gray-700">{ROUND_LABELS[round]}</span>
                <span className="font-semibold text-gray-900">
                  {DEFAULT_SCORING.seriesPoints[round]} pts
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="font-medium text-gray-900">Championship run</span>
            <span className="font-semibold text-fuchsia-600">
              {CHAMPIONSHIP_RUN_POINTS} pts
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function LeaderboardPlaceholder() {
  return (
    <div className="space-y-4">
      <PhaseNotice>
        The leaderboard turns on once leagues and drafts exist (Phases 2–3).
        It will rank league members by their rosters' combined points.
      </PhaseNotice>
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
        {isSupabaseConfigured
          ? 'Supabase is connected — accounts and leagues are next.'
          : 'Supabase is not configured. Add credentials to .env.local.'}
      </div>
    </div>
  );
}

function TeamBoard() {
  return (
    <div className="space-y-4">
      <PhaseNotice>
        All {TEAMS.length} NBA teams, ready for the draft board. Leagues of 5
        (6 teams each) or 6 (5 teams each) both divide evenly.
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
