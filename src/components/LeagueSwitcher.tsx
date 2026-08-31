import { useState } from 'react';
import { ChevronDown, Plus, Check, LogOut, Copy } from 'lucide-react';
import { useLeagues } from '../context/LeagueContext';
import { useAuth } from '../context/AuthContext';
import { formatSeason } from '../lib/season';
import { buildInviteUrl } from '../lib/leagues';
import { cn } from '../lib/utils';

export function LeagueSwitcher({ onAddLeague }: { onAddLeague: () => void }) {
  const { leagues, selectedLeague, selectLeague } = useLeagues();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!selectedLeague) return null;

  async function copyInvite() {
    if (!selectedLeague) return;
    try {
      await navigator.clipboard.writeText(buildInviteUrl(selectedLeague.inviteCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code is visible on screen regardless.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 text-sm text-gray-600"
      >
        <span className="max-w-[60vw] truncate">{selectedLeague.name}</span>
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute top-full left-1/2 z-30 mt-2 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <ul className="max-h-64 overflow-y-auto">
              {leagues.map((league) => (
                <li key={league.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectLeague(league.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {league.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatSeason(league.season)} · {league.memberCount}/
                        {league.size} players
                        {league.role === 'commissioner' && ' · commissioner'}
                      </p>
                    </div>
                    {league.id === selectedLeague.id && (
                      <Check className="size-4 shrink-0 text-orange-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t border-gray-200">
              <button
                type="button"
                onClick={copyInvite}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Copy className="size-4" />
                {copied ? 'Invite link copied' : `Invite code: ${selectedLeague.inviteCode}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddLeague();
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="size-4" /> Create or join a league
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 border-t border-gray-200 px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
