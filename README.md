# NBA Bruball

A season-long fantasy game for the NBA: draft NBA *teams*, not players, and
accumulate points all season based on how they perform.

This is the NBA sibling of [Bruball](https://github.com/tylermuse/bruball) (NFL),
rebuilt as a **multi-league platform** — anyone can sign up, create a league,
invite friends, and run their own season.

## The game

- A snake draft splits all 30 NBA teams among league members.
- Leagues are **5 players** (6 teams each). Every player drafts **one team from
  each of the NBA's 6 divisions**, so the 30 teams divide evenly.
- Your score is the combined points of the teams you own.

### Scoring

| Event | Points |
| --- | --- |
| Regular-season win | 1 |
| Play-In | 0 |
| First Round series win | 4 |
| Conf. Semifinals series win | 7 |
| Conf. Finals series win | 11 |
| NBA Finals series win | 16 |

Playoff points go to the **winner of each series** — no game-by-game tracking.
A championship run is worth **38 points**, roughly a strong team's entire
regular season, so winning it all nearly doubles that team's value.

There are no ties in the NBA, so unlike the NFL version there is no half-point
tie handling.

Values are per-league configurable (`scoring_config`); the table above is the default.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase credentials
npm run dev                  # http://localhost:3000
npm test                     # vitest
npm run build                # typecheck + production build
```

## Stack

- **Frontend:** Vite + React 18 + TypeScript, Tailwind v4, Radix UI, lucide-react
- **Backend:** Supabase (Auth + Postgres with RLS + Realtime for the live draft)
- **Live NBA data:** serverless functions with SportsData.io → ESPN → local-JSON fallback
- **Hosting:** Vercel

## Secrets

Never commit API keys. `.env.local` is gitignored; `.env.example` documents the
required variables. The Supabase publishable key is safe for the browser; the
service-role key and `SPORTSDATAIO_API_KEY` are server-side only.

## Build status

- **Phase 0** — scaffold + Supabase wiring ✅
- **Phase 1** — NBA teams, scoring, snake draft, season logic ✅
- **Phase 2** — accounts + create/join league ✅
- **Phase 3** — async draft + per-league views ✅
- **Phase 4** — live NBA data wiring ✅
- **Phase 5** — real-time draft room ✅
- **Phase 6** — polish ✅

## Live draft room

Set a league to **live** mode and picks are timed and broadcast:

- Supabase Realtime pushes every pick and clock change to all connected clients
- A 15s poll runs alongside it, so a dropped socket degrades to a slower
  refresh rather than a frozen board
- When the clock expires any client may call `autopick_if_expired()`; it no-ops
  server-side unless the deadline really passed, so the first one through wins
- Commissioner can pause/resume and set the pick clock (10–600s)

Concurrency is enforced by the database, not the UI: `make_pick` takes a
`FOR UPDATE` lock on `draft_state`, and `unique(league_id, pick_number)` plus
`unique(league_id, team_id)` mean the loser of any race is rejected outright.

## Live NBA data

A nightly job writes one snapshot to Postgres; the app reads that. This keeps an
unofficial third-party API out of the critical path of every page load.

**Daily sync** — a scheduled Claude task (`nba-bruball-daily-sync`) runs at
5am local, fetches ESPN **in the browser**, and upserts `nba_season_cache`.
A partial or implausible response is skipped rather than overwriting a good
snapshot.

Why the browser: **ESPN returns 403 to Supabase's servers** — verified with
pg_net directly, with and without a browser User-Agent, so it is IP-based, not
UA sniffing. `supabase/migrations/0007_pg_cron_sync.sql` implements the same
sync fully in Postgres and works apart from that fetch; its cron schedule is
left disabled with instructions to re-enable if the data ever comes from
somewhere ESPN allows. `api/cron/sync-nba.ts` is the equivalent server
endpoint, kept for when the app is deployed (its Vercel cron entry is disabled
so the two can't double-write).

**Read order at runtime:**

1. `nba_season_cache` in Supabase — the normal path, no outbound call
2. Live fetch — only if the cache is missing or more than 2 days stale
3. Bundled snapshot — `src/data/season-2025.json`, last resort

The live tier itself is: **SportsData.io** (only if `SPORTSDATAIO_API_KEY` is
set) → **ESPN public API** (free, no key) → bundled snapshot.

Required for the cron: `SUPABASE_SERVICE_ROLE_KEY` (server-side only — writing
to the cache bypasses RLS) and `CRON_SECRET`.

Endpoints: `/api/nba/standings`, `/api/nba/playoffs`, `/api/nba/scores?dates=…`

**Season numbering gotcha:** we label a season by its *starting* year (2025 =
the 2025-26 season). ESPN labels it by its *ending* year, so our 2025 is ESPN's
2026. That conversion lives in `toEspnSeason()`.

NBA games are organized by **date**, not week, so the scores endpoint takes a
`YYYYMMDD` date or `YYYYMMDD-YYYYMMDD` range rather than a week number.

Note: `npm run dev` serves the SPA only — `/api` returns 404 and the app falls
back to the bundled snapshot. Run `vercel dev` to exercise the real endpoints.
