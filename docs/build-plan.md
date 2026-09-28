# Multiplayer Texas Hold'em — Revised Build Plan (Phase Prompts)

Revision of the original `poker_webapp_phase_prompts.md`. Key changes:

- Guest identity (session tokens) introduced in Phase 2, so reconnection and anti-spoofing work from day one.
- Explicit poker rules (side pots, heads-up blinds, min-raise, BB option, run-outs, odd chips) captured in `docs/game-rules.md` and tested in Phase 3.
- Turn timer + reconnection folded into the sync phase (Phase 4).
- TypeScript monorepo with `shared/` types and zod validation from the start.
- Single-service deployment (Express serves the React build) — no cross-origin cookies/CORS in production.
- Database and Google auth moved to optional final phases.
- Styling: CSS Modules (shadcn/ui removed — it requires Tailwind).
- "Ready" state removed — host starts the game.
- Bots (Phase 7): the host can fill open seats with computer players, so one person can play alone.
- Desktop only: the app is played on laptops/desktops, so there is no mobile or phone layout work.

Non-negotiable rules live in `/CLAUDE.md` and apply to every phase automatically.

## Workflow

```
Send ONE phase prompt → Claude implements → Claude runs tests → you play-test it
→ fix bugs → git commit + tag phase-N → next phase
```

Only proceed when the current phase works.

---

# PHASE 0 — Specification & Architecture (docs only)

```text
Read /CLAUDE.md.

You are the lead architect for a private multiplayer Texas Hold'em web app.
Do NOT write application code in this phase. Produce three documents:

1. /docs/product-spec.md
   - Users (guests with a display name) create private rooms with a unique 6-char code.
   - Codes use the alphabet ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0/O/1/I/L), case-insensitive input.
   - Shareable invite link: /room/<CODE>.
   - 2–5 seated players. Host = creator; host starts the game when >= 2 players are seated.
   - Host migrates to the next seated player if the host leaves. Empty rooms are deleted after a TTL (10 min).
   - Room settings chosen at creation: starting stack, small blind, big blind, turn timer seconds, rebuy allowed (y/n).
   - Players may join a room that is already playing; they are dealt in from the next hand.
   - Busted players may rebuy (if enabled) between hands, otherwise they spectate.
   - Room states: waiting, playing, finished.
   - Virtual chips only; chips have no cash value and can never be bought.

2. /docs/game-rules.md — precise No-Limit Texas Hold'em rules the engine must implement:
   - Dealing, streets (preflop, flop, turn, river, showdown).
   - Button, small blind, big blind positions for 3–5 players.
   - Heads-up: the button posts the small blind, acts FIRST preflop and LAST postflop.
   - Button movement when players bust or leave (button advances to the next seated active player;
     document the chosen simplified rule).
   - Blinds: a player who cannot cover a blind posts all-in for what they have.
   - Actions: fold, check, call, bet, raise, all-in. Bet/raise amounts are "raise TO" totals for the street.
   - Minimum bet = big blind. Minimum raise increment = size of the last full bet/raise on this street.
   - An all-in that is less than a full raise does NOT reopen betting for players who have already acted.
   - Big blind option: if preflop action is limped to the BB, the BB may check or raise.
   - Betting round ends when all non-folded, non-all-in players have acted and matched the highest bet.
   - Uncalled portion of a bet is returned to the bettor.
   - If everyone but one folds, that player wins without showing cards.
   - If <= 1 player can still act (others all-in), remaining board cards are dealt with no further betting.
   - Side pots: built from all-in amounts; each pot is contested only by eligible players.
   - Split pots: equal division; odd chip(s) go to the first winner left of the button.
   - Showdown: only hands of players still in at showdown are revealed. Folded hands are never revealed.
   - Hand ranking with kickers, including the wheel straight (A-2-3-4-5) and board-plays.
   - Integer chips only. Total chips are conserved.

3. /docs/architecture.md
   - Folder structure (npm workspaces):
       shared/src/   types.ts, events.ts (typed Socket.IO event maps), schemas.ts (zod)
       server/src/engine/   deck.ts, evaluator.ts, betting.ts, pots.ts, engine.ts, view.ts
       server/src/table/    tableController.ts (timers, pacing, reconnection windows)
       server/src/rooms/    roomManager.ts, roomCode.ts
       server/src/sessions/ sessionStore.ts
       server/src/socket/   handlers.ts, middleware.ts
       client/src/          pages/, components/, hooks/, socket/
   - Text architecture diagram and data flow for: create room, join room, player action, reconnect.
   - Engine API: createHand(config, players, deck) ; applyAction(state, playerId, action) -> { state, events } ;
     getLegalActions(state, playerId) ; toGameView(state, playerId).
   - Sync model: after every change, server emits a full per-player snapshot with a monotonically
     increasing room `version` (clients drop older snapshots). Game actions include `handId` + `seq`; mismatches are rejected as STALE_ACTION.
     Errors are returned via Socket.IO acknowledgements.
   - Identity: server-issued guest sessionToken sent in the Socket.IO handshake auth.
   - Full list of Socket.IO events (client->server and server->client) with payloads.
   - Game state structure (server-internal) vs PlayerView (sent to clients).
   - Edge cases list and testing strategy (unit, property, integration, E2E).
   - Deployment: one Node service serving API + Socket.IO + built client; exactly one instance
     (in-memory state); a restart ends live games.

Ask me about anything ambiguous before finalizing.
```

