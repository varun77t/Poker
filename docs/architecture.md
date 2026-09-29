# Architecture

Companion docs:
- [product-spec.md](product-spec.md): what the app does.
- [game-rules.md](game-rules.md): exact poker rules.
- [build-plan.md](build-plan.md): phase prompts.
- `/CLAUDE.md`: non-negotiable rules.
- `socket-events.md` (created in Phase 2): becomes the living event contract. It must stay consistent with §7 here.

---

## 1. Principles
1. **Server-authoritative.** Clients send *intents*. The server validates them, applies them, and sends back *views*.
2. **Pure engine.** The poker engine is a set of deterministic functions over plain data. It has no I/O, no timers, and no hidden randomness.
3. **One projection function.** Hidden information leaves the server only through `toPlayerView()`.
4. **Snapshots, not deltas.** Every change sends each player a complete view of the table. Reconnecting is the same as receiving one more snapshot.
5. **Single process, in-memory state.** Exactly one server instance. The database (optional, later) stores results only, never live state.

---

## 2. Folder structure

```
poker/
├── package.json                 npm workspaces: shared, server, client
├── tsconfig.base.json           strict TS settings shared by all packages
├── CLAUDE.md
├── .env.example
├── docs/
├── shared/                      imported by both server and client
│   └── src/
│       ├── cards.ts             Card, Rank, Suit types
│       ├── views.ts             TableSnapshot, RoomView, SeatView
│       ├── game.ts              GameView, LegalActions, ActionIntent, HandResult (hand in progress, per player)
│       ├── events.ts            ClientToServerEvents, ServerToClientEvents, Ack, ErrorCode
│       ├── schemas.ts           zod schemas for every client→server payload + RoomSettings
│       └── constants.ts         MAX_SEATS=5, ROOM_CODE_ALPHABET, defaults and bounds
├── server/
│   └── src/
│       ├── index.ts             bootstrap: listen, graceful shutdown
│       ├── app.ts               wires everything; createAppServer() is also used by tests
│       ├── config.ts            env parsing (zod)
│       ├── clock.ts             injectable time + scheduler (system clock; FakeClock in tests)
│       ├── policies.ts          timing and rate-limit values
│       ├── rateLimiter.ts       token bucket per key
│       ├── errors.ts            DomainError (expected, user-facing failures → ack errors)
│       ├── http/
│       │   ├── routes.ts        /health, POST /api/session
│       │   └── static.ts        serves client/dist in production
│       ├── sessions/
│       │   └── sessionStore.ts  token → { playerId, displayName, lastSeen }
│       ├── rooms/
│       │   ├── roomCode.ts      secure code generation
│       │   ├── room.ts          Room type, seat helpers, toRoomView/toSnapshot projections
│       │   └── roomManager.ts   create/join/leave/start, host migration, TTL + grace timers, player→room index
│       ├── table/
│       │   └── tableController.ts  one per playing room: deals hands, turn timers, pacing, payouts, button, game end
│       ├── engine/              PURE — must not import anything outside engine/ and shared/
│       │   ├── index.ts         the public API (import the engine from here)
│       │   ├── deck.ts          FULL_DECK, shuffle / shuffledDeck(randomInt) — Fisher–Yates, RNG injected
│       │   ├── evaluator.ts     evaluateHand(5–7 cards) → { category, rankValue, best5, label }
│       │   ├── seats.ts         clockwise order, firstButtonSeat, nextButtonSeat
│       │   ├── betting.ts       legal actions, intent validation, raise rules, round completion
│       │   ├── pots.ts          layering, side pots, uncalled chips, odd-chip splits
│       │   ├── engine.ts        createHand, applyAction, advance, forceFold, showdown
│       │   ├── types.ts         HandState, HandPlayer, EngineEvent, EngineError
│       │   ├── hint.ts          handHint(hole, board): the viewer's made hand, draws, board-only flag
│       │   └── view.ts          toGameView(state, viewerId): the only hidden-info projection (+ history, yourHand)
│       ├── bots/                PURE like engine/ (no timers, I/O or Math.random; lint-enforced):
│       │   ├── strategy.ts      decide({ level, view, legal, bigBlind, reads? }, rng) → a legal intent; Easy and Medium
│       │   ├── pro.ts           the Pro level: positional pre-flop, range-based post-flop, value bets, bluffs, folds
│       │   ├── ranges.ts        opponent ranges from their public line and tendencies; range-weighted equity
│       │   ├── reads.ts         per-player tendencies (VPIP, PFR, aggression, fold-to-bet) from public actions
│       │   ├── spot.ts          the bot's read of its turn, bet sizing helpers shared by every level
│       │   ├── handStrength.ts  preflopScore (Chen formula), estimateEquity (Monte Carlo run-outs)
│       │   ├── fastRank.ts      integer 7-card ranker for the run-outs; matches the evaluator's rankValue
│       │   ├── rng.ts           createRng(seed): seeded mulberry32; the controller seeds it from crypto
│       │   └── names.ts         BOT_NAMES, pickBotName (first name not taken in the room)
│       ├── socket/
│       │   ├── index.ts         connection lifecycle: single socket per player, reconnect, disconnect
│       │   ├── middleware.ts    handshake auth (token → socket.data.playerId)
│       │   ├── connections.ts   playerId → active socket
│       │   ├── guard.ts         wraps handlers: rate limit → ack required → zod parse → try/catch → ack
│       │   ├── handlers.ts      sys:*, sync:*, room:*, game:* event handlers (thin)
│       │   └── broadcaster.ts   emits per-player snapshots for a room
│       └── db/                  Phase 11 only (Drizzle schema + migrations)
│   └── test/                    integration tests (in-process server + socket.io-client)
├── client/
│   ├── PRODUCT.md               product context for design work
│   ├── prototypes/              approved HTML table prototype (design reference, not built)
│   └── src/
│       ├── main.tsx, App.tsx    router: /, /create, /room/:code (+ /dev/table in development only)
│       ├── socket/              socket singleton (typed), session bootstrap, request()
│       ├── state/store.ts       latest snapshot (by version), connection status, server clock offset
│       ├── pages/               Landing, CreateRoom, Room (renders Lobby | TablePage | FinishedPage),
│       │                        TablePage, FinishedPage (results + next game), DevTable
│       ├── components/          Layout, Button, TextField, SettingsForm, ConnectionOverlay
│       │   └── table/           PokerTable, Seat, PlayingCard, ChipStack, ActionPanel, RoomBar,
│       │                        BotControls (host's add-bot panel and remove confirm) (+ .module.css)
│       ├── table/               model.ts (display derivations), motionPlan.ts (what moves between
│       │                        two snapshots), useTableMotion.ts (plays it); unit tested with Vitest
│       └── styles/              global.css (placeholder screens); cardRoom.module.css (the in-game world's
│                                tokens and shared controls, used by TablePage and FinishedPage)
└── e2e/                         Playwright tests (Phase 9)
```

