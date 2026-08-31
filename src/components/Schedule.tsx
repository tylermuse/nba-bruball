import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getTeamById } from '../data/teams';
import { TeamLogo } from './TeamLogo';
import { useNbaSchedule, weekRange, midSeasonDate } from '../lib/useNbaData';
import { ROUND_LABELS, type PlayoffRound } from '../lib/scoring';
import type { RosterEntry } from '../lib/draftApi';
import type { League } from '../lib/types';
import { cn } from '../lib/utils';

interface Props {
  league: League;
  rosters: RosterEntry[];
  myMemberId: string | null;
}

/**
 * Upcoming games with what each one is worth. The NFL version keyed this off a
 * week number; the NBA plays most nights, so this is a rolling date window
 * instead.
 */
export function Schedule({ league, rosters, myMemberId }: Props) {
  // Anchor date for the visible week; navigable so you can look back at any
  // week of the season, not just the next seven days.
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const dates = useMemo(() => weekRange(anchor, 6), [anchor]);
  const { games, loading, error } = useNbaSchedule(dates);

  function shiftWeek(weeks: number) {
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + weeks * 7);
      return next;
    });
  }

  const weekLabel = useMemo(() => {
    const end = new Date(anchor);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(anchor)} – ${fmt(end)}, ${end.getFullYear()}`;
  }, [anchor]);

  /** teamId → the member who drafted it. */
  const ownerByTeam = useMemo(() => {
    const map = new Map<string, RosterEntry>();
    for (const roster of rosters) {
      for (const teamId of roster.teamIds) map.set(teamId, roster);
    }
    return map;
  }, [rosters]);

  const scoring = league.scoringConfig;

  const byDate = useMemo(() => {
    const groups = new Map<string, typeof games>();
    for (const game of games) {
      const key = game.date.slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(game);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [games]);

  const header = (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-2 py-2">
      <button
        type="button"
        onClick={() => shiftWeek(-1)}
        aria-label="Previous week"
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
      >
        <ChevronLeft className="size-5" />
      </button>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-900">{weekLabel}</p>
        <p className="text-xs text-gray-500">
          {games.length} game{games.length === 1 ? '' : 's'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => shiftWeek(1)}
        aria-label="Next week"
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );

  if (loading && !games.length) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error || !games.length) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <CalendarDays className="mx-auto mb-2 size-6 text-gray-300" />
          <p className="text-sm font-medium text-gray-900">No games this week</p>
          <p className="mt-1 text-sm text-gray-600">
            {error
              ? 'Live scores are unavailable right now.'
              : 'Nothing scheduled — the NBA is between seasons.'}
          </p>
          <button
            type="button"
            onClick={() => setAnchor(midSeasonDate(league.season))}
            className="mt-3 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            Jump to the {league.season}-{String((league.season + 1) % 100).padStart(2, '0')} season
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {byDate.map(([date, dayGames]) => (
        <section key={date}>
          <h3 className="mb-2 text-sm font-medium text-gray-700">
            {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </h3>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {dayGames.map((game) => {
              const stake = game.round
                ? scoring.seriesPoints[game.round as PlayoffRound]
                : scoring.winPoints;
              const anyMine =
                (game.homeTeamId && ownerByTeam.get(game.homeTeamId)?.memberId === myMemberId) ||
                (game.awayTeamId && ownerByTeam.get(game.awayTeamId)?.memberId === myMemberId);

              return (
                <div
                  key={game.id}
                  className={cn(
                    'border-b border-gray-100 px-4 py-3 last:border-b-0',
                    anyMine && 'bg-orange-50/60',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <GameSide
                        teamId={game.awayTeamId}
                        score={game.awayScore}
                        won={game.completed && game.winnerTeamId === game.awayTeamId}
                        owner={game.awayTeamId ? ownerByTeam.get(game.awayTeamId) : undefined}
                        myMemberId={myMemberId}
                      />
                      <GameSide
                        teamId={game.homeTeamId}
                        score={game.homeScore}
                        won={game.completed && game.winnerTeamId === game.homeTeamId}
                        owner={game.homeTeamId ? ownerByTeam.get(game.homeTeamId) : undefined}
                        myMemberId={myMemberId}
                      />
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs text-gray-400">
                        {game.completed ? 'Final' : 'At stake'}
                      </p>
                      <p className="font-semibold text-gray-900">
                        {stake} {stake === 1 ? 'pt' : 'pts'}
                      </p>
                    </div>
                  </div>

                  {game.round && (
                    <p className="mt-1.5 text-xs text-orange-700">
                      {ROUND_LABELS[game.round as PlayoffRound]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function GameSide({
  teamId,
  score,
  won,
  owner,
  myMemberId,
}: {
  teamId: string | null;
  score: number | null;
  won: boolean;
  owner?: RosterEntry;
  myMemberId: string | null;
}) {
  const team = teamId ? getTeamById(teamId) : null;
  if (!team) return <p className="text-sm text-gray-400">TBD</p>;

  return (
    <div className="flex items-center gap-2">
      <TeamLogo team={team} size={22} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          won ? 'font-semibold text-gray-900' : 'text-gray-700',
        )}
      >
        {team.name}
      </span>
      {owner && (
        <span
          className={cn(
            'shrink-0 truncate text-xs',
            owner.memberId === myMemberId ? 'text-orange-600' : 'text-gray-400',
          )}
        >
          {owner.memberId === myMemberId ? 'you' : owner.teamName || 'drafted'}
        </span>
      )}
      {score !== null && (
        <span
          className={cn(
            'w-8 shrink-0 text-right text-sm tabular-nums',
            won ? 'font-semibold text-gray-900' : 'text-gray-500',
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}
