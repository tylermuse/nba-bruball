# NBA Bruball

A season-long fantasy game for the NBA: draft NBA *teams*, not players, and
accumulate points all season based on how they perform.

This is the NBA sibling of [Bruball](https://github.com/tylermuse/bruball) (NFL),
rebuilt as a **multi-league platform** — anyone can sign up, create a league,
invite friends, and run their own season.

## The game

- A snake draft splits all 30 NBA teams among league members.
- League sizes are **5** (6 teams each) or **6** (5 teams each) — both divide 30 evenly.
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
- **Phase 2** — accounts + create/join league
- **Phase 3** — async draft + per-league views
- **Phase 4** — live NBA data wiring
- **Phase 5** — real-time draft room
- **Phase 6** — polish