---

# PHASE 1 — Project Setup

```text
Read /CLAUDE.md and all files in /docs. Implement PHASE 1 only.

1. git init; add .gitignore (node_modules, dist, .env).
2. npm workspaces monorepo: shared/, server/, client/. TypeScript strict mode in all three.
3. shared/: exported types and a typed Socket.IO event map (placeholder events only), zod installed.
4. server/: Express + Socket.IO using the typed event map. GET /health returns { ok: true }.
   In production, Express serves client/dist and falls back to index.html for client routes.
5. client/: React + Vite + CSS Modules. Homepage shows socket connection status.
   Vite dev server proxies /socket.io and /health to the backend (so no CORS setup needed in dev).
6. Vitest configured for shared and server. One trivial passing test in each.
7. Root scripts: dev (runs server + client concurrently), build, test, typecheck, lint.
8. .env.example with PORT, API_PORT and NODE_ENV.

Do NOT implement poker logic, rooms, auth, or a database.

Verify: npm run dev starts both; homepage shows "connected"; /health works; npm test,
npm run typecheck and npm run build pass. Summarize files created, commands, and tests run.
```

---

# PHASE 2 — Guest Sessions & Room System

```text
Read /CLAUDE.md and /docs. Implement PHASE 2 only. No poker gameplay yet.

Guest sessions:
- Client calls POST /api/session with { displayName } (1–20 chars, trimmed, validated with zod).
  Server returns { playerId, sessionToken } (crypto-random). Client stores them in localStorage.
- Socket.IO connects with auth: { token }. Middleware resolves the token to playerId and sets
  socket.data.playerId, or rejects the connection. Unknown/invalid token -> client clears storage and re-creates a session.
- One active socket per playerId: a new connection replaces the old one (old socket is disconnected).

Rooms (server/src/rooms):
- createRoom(settings) generates a unique code from the unambiguous alphabet in /docs/product-spec.md.
- joinRoom(code) normalizes case; rejects nonexistent rooms, full rooms (5 seated), and duplicate joins.
- leaveRoom; host migration to the next seated player; empty room deleted after TTL.
- Room status: waiting | playing | finished.
- startGame allowed only for the host with >= 2 seated players (actual dealing comes in Phase 4).

Socket handling:
- Every incoming event: rate limit per socket -> zod schema -> resolve player from socket.data -> handler.
- Handlers return { ok: true, ... } or { ok: false, error } via ack.
- Server broadcasts a room snapshot (players, seats, host, status, settings, count "3/5") on every change.

Client:
- Landing page: display name, Create Room (with settings form), Join Room (code input).
- /room/:code route: auto-join from invite link; lobby shows players, count, host badge, invite link copy button,
  Start button (host only, disabled < 2 players), Leave button.

Document all events in /docs/socket-events.md.

Tests (Vitest): create room, unique codes, join, join nonexistent, join full, leave,
host identification, host migration, empty-room cleanup (fake timers), invalid payloads rejected,
identity spoofing ignored (payload playerId has no effect).
Manually verify with 3 browser windows (use separate profiles/incognito so localStorage differs).
```

---

# PHASE 3 — Pure Texas Hold'em Engine

