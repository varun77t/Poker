# Private Hold'em

Private multiplayer Texas Hold'em for 2–5 friends. Virtual chips only.

- Product: [docs/product-spec.md](docs/product-spec.md)
- Poker rules: [docs/game-rules.md](docs/game-rules.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Build phases: [docs/build-plan.md](docs/build-plan.md)

## Requirements
Node.js 22.12+ and npm 10+.

## Getting started
```bash
npm install
cp .env.example .env   # optional; defaults work
npm run dev
```
Open http://localhost:5173. The Vite dev server proxies `/api`, `/health` and `/socket.io` to the Node server on `API_PORT` (3000).

`PORT` always means "the port you open in the browser": Vite's port in development, the Node server's port in production. See `.env.example`.

### Looking at the table without a game (development only)
Browser tests: `npm run e2e` builds the app and plays real games in Chromium (three players, and a solo game against bots). The first run needs `npx playwright install chromium`.

`http://localhost:5173/dev/table?state=turn` renders the real table from sample data. Other states: `flop` (side pot, all-in, away and left seats), `showdown`, `waiting`, `busted` (rebuy prompt), `busted-off`, `ending` (host ended the game), `finished` and `finished-guest` (the game-over screen; add `&edit=1` for the settings editor), `bots` (two bots at the table, open seats for more), `bots-waiting` (only bots have chips, so the table waits), `bots-finished`, `draw` / `board` (the hand hint with two draws, and with a hand the board makes), and `lobby`, `lobby-guest` and `lobby-alone` (before the first hand; `&edit=1` opens the settings editor). The other screens are at `?screen=create`, `invite`, `joining`, `problem` and `toast` (a toast with the reconnecting banner). The approved design prototype is `client/prototypes/table-prototype.html`.

### Testing several players in one browser (development only)
All tabs normally share one identity (a second tab takes over the first). To play as different people in one browser, add `?player=<id>` to a tab's URL once, e.g. `http://localhost:5173/?player=2`. That tab keeps its own separate guest session until it is closed. A small "dev player 2" tag shows which one you are.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Server (tsx watch) + client (Vite) together |
| `npm test` | Vitest in every workspace |
| `npm run typecheck` | `tsc` in every workspace |
| `npm run lint` | ESLint over the repo, including engine-purity rules |
| `npm run build` | Bundle the server (tsup) and build the client (Vite) |
| `npm start` | Run the production build: one server on `PORT` serving the client, API and Socket.IO |
| `npm run check` | typecheck + lint + test + build |

The poker engine's property test plays 1,500 random hands on every run, and the table simulation plays 150 random games (joins, leaves, disconnects, timeouts). For a longer soak:
```bash
npx cross-env ENGINE_PROPERTY_RUNS=50000 TABLE_SIMULATION_RUNS=3000 npm test -w @poker/server
```

## Layout
```
shared/   types, constants, zod schemas, Socket.IO event contract (TypeScript source, no build step)
server/   Express + Socket.IO; the pure poker engine lives in server/src/engine
client/   React + Vite + CSS Modules
docs/     specs
```