**Dependency rule:**
```
client → shared
server → shared
engine → shared (types only)
bots   → engine (evaluator, view and legal-action types), shared
```
The engine never imports `socket/`, `rooms/`, `table/`, or anything from Node except types. `crypto` is injected through the RNG parameter.

Bots get the same treatment. When a bot is to act, the table controller sets a `'bot'` timer (a think time of 0.8–2.5 s) instead of the turn timer. When it fires, it calls `decide({ level, view: toGameView(state, botId), legal: getLegalActions(state, botId), bigBlind, reads }, rng)`, so a bot only ever sees what a player in its seat would see. `reads` is the table's memory of how each player plays, built after every hand from the public action history (`recordHand`), never from hidden cards; the Pro level uses it. Its action then goes through the same `handId` + `seq` + engine validation path as a human's. If `decide` throws or returns something illegal, the error is logged and the bot checks if it can, otherwise folds.

Bots have a seat (`Seat.bot` is their level) but no session and no socket. Their ids look like `bot:3`, which can never be a session's UUID, so nobody can act as a bot. They are not in the player → room index, the broadcaster skips them, they are always `connected`, and they never become host.

---

## 3. Architecture diagram

```
┌─────────────────────────── Browser (per player) ───────────────────────────┐
│  React pages/components  ←  store (latest snapshot, by version)            │
│          │ intents                                    ▲ state snapshots     │
│          ▼                                            │                     │
│  typed socket.io-client  (auth: { token })  ──────────┘                     │
└──────────┬──────────────────────────────────────────────▲───────────────────┘
           │ WebSocket (same origin)                      │
┌──────────▼──────────────────────────────────────────────┴───────────────────┐
│ Node process                                                                │
│                                                                             │
│  Express ── /health, POST /api/session, static client                        │
│                                                                             │
│  Socket.IO                                                                  │
│   ├─ middleware: token → playerId (sessionStore)                            │
│   ├─ guard: rate limit → zod → handler → ack                                │
│   └─ handlers ──► RoomManager ──► Room ──► TableController ──► Engine       │
│                        │                        │  (timers via Clock)  (pure)│
│                        └──────── Broadcaster ◄──┘                           │
│                                   │  for each seated player:                │
│                                   │    toGameView(hand, playerId)           │
│                                   ▼                                         │
│                          socket.emit('state', snapshot)  (per socket)       │
│                                                                             │
│  (Phase 11) persistence hook: onHandComplete / onGameEnd → Postgres         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module responsibilities

| Module | Owns | Does not do |
|---|---|---|
| `sessionStore` | Issue, validate, and expire guest tokens | Room logic |
| `roomManager` | Rooms map, code uniqueness, seats, host, `playerId → roomCode` index, empty-room TTL, lobby disconnect grace | Poker rules |
| `tableController` | Game lifecycle for one room: pick the button, start hands, call engine, turn timers, street/showdown pacing, rebuys, busts, removals, game end, `seq` bookkeeping | Validating poker legality (the engine does that) |
| `engine/*` | All poker rules in [game-rules.md](game-rules.md) | Time, I/O, identity, sockets |
| `view.ts` | Removing hidden info (other players' hole cards, deck) | Anything else |
| `handlers` | Mapping events to manager/controller calls | Business logic |
| `broadcaster` | Building and sending per-player snapshots after every change | Deciding what changed |

---

## 5. Identity & sessions
1. The client calls `POST /api/session { displayName }` and gets `{ playerId, sessionToken, displayName }`.
   - `playerId` is a random UUID.
   - `sessionToken` is 32 random bytes, base64url-encoded.
   - The client stores both in `localStorage`.
2. The client connects: `io({ auth: { token } })`.
3. **Middleware:**
   - Looks up the token. If it's unknown or expired, the connection is rejected with `connect_error: "AUTH_INVALID"`. The client then clears storage and redoes step 1.
   - If the token is valid, it sets `socket.data.playerId`.
   - If that player already has a live socket, the server emits `session:replaced` to the old socket and disconnects it.
4. Every handler gets its identity **only** from `socket.data.playerId`. Payloads never carry identity.
5. Tokens are never logged. In production, `/api/session` is served over HTTPS only.
6. **Google auth later:** it just becomes another way to reach step 1's output. Nothing downstream changes.

---

## 6. Data flows

### 6.1 Create room
```
client  room:create { settings }                        (ack)
server  guard: rate limit, RoomSettingsSchema
        roomManager.create(playerId, settings)
          - leave any current room
          - generate unique code, seat creator at seat 0, host = creator, status = waiting
        ack { ok, data: { code } }
        broadcaster.emitRoom(code)                      → 'state' to each member
client  navigate to /room/CODE
```

### 6.2 Join room (code or invite link)
```
client  room:join { code }
server  normalize code (uppercase, strip spaces); rate limit joins per session (10/min)
        errors: ROOM_NOT_FOUND | ROOM_FULL
        already a member → success (idempotent)
        seat at the lowest free seat; if status == playing, the seat is marked `waitingForNextHand`
        ack ok → broadcast room snapshot
```

### 6.3 Player action
```
client  game:action { handId, seq, type, amount? }      (buttons disabled until next snapshot)
server  guard → ActionSchema (integers, amount ≥ 0)
        controller = room.table   (INVALID_STATE if none)
        handId/seq ≠ current → STALE_ACTION   (double-click, delayed packet, replay)
        engine.applyAction(hand, playerId, intent)
            → error (NOT_YOUR_TURN | ILLEGAL_ACTION | INVALID_AMOUNT | INVALID_STATE) → ack error, nothing changes
            → ok: controller stores the new hand state (the engine already bumped seq), cancels turn timer
        controller.schedule():
            hand.awaiting == 'action' → start turn timer for next actor
            hand.awaiting == 'deal'   → after STREET_DELAY: engine.advance(hand)  (repeat for run-outs)
            hand.awaiting == 'none'   → hand complete: apply results to seat stacks,
                                        after SHOWDOWN_DELAY: next hand or game end
        ack ok; broadcaster.emitRoom(code)
```

### 6.4 Turn timeout
```
the controller keeps ONE timer (turn, next street, or next hand); every transition cancels it and schedules the next
the callback also checks the (handId, seq) captured at scheduling time → stale: ignore
intent = canCheck ? check : fold → engine.applyAction (R-9.2), then the same scheduling as 6.3
someone else being force-folded (6.6) keeps the current player's deadline instead of restarting it
```

### 6.5 Disconnect / reconnect
```
disconnect: mark seat.connected = false, broadcast
            status waiting → start 60 s grace; on expiry leave room (host migrates)
            status playing → nothing extra; turn timer handles their turns;
                             each hand that starts while they are away counts (seat.missedHands);
                             at 3, they are removed before the next hand (R-9.3); chips leave with them
reconnect:  handshake with the same token → middleware → playerId → roomManager finds their room
            seat.connected = true, missedHands = 0, cancel grace timer, broadcast (the reconnecting socket gets its full snapshot)
            client also emits sync:request on connect as a belt-and-braces measure
```

### 6.6 Leave
```
room:leave → the player stops being a member now (index cleared, no more snapshots, host migrates)
          → dealt into the current hand: seat.leaving = true, engine.forceFold (all-in: stays in the hand);
            the seat is freed before the next hand, so the hand's seats stay intact during the results pause
          → otherwise the seat is freed now
          → no members left: stop the table, clear the seats, status back to 'waiting', start the empty-room TTL
rejoining the same room while the seat is still 'leaving' takes it back (the fold stands)
```

---

## 7. Socket.IO events (initial contract)

All client→server events take a payload and an **ack callback**:
```ts
type Ack<T = {}> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };
type ErrorCode =
  | 'INVALID_PAYLOAD' | 'RATE_LIMITED' | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NOT_IN_ROOM'
  | 'NOT_HOST' | 'NOT_ENOUGH_PLAYERS' | 'INVALID_STATE' | 'STALE_ACTION'
  | 'NOT_YOUR_TURN' | 'ILLEGAL_ACTION' | 'INVALID_AMOUNT' | 'REBUY_NOT_ALLOWED' | 'INTERNAL';
```

### Client → Server
| Event | Payload | Who / when | Result |
|---|---|---|---|
| `room:create` | `{ settings: RoomSettings, bots?: BotLevel[] }` | anyone | `{ code }` |
| `room:addBot` | `{ level: 'easy'\|'medium'\|'pro', seat?: number }` | host | `{ seat }` |
| `room:removeBot` | `{ seat: number }` | host | — |
| `room:join` | `{ code: string }` | anyone | `{ code }` |
| `room:leave` | `{}` | member | — |
| `room:updateSettings` | `{ settings: RoomSettings }` | host; status `waiting` or `finished` | — |
| `game:start` | `{}` | host; status `waiting` or `finished`; ≥ 2 seated | — |
| `game:action` | `{ handId: number, seq: number, type: 'fold'\|'check'\|'call'\|'bet'\|'raise'\|'allIn', amount?: number }` | the player to act | — |
| `game:rebuy` | `{}` | busted member; rebuys on; between hands | — |
| `game:end` | `{}` | host; status `playing` | — |
| `sync:request` | `{}` | member | the server re-emits `state` |

### Server → Client
| Event | Payload | When |
|---|---|---|
| `state` | `TableSnapshot` (§8.3) | after every change, per player |
| `session:replaced` | `{}` | this socket was superseded by a newer tab/connection |
| `room:closed` | `{ reason: 'server_restart' }` | *(Phase 10, graceful shutdown)* the room was removed |

The live, authoritative list is [socket-events.md](socket-events.md).

---

## 8. State structures

### 8.1 Server-internal (never sent as-is)
```ts
// rooms/room.ts
interface Room {
  code: string;
  hostId: PlayerId;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;           // { startingStack, smallBlind, bigBlind, turnSeconds, rebuys }
  seats: (Seat | null)[];           // length 5
  version: number;                  // ++ on ANY change; lets clients drop out-of-order snapshots
  emptySince: number | null;
  table: TableController | null;    // while status == 'playing'
  lastHandId: number;               // hand ids never repeat within a room (they keep counting across games)
  departed: Map<PlayerId, { displayName; stack; totalBuyIn; botLevel }>; // played this game, then left: chips come back on rejoin
  finalResults: FinalResult[] | null; // while status == 'finished'
}
interface Seat {
  playerId: PlayerId;
  displayName: string;              // with " (2)" suffix if duplicated in room
  stack: number;                    // between hands; during a hand the engine holds live stacks
  totalBuyIn: number;               // starting stack + rebuys
  connected: boolean;
  waitingForNextHand: boolean;
  leaving: boolean;                 // left while dealt in; not a member; freed before the next hand
  missedHands: number;              // hands started in a row while disconnected (R-9.3)
  played: boolean;                  // dealt into at least one hand of the current game (has a result)
  bot: 'easy' | 'medium' | 'pro' | null; // a server-run bot (no session or socket); null for people
}

// engine/types.ts
interface HandState {
  handId: number;                   // increments per hand within the room
  seq: number;                      // bumped by the engine on every change; actions must echo it
  totalChips: number;               // Σ starting stacks, for the conservation check (R-7.6)
  smallBlind: number; bigBlind: number;
  buttonSeat: number; sbSeat: number; bbSeat: number;
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  awaiting: 'action' | 'deal' | 'none';   // 'none' = hand complete
  deck: Card[];                     // remaining cards, in order
  board: Card[];
  players: HandPlayer[];            // dealt-in players, ordered by seat
  betLevel: number;
  minRaise: number;
  toActSeat: number | null;
  allRevealed: boolean;             // set once no more betting is possible (R-5.8) or at showdown
  result: HandResult | null;
  log: EngineEvent[];               // public action log for this hand
}
interface HandPlayer {
  playerId: PlayerId; seat: number;
  stack: number;
  holeCards: [Card, Card];
  status: 'active' | 'folded' | 'allIn';
  committed: number;                // this street
  contributed: number;              // whole hand
  hasActed: boolean;                // since action last reopened
  betLevelWhenLastActed: number;    // for R-4.5
  lastAction: LastAction | null;    // this street; shown next to the seat
}
```

### 8.2 Engine API (`server/src/engine/index.ts`)
```ts
createHand(input: { handId, players: {playerId, seat, stack}[], buttonSeat, smallBlind, bigBlind, deck: Card[] }): { state; events }
getLegalActions(state, playerId): LegalActions | null
applyAction(state, playerId, intent): { ok: true; state; events } | { ok: false; error: EngineError }
advance(state): { state; events }            // valid only when awaiting == 'deal'
forceFold(state, playerId): { state; events }
toGameView(state, viewerId, { turnDeadline? }): GameView
shuffledDeck(randomInt): Card[]              // the controller passes secureRandomInt (crypto.randomInt)
firstButtonSeat(eligibleSeats, randomInt) / nextButtonSeat(previousButton, eligibleSeats)
evaluateHand(cards): HandValue               // 5–7 cards
```
- All functions return **new** state objects and never mutate their input. That makes them easy to test and lets the controller keep the previous state if needed.
- `createHand` throws on invalid input (a controller bug): fewer than 2 players, a zero stack, a bad deck, or a button on a non-eligible seat.
- `EngineError.code` is one of `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `INVALID_AMOUNT`, `INVALID_STATE`, which are all shared `ErrorCode`s, so the controller passes them straight to the ack.
- `events` describe what happened (blinds, actions, uncalled chips returned, streets dealt, hands revealed, pots awarded). The controller uses them for pacing. They never contain hole cards.

### 8.3 Views sent to clients (`shared/src/views.ts`, `shared/src/game.ts`)
The exact `GameView`, `LegalActions` and `HandResult` types are in [`shared/src/game.ts`](../shared/src/game.ts). The outline below is the shape.
```ts
interface TableSnapshot {
  version: number;
  serverTime: number;               // server clock when sent (clients correct deadlines for clock skew)
  room: RoomView;
  game: GameView | null;            // current hand, or the finished one during the results pause; else null
}
interface RoomView {
  code: string; status: Room['status']; hostId: PlayerId; settings: RoomSettings;
  youId: PlayerId;
  seats: ({ seat: number; playerId: PlayerId; displayName: string; stack: number;   // live stack during a hand
            connected: boolean; waitingForNextHand: boolean; busted: boolean; leaving: boolean } | null)[];
  table: { nextHandAt: number | null; waitingForPlayers: boolean; endingAfterHand: boolean } | null; // while playing
  finalResults: { playerId: PlayerId; displayName: string; finalStack: number; totalBuyIn: number; rebuys: number; net: number }[] | null; // while finished
}
interface GameView {
  handId: number; seq: number;
  street: HandState['street'];
  board: Card[];
  pots: { amount: number; eligibleSeats: number[] }[];   // from previous streets (R-6.5)
  buttonSeat: number; sbSeat: number; bbSeat: number;
  toActSeat: number | null;
  turnDeadline: number | null;     // epoch ms
  players: {
    seat: number; playerId: PlayerId; stack: number; committed: number;
    status: 'active' | 'folded' | 'allIn';
    lastAction: { type: 'fold'|'check'|'call'|'bet'|'raise'; amount?: number; allIn: boolean } | null;
    holeCards: [Card, Card] | null;   // own always; others only if revealed (R-7.3, R-5.8)
  }[];
  legalActions: LegalActions | null;  // only for the viewer, only on their turn
  result: HandResult | null;          // { wonByFold, pots with winners and amounts, shown hands with labels }
}
```

### 8.4 Client state
- The store (`client/src/state/store.ts`) holds the latest snapshot and **ignores any snapshot whose `version` ≤ the current one**. It also keeps `clockOffset = serverTime − Date.now()` from each snapshot, so `turnDeadline` and `nextHandAt` count down correctly even when a laptop's clock is off.
- React never computes poker values. `client/src/table/model.ts` only arranges server values for display: seat rotation so "me" sits at the bottom, seat tags, pot totals, the ½-pot and pot shortcuts (clamped to the server's `minTo`/`maxTo`), and the wording of a result.
- The action panel sends `{ handId, seq }` from the snapshot it rendered. After sending, it disables itself until a newer snapshot arrives (it is keyed by `seq`) or the ack returns an error, which it shows inline.
- **Motion:** the screen always renders the newest snapshot. After each render, `planMotion(previous, next)` lists what visibly changed (cards dealt, bets placed, bets swept into the pot, cards turned over, pots paid out), and `useTableMotion` flies copies of cards and chips between named anchors (`data-anchor`) on an overlay, hiding each target until its copy lands. It never changes state, is skipped for reconnects mid-hand, and is off under `prefers-reduced-motion`.

---

## 9. Validation & security pipeline
Every client→server event passes through `guard()`:
1. **Rate limit:**
   - Token bucket per socket: 20 events per 5 s.
   - `room:join`: 10 per minute per session.
   - Exceeding the limit returns `RATE_LIMITED`. Sustained abuse disconnects the socket.
2. **Schema:** zod `.strict()` parse.
   - Integers only, `amount ≥ 0`, amounts capped at 1e9, room code capped at 6–10 characters.
   - Unknown keys are rejected.
3. **Identity:** `socket.data.playerId` only.
4. **Authorization:** room membership, host-only checks, and room status.
5. **Domain:** the engine checks legality.
6. **Errors:** handler exceptions are caught and return `INTERNAL`. The error is logged server-side with the stack; the client gets no stack.

**Transport:**
- Socket.IO `maxHttpBufferSize = 10_000`.
- In production, same origin only, so CORS isn't enabled.
- `helmet` on Express.

**Hidden information:**
- The broadcaster calls `toGameView(hand, playerId)` **once per player** and emits to that player's socket only.
- It never uses a room-wide broadcast for game state. The `deck` field never appears in any view.
- An integration test checks every emitted payload against every other player's hole cards.

---

## 10. Timers & pacing (`clock.ts`, `policies.ts`, later `tableController`)

| Timer | Default | Notes |
|---|---|---|
| Turn timer | room setting (30 s) | `turnDeadline` sent to clients; stale-guarded by `(handId, seq)` |
| Bot think time | 800–2500 ms | replaces the turn timer on a bot's turn; stale-guarded the same way |
| Street delay | 800 ms | between the end of a betting round and dealing the next street |
| Run-out card delay | 1500 ms | each street dealt during an all-in run-out |
| Showdown / results pause | 5000 ms (3000 ms if won by folds) | before the next hand; `table.nextHandAt` |
| Missed hands | 3 hands | a disconnected player is removed once 3 hands in a row started while away (R-9.3) |
| Lobby disconnect grace | 60 s | `roomManager` |
| Empty room TTL | 10 min | `roomManager` |
| Session expiry | 24 h idle | `sessionStore` sweeper (every 10 min) |

All timers go through an injectable `Clock` (`setTimeout`/`clearTimeout`/`now`), so tests can use fake timers.

**Concurrency:** Node runs handlers one at a time and every handler is synchronous with respect to room state, so there are no races between two players' actions. Timer callbacks must re-check `(handId, seq)` before acting.

---

## 11. REST API
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | — | `{ ok: true, uptime, rooms, sockets }` |
| POST | `/api/session` | `{ displayName }` | `{ playerId, sessionToken, displayName }` (rate limited: 10/min per IP) |

Everything else runs over Socket.IO.

---

## 12. Database entities (Phase 11, optional)
Only results are written, and only at key moments: room created, hand finished, game finished. A DB failure is logged and never interrupts play.

| Table | Columns |
|---|---|
| `users` | id, kind (`guest`\|`google`), display_name, google_sub (nullable, unique), created_at, last_seen_at |
| `rooms` | id, code, host_user_id, settings (jsonb), created_at, closed_at |
| `game_sessions` | id, room_id, started_at, ended_at |
| `game_players` | game_session_id, user_id, seat, total_buy_in, final_stack |
| `hand_results` | id, game_session_id, hand_number, button_seat, board (text[]), pots (jsonb: amounts, winners, labels), created_at |

---

## 13. Deployment
- **One service** (Render or Railway):
  - `npm run build` bundles the server with tsup (inlining `@poker/shared`, which is TypeScript source with no build step of its own), then builds the client with Vite.
  - `npm start` runs the server, which serves `client/dist` plus the API and Socket.IO on one port.
- **Exactly one instance:** no autoscaling, no multiple replicas, because game state is in memory.
- A deploy or restart ends live games. Clients get `room:closed` on graceful shutdown (SIGTERM), or a "room not found" message on reconnect.
- **Env vars:** `PORT`, `API_PORT` (dev only), `NODE_ENV`, `LOG_LEVEL`. Phase 11 adds `DATABASE_URL`; Phase 12 adds the Google OAuth vars.
  - `PORT` always means "the port users open". In production the Node server listens on it. In development Vite does.
  - In development the Node server listens on `API_PORT`. This stops an inherited `PORT` from making both processes compete for the same port.
- **Dev:** Vite dev server on `PORT` (5173) proxies `/api`, `/health` and `/socket.io` (with `ws: true`) to the server on `API_PORT` (3000), so the browser only ever sees one origin.
- **Hosting caveat:** free tiers that sleep will drop live games and cold-start slowly.

---

## 14. Edge cases (must be handled; most are covered by tests)

**Rooms / identity**
- Joining with a lowercase code or spaces, a nonexistent code, a full room, or a room you're already in (idempotent).
- Joining a new room while in another one (auto-leave, and forceFold if mid-hand).
- The host leaves in the lobby, mid-game, or while finished (migration). The last player leaves (TTL starts). Someone joins during the TTL (TTL cancelled).
- Same session in two tabs (`session:replaced`). Server restart (token invalid → new session; room gone).
- Two players with the same display name.

**Game flow**
- The host starts with exactly 2 players. Players drop to 2 mid-game, so heads-up rules take over.
- The button player leaves between hands (R-2.2).
- A player leaves or disconnects **on their turn** (forceFold advances the turn), or **while all-in** (the hand plays out).
- A player joins mid-hand (seat waiting; they don't appear in the hand).
- Everyone but one player folds (no reveal). Everyone is all-in preflop (full run-out). The short-stacked BB is all-in (R-2.6).
- Rebuy requested mid-hand (rejected until the hand ends). Rebuy while not busted (rejected).
- The game ends while a hand is in progress: the host presses End, and the current hand finishes first.
- A turn timer fires just as the player acts (the `seq` guard stops the stale timer).
- Double-clicked or replayed actions (`STALE_ACTION`). Any action while `awaiting == 'deal'` (`INVALID_STATE`).

**Bots**
- The last person leaves a room with bots in it (the bots go too; the room closes as an empty room).
- A bot is removed mid-hand (it folds; the seat is freed after the hand), or on its turn.
- Only bots have chips, or the only person with chips is disconnected (the table waits, R-10.6; with rebuys off and no person holding chips, the game ends).
- A bot busts (rebuys automatically with rebuys on; leaves with rebuys off).
- A bot's strategy throws or returns an illegal action (check, else fold).

**Security**
- Spoofed identity fields, negative/float/NaN/huge amounts, extra payload keys, event floods, oversized payloads, non-host start or end, actions from a folded, all-in, or removed player.

---

## 15. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Engine unit | Vitest | Every rule ID in [game-rules.md §11](game-rules.md#11-required-test-scenarios-phase-3), using fixed decks built with a `deckFrom('AsKd...')` helper |
| Engine property | Vitest + fast-check | Random 2–5 players, stacks, and legal actions: chip conservation, no negative stacks, termination, no leaked hidden info in `toGameView` |
| Evaluator | Vitest | Category table, kickers, wheel, board plays, plus a few thousand random 7-card hands checked against a slow brute-force reference |
| Rooms / sessions | Vitest + fake timers | Codes, join/leave, host migration, TTL, grace windows |
| Table controller | Vitest + fake `Clock` | Hand sequencing, timers, pacing, rebuys, busts, removals, game end (`test/table/lifecycle.test.ts`: whole games from start to finished screen and restart) |
| Room-level simulation | Vitest + fast-check | Random joins, leaves, disconnects, actions, rebuys, bots added and removed, host ends and restarts, with rebuys on and off: a zero-sum chip ledger (seated + departed players), finished results that sum to zero, no stuck table, no leaked cards |
| Bots | Vitest + fast-check | `test/bots/`: every decision is legal (property), decisions depend only on what the bot may see, fast ranker = evaluator, Medium beats Easy and Pro beats Medium over seeded matches, Pro reads ranges (folds to a tight player's barrels, bluffs players who fold, not calling stations), < 50 ms per decision; room rules, pauses, rebuys and leaves with bots (`botTable.test.ts`), fallback on a failing strategy |
| Socket integration | Vitest + in-process server + `socket.io-client` | Multi-client flows, all error codes, **no hole-card leakage in any emitted payload**, reconnect restores the view; 50 hands of one person against three bots (`botSync.test.ts`) |
| E2E | Playwright (3 browser contexts) | Create → invite link join → play hands → disconnect/reconnect → finish |
| Client display logic | Vitest | `table/model.ts` and `table/motionPlan.ts` (seat rotation, tags, bet-size shortcuts, result wording, final standings, animation choreography) |
| Manual | 3 browser profiles on a laptop/desktop screen (the app is desktop-only); `/dev/table?state=...` renders the in-game screens from sample data (turn, flop, showdown, waiting, busted, busted-off, ending, finished, finished-guest, bots, bots-waiting, bots-finished) | Feel, layout, timing |

**CI gate** (local script until CI exists): `npm run typecheck && npm run lint && npm test && npm run build`.

---

## 16. Implementation phases
See [build-plan.md](build-plan.md):
- **0** Docs
- **1** Setup
- **2** Sessions + rooms
- **3** Engine
- **4** Controller + sync + timers + reconnection
- **5** Table UI
- **6** Full lifecycle
- **7** Bots
- **8** Polish
- **9** Security audit + E2E
- **10** Deploy
- **11** (optional) Persistence
- **12** (optional) Google auth
