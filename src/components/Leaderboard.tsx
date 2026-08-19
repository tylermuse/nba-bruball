import { useMemo, useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { getTeamById } from '../data/teams';
import { TeamLogo } from './TeamLogo';
import {
  getRosterBreakdown,
  getRosterPoints,
  type PlayoffResults,
  type StandingsMap,
} from '../lib/scoring';
import type { DraftView } from '../lib/useDraft';
import type { League } from '../lib/types';
import { cn } from '../lib/utils';

interface Props {
  league: League;
  draft: DraftView;
  myMemberId: string | null;
  /** Live NBA data arrives in Phase 4; until then rosters score zero. */
  standings?: StandingsMap | null;
  playoffs?: PlayoffResults | null;
}

export function Leaderboard({
  league,
  draft,
  myMemberId,
  standings = null,
  playoffs = null,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const scoring = league.scoringConfig;
    return draft.rosters
      .map((r) => ({
        ...r,
        points: getRosterPoints(r.teamIds, standings, playoffs, scoring),
        breakdown: getRosterBreakdown(r.teamIds, standings, playoffs, scoring),
      }))
      .sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));
  }, [draft.rosters, league.scoringConfig, standings, playoffs]);

  const anyPicks = draft.picks.length > 0;

  return (
    <div className="space-y-4">
      {!anyPicks && (
        <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm text-gray-700">
          The leaderboard fills in as teams are drafted. Live NBA results start
          feeding it in Phase 4.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <ul>
          {rows.map((row, index) => {
            const isMe = row.memberId === myMemberId;
            const isOpen = expanded === row.memberId;
            return (
              <li key={row.memberId} className="border-b border-gray-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.memberId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                      index === 0 && anyPicks
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {index === 0 && anyPicks ? (
                      <Trophy className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {row.teamName || 'Unnamed'}
                      {isMe && <span className="ml-1.5 text-xs text-fuchsia-600">you</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.teamIds.length} team{row.teamIds.length === 1 ? '' : 's'}
                      {row.draftSlot ? ` · pick ${row.draftSlot}` : ''}
                    </p>
                  </div>

                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-gray-900">
                      {row.points}
                    </span>
                    <span className="block text-xs text-gray-400">pts</span>
                  </span>

                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-gray-400 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
                    {row.breakdown.length === 0 ? (
                      <p className="py-2 text-sm text-gray-500">No teams drafted yet.</p>
                    ) : (
                      <ul>
                        {row.breakdown.map((b) => {
                          const team = getTeamById(b.teamId);
                          return (
                            <li
                              key={b.teamId}
                              className="flex items-center gap-3 py-2 text-sm"
                            >
                              {team && <TeamLogo team={team} size={24} />}
                              <span className="min-w-0 flex-1 truncate text-gray-900">
                                {team?.name ?? b.teamId}
                              </span>
                              <span className="shrink-0 text-xs text-gray-500">
                                {b.wins}-{b.losses}
                              </span>
                              <span className="w-10 shrink-0 text-right font-medium text-gray-900">
                                {b.totalPoints}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">No players yet.</p>
        )}
      </div>
    </div>
  );
}