```text
Read /CLAUDE.md and /docs/game-rules.md. Implement PHASE 3: the engine in server/src/engine.
The engine must not import React, Socket.IO, timers, or use Math.random. It must implement
EVERY rule in /docs/game-rules.md exactly.

Modules: deck.ts (52 cards, Fisher–Yates with injectable RNG, default crypto.randomInt),
evaluator.ts, betting.ts, pots.ts, engine.ts, view.ts.

API:
- createHand(config, seatedPlayers, buttonSeat, deck?) -> HandState (posts blinds, deals hole cards)
- getLegalActions(state, playerId) -> { canFold, canCheck, callAmount, minBetOrRaiseTo, maxBetOrRaiseTo }
- applyAction(state, playerId, action) -> { state, events } or a typed error
  (not your turn, illegal action, amount out of range, player folded/all-in, hand over)
- Streets advance automatically when a betting round completes; auto run-out when <= 1 player can act.
- Showdown result: per-pot winners, amounts, and a readable hand label ("Full House, Kings over Sevens").
- nextButtonSeat(...) for rotation across hands, skipping busted/empty seats.
- toGameView(state, viewerId): own hole cards only; others' cards only if revealed at showdown;
  never the deck.

Evaluator: implement a 7-card evaluator (best of 21 five-card combos) OR use pokersolver.
Either way, it must pass all ranking tests below.

Tests — use fixed decks for deterministic scenarios:
- Rankings: high card, pair, two pair, trips, straight, wheel (A-2-3-4-5), flush, full house,
  quads, straight flush, royal flush; kicker comparisons; board plays -> split.
- Heads-up blind posting and action order preflop/postflop.
- 3-player and 5-player full hands; betting order; dealer/blind rotation over several hands;
  rotation after a player busts.
- BB option (limp to BB, BB checks / BB raises).
- Min-raise enforcement; short all-in does not reopen action; full all-in raise does.
- Uncalled bet returned.
- Everyone folds to one player (no showdown reveal).
- All-in preflop run-out.
- Side pots: 3-way all-in with 3 different stack sizes; 4-way with multiple side pots.
- Split pot with an odd chip.
- Blind all-in for a short stack.
- view.ts never leaks other players' hole cards before showdown or folded hands at showdown.
- PROPERTY TEST (fast-check): random seated stacks + random legal action sequences ->
  chips are conserved, no stack is negative, and the hand always terminates.

Do not move on until all tests pass.
```

---

# PHASE 4 — Table Controller, Real-Time Sync, Turn Timer, Reconnection

```text
Read /CLAUDE.md and /docs. Implement PHASE 4. Do not rewrite the engine unless a bug is found
(if so, add a failing test first).

server/src/table/tableController.ts, one per playing room:
- Starts hands, holds the authoritative HandState (the engine bumps the hand `seq` on every change), and increments the room `version` on every change.
- Receives actions: { handId, seq, type: fold|check|call|bet|raise|allIn, amount? }.
  Rejects if handId/seq != current (STALE_ACTION), then calls engine.applyAction.
- After every change, emits toGameView(state, playerId) in a versioned snapshot to EACH player individually
  (per-socket emit, never a room-wide broadcast of private data).
- Turn timer (room setting, default 30s): on expiry, auto-check if legal, otherwise auto-fold.
  The client receives the turn deadline timestamp to render a countdown.
- Pacing: short delay between streets (~1s) and ~5s after showdown before the next hand starts.

Disconnect / reconnect:
- On disconnect, mark the player disconnected; do NOT remove them. Their turn timer still runs
  (auto-check/fold on expiry).
- In lobby: remove them after a 60s grace window. In game: they stay seated and are auto-folded each hand;
  after N consecutive missed hands (e.g. 3) they are removed between hands.
- On reconnect (same session token): reattach socket and immediately send the current snapshot.

Update /docs/socket-events.md.

Tests: socket.io-client integration tests against an in-process server:
- 3 clients play a full hand end-to-end.
- Out-of-turn, illegal-amount, stale-seq, and duplicate actions are rejected with ack errors.
- No client ever receives another player's hole cards (inspect every received payload).
- Turn timer auto-check/auto-fold (fake timers).
- Disconnect mid-hand then reconnect restores the correct view; disconnected player's turn times out.
```

---

# PHASE 5 — Poker Table UI (functional)

```text
Read /CLAUDE.md. Implement PHASE 5: the table UI using existing events and PlayerView.
No game logic in React: the client renders PlayerView and sends intents only.
Action buttons and bet-slider min/max come exclusively from the server's legal actions.

Components: PokerTable, PlayerSeat (name, stack, current bet, status: folded/all-in/disconnected,
turn countdown ring), PlayingCard (CSS/SVG, not copied images), CommunityCards, Pot (main + side pots),
ActionPanel (Fold, Check/Call with amount, Bet/Raise slider + input + quick buttons: min, ½ pot, pot, all-in),
DealerButton, BlindMarkers, GameStatus (street, winner + hand label).

- The viewing player is always rendered at the bottom seat.
- Disable action buttons after sending until the next snapshot arrives (prevents double-sends).
- Desktop only: lay out for laptop/desktop screens (about 1280px wide and up). No phone or tablet layout.
- Minimal animation for now.
```

---

# PHASE 6 — Full Game Lifecycle

```text
Read /CLAUDE.md. Implement PHASE 6. Complete flow:
Landing -> Create/Join -> Lobby -> Host starts -> hands loop continuously -> game ends -> restart.

Already in place from Phase 4 (keep, add UI and lifecycle tests on top): late joiners are dealt in next
hand, leaving mid-hand folds at once and frees the seat after the hand, busted players are skipped, and
the table waits when fewer than 2 players have chips. Known gap to close here: a busted player can
leave and rejoin to get a fresh starting stack even with rebuys off (remember stacks of recent leavers).

- Players joining during play are seated "waiting" and dealt in next hand.
- Busted players: rebuy prompt between hands if enabled; otherwise spectate.
- Leaving mid-hand = fold now, removed from seat after the hand.
- Game ends when one player has chips and no rebuys are possible -> "finished" screen with results;
  host can restart with fresh stacks.
- Host migration works mid-game.

Tests: player folds, player leaves mid-hand, disconnect mid-hand, everyone folds to one,
everyone all-in, split pot, last player standing, join mid-game, rebuy, restart.
```

---

# PHASE 7 — Bots

```text
Read /CLAUDE.md and /docs (product-spec.md §3.7 defines bot behavior). Implement PHASE 7:
computer-controlled players, so one person can play alone and friends can fill empty seats.
Do not change engine rules. A bot is just another source of actions for a seat.

Room rules (product-spec.md §3.7):
- The host adds a bot to an open seat (level Easy or Normal) and can remove it. Bots can be added whenever
  a seat is open; a bot added mid-game is dealt in next hand, like a late joiner.
- Bots count toward the 2-player minimum (1 human + 1 bot can start). Bots are never host: host
  migration skips them. When the last human leaves, all bots are removed and the empty-room TTL applies.
- Bots are always connected and never time out. Between hands they rebuy automatically when rebuys are on;
  with rebuys off a busted bot leaves the table.
- Bots never play alone: a new hand starts only if at least one human is connected and has chips,
  otherwise the table pauses. With rebuys off, the game ends when no human has chips.
- Names come from a fixed list ("Ace Bot", ...), unique within the room.

Server:
- server/src/bots/strategy.ts: decide(view, legal, rng) -> Action, where view = toGameView(state, botId)
  and legal = getLegalActions(state, botId). This is the ONLY input, so a bot can never see hidden cards.
  bots/ follows the engine purity rules (no timers, no I/O, no Math.random, RNG injected); extend the
  ESLint purity config to server/src/bots/**.
- Easy: loose-passive. Plays most hands, calls often, rarely raises, with some randomness.
- Normal: preflop starting-hand tiers adjusted for position and player count; postflop equity from a
  bounded Monte Carlo run-out (using the engine evaluator) compared with pot odds; value bets/raises of
  about 1/2 to 3/4 pot; occasional bluffs; randomized so it has no fixed pattern.
- The table controller asks the bot on its turn, waits a "think" delay (about 0.8–2.5 s, via Clock), then
  submits through the SAME path as a human (handId + seq, engine validation). If a bot ever returns an
  illegal action, log an error and fall back to check, else fold.
- Bots have no session and no socket; the broadcaster skips them.
- Events: room:addBot { level: 'easy' | 'normal' } and room:removeBot { seat } (host only, strict zod).
  SeatView gains isBot and botLevel. Update /docs/socket-events.md and /docs/architecture.md.

Client:
- Lobby: the host sees "Add bot" (choosing the level) on open seats and "Remove" on bot seats.
- Landing: "Play against bots" creates a room with default settings and 3 Normal bots, then opens the
  lobby so the host can adjust before starting.
- Seats show a "Bot" badge with the level, in the lobby and at the table.

Tests:
- fast-check: for random reachable hand states, decide() always returns a legal action (both levels).
- No hidden information: two states that differ only in opponents' hole cards and the deck produce the
  same decision with the same seeded RNG.
- Room rules: add/remove are host-only; full room rejected; bots never become host; last human leaves ->
  bots removed; 1 human + 1 bot can start; busted bot rebuys (rebuys on) or leaves (rebuys off);
  table pauses when no connected human has chips.
- Integration (FakeClock): 1 human + 3 bots play 50 hands through the socket server; chips conserved;
  the human never receives a bot's hole cards before showdown.
- Strength sanity (seeded, deterministic): Normal finishes ahead of Easy over a long simulated match.
- Performance: a Normal decision averages under 50 ms.
```

---

# PHASE 8 — UI Polish

```text
Read /CLAUDE.md. Implement PHASE 8: polish only — do not change game logic or events.
Improve landing, create/join, lobby, table, cards, chip visualization, turn indicator,
winner highlight/animation, dealing/chip-to-pot animations (subtle), loading/error/empty states,
toasts for errors from acks, reconnecting banner, keyboard shortcuts (F/C/R). Desktop screens only (no mobile layout).
Respect prefers-reduced-motion. Keep CSS Modules. Run the full test suite after changes.
```

---

# PHASE 9 — Security & Multiplayer Audit + E2E

```text
Read /CLAUDE.md. Assume a malicious client using DevTools and raw socket.emit.
Attempt and write a test for each:
acting for another player; acting out of turn; negative/NaN/float/huge amounts; invalid room codes;
brute-forcing room codes; joining a full room; spoofing playerId in payloads; reading others' hole cards
(inspect every emitted payload); replaying/duplicating actions; acting after folding, after disconnecting,
after leaving; modifying chips client-side; event flooding (rate limits); oversized payloads
(Socket.IO maxHttpBufferSize); non-host starting the game, changing settings, or adding/removing bots;
acting for a bot's seat.

Fix every issue found. Add Playwright E2E with 3 browser contexts: create, join via invite link,
play several hands, disconnect/reconnect one player. Add one solo E2E: play against bots.

Run unit, property, integration, E2E, typecheck, and build. Produce /docs/security-report.md.
```

---

# PHASE 10 — Production Deployment

```text
Read /CLAUDE.md. Prepare a single-service deployment (Render or Railway):
- One Node process serves the built client, the REST endpoints, and Socket.IO (same origin; no CORS in prod).
- Exactly one instance (in-memory state). Document that a restart/deploy ends live games.
- Production env vars, .env.example, secure headers (helmet), trust proxy, /health for the platform check.
- Structured logging and error logging; graceful shutdown (notify clients, close sockets).
- Socket.IO configured for WebSockets behind the platform proxy.
Test the production build locally (npm run build && npm start) before writing /docs/deployment.md.
Note hosting caveats (free tiers that sleep will drop live games).
```

---

# PHASE 11 (Optional) — Persistence

```text
Read /CLAUDE.md. Add PostgreSQL (Neon) + Drizzle.
Tables: users (guest or auth), rooms, game_sessions, hand_results (winners, pot, board, per-player net).
Write only on important events (room created, hand finished, game finished) — never per action.
DB failures must not break live gameplay (log and continue). Migrations + updated docs.
```

---

# PHASE 12 (Optional) — Google Authentication

```text
Read /CLAUDE.md. Add Google sign-in as an alternative way to obtain a session token.
Guests still work. Store users in Postgres. Socket.IO auth is unchanged (token in handshake),
so the engine, rooms, and table controller do not change. Same-origin httpOnly cookie or
short-lived token — document the choice in /docs/auth.md. Handle logout and expiry.
```

---

# MVP Scope

MVP = Phases 0–10. Not in MVP: real money, tournaments/blind levels, leaderboards, friends, chat,
achievements, stats, Redis, multiple server instances, microservices.
