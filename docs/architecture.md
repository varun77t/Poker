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
│       ├── views.ts             RoomView, GameView, SeatView, LegalActions, HandResultView
│       ├── events.ts            ClientToServerEvents, ServerToClientEvents, Ack, ErrorCode
│       ├── schemas.ts           zod schemas for every client→server payload + RoomSettings
│       └── constants.ts         MAX_SEATS=5, ROOM_CODE_ALPHABET, defaults and bounds
├── server/
│   └── src/
│       ├── index.ts             bootstrap: Express, Socket.IO, static client, graceful shutdown
│       ├── config.ts            env parsing (zod)
│       ├── http/
│       │   ├── routes.ts        /health, POST /api/session
│       │   └── static.ts        serves client/dist in production
│       ├── sessions/
│       │   └── sessionStore.ts  token → { playerId, displayName, lastSeen }
│       ├── rooms/
│       │   ├── roomCode.ts      code generation + normalization
│       │   ├── room.ts          Room type + seat helpers
│       │   └── roomManager.ts   create/join/leave, host migration, TTL cleanup, player→room index
│       ├── table/
│       │   ├── tableController.ts  one per playing room: runs hands, timers, pacing, rebuys, game end
│       │   └── clock.ts         injectable scheduler (real vs fake in tests)
│       ├── engine/              PURE — must not import anything outside engine/ and shared/
│       │   ├── deck.ts          createDeck, shuffle(rng)
│       │   ├── evaluator.ts     evaluate7(cards) → { category, rankValue, best5, label }
│       │   ├── betting.ts       legal actions, raise rules, round completion
│       │   ├── pots.ts          layering, side pots, uncalled returns, payouts, odd chips
│       │   ├── engine.ts        createHand, applyAction, advance, forceFold
│       │   ├── types.ts         HandState, HandPlayer, EngineEvent, EngineError
│       │   └── view.ts          toGameView(state, viewerId): the only hidden-info projection
│       ├── socket/
│       │   ├── middleware.ts    handshake auth (token → playerId), single-socket-per-player
│       │   ├── guard.ts         wraps handlers: rate limit → zod parse → try/catch → ack
│       │   ├── handlers.ts      room:*, game:* event handlers (thin)
│       │   └── broadcaster.ts   emits per-player snapshots for a room
│       └── db/                  Phase 10 only (Drizzle schema + migrations)
│   └── test/                    integration tests (in-process server + socket.io-client)
├── client/
│   └── src/
│       ├── main.tsx, App.tsx    router: /, /create, /room/:code
│       ├── socket/              socket singleton (typed), session bootstrap
│       ├── hooks/               useSession, useTableState, useAction, useCountdown
│       ├── pages/               Landing, CreateRoom, Room (renders Lobby | Table | Finished)
│       ├── components/          PokerTable, PlayerSeat, PlayingCard, CommunityCards, Pot,
│       │                        ActionPanel, DealerButton, BlindMarker, GameStatus, ...
│       └── styles/              tokens.css + *.module.css
└── e2e/                         Playwright tests (Phase 8)
```

**Dependency rule:**
```
client → shared
server → shared
engine → shared (types only)
```
The engine never imports `socket/`, `rooms/`, `table/`, or anything from Node except types. `crypto` is injected through the RNG parameter.

---

## 3. Architecture diagram

```
┌─────────────────────────── Browser (per player) ───────────────────────────┐
│  React pages/components  ←  useTableState (latest snapshot, by version)    │
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
│  (Phase 10) persistence hook: onHandComplete / onGameEnd → Postgres         │
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
            → error (NOT_YOUR_TURN | ILLEGAL_ACTION | INVALID_AMOUNT) → ack error, nothing changes
            → ok: controller stores new hand state, seq++, cancels turn timer
        controller.schedule():
            hand.awaiting == 'action' → start turn timer for next actor
            hand.awaiting == 'deal'   → after STREET_DELAY: engine.advance(hand)  (repeat for run-outs)
            hand.awaiting == 'none'   → hand complete: apply results to seat stacks,
                                        after SHOWDOWN_DELAY: next hand or game end
        ack ok; broadcaster.emitRoom(code)
```

### 6.4 Turn timeout
```
clock fires with (handId, seq) captured at scheduling time
if (handId, seq) no longer current → ignore (stale timer)
else intent = canCheck ? check : fold → same path as 6.3 (minus ack)
```

### 6.5 Disconnect / reconnect
```
disconnect: mark seat.connected = false, broadcast
            status waiting → start 60 s grace; on expiry leave room (host migrates)
            status playing → nothing extra; turn timer handles their turns;
                             controller counts consecutive hands disconnected (remove after 3, between hands)
reconnect:  handshake with the same token → middleware → playerId → roomManager finds their room
            seat.connected = true, cancel grace timer, broadcast (the reconnecting socket gets its full snapshot)
            client also emits sync:request on connect as a belt-and-braces measure
```

### 6.6 Leave
```
room:leave → if mid-hand and active: engine.forceFold; the seat is freed after the hand ends
          → otherwise free the seat now; host migration; if the room is empty, start the TTL
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
| `room:create` | `{ settings: RoomSettings }` | anyone | `{ code }` |
| `room:join` | `{ code: string }` | anyone | `{ code }` |
| `room:leave` | `{}` | member | — |
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
| `room:closed` | `{ reason: 'expired' \| 'server_restart' }` | the room was removed |

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
  table: TableController | null;
}
interface Seat {
  playerId: PlayerId;
  displayName: string;              // with " (2)" suffix if duplicated in room
  stack: number;                    // between hands; during a hand the engine holds live stacks
  totalBuyIn: number;               // starting stack + rebuys
  connected: boolean;
  waitingForNextHand: boolean;
  leaving: boolean;                 // left mid-hand; remove after hand
  missedHandsDisconnected: number;
}

// engine/types.ts
interface HandState {
  handId: number;                   // increments per hand within the room
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
}
```

### 8.2 Engine API
```ts
createHand(input: { handId, players: {playerId, seat, stack}[], buttonSeat, smallBlind, bigBlind, deck: Card[] }): HandState
getLegalActions(state, playerId): LegalActions | null
applyAction(state, playerId, intent): { ok: true; state; events } | { ok: false; error: EngineError }
advance(state): { state; events }            // valid only when awaiting == 'deal'
forceFold(state, playerId): { state; events }
toGameView(state, viewerId): GameView        // in view.ts
```
All functions return **new** state objects and never mutate their input. That makes them easy to test and lets the controller keep the previous state if needed.

### 8.3 Views sent to clients (`shared/src/views.ts`)
```ts
interface TableSnapshot {
  version: number;
  room: RoomView;
  game: GameView | null;            // null in lobby / finished (finished shows results in RoomView)
}
interface RoomView {
  code: string; status: Room['status']; hostId: PlayerId; settings: RoomSettings;
  youId: PlayerId;
  seats: ({ seat: number; playerId: PlayerId; displayName: string; stack: number;
            connected: boolean; waitingForNextHand: boolean; busted: boolean } | null)[];
  finalResults: { playerId: PlayerId; displayName: string; finalStack: number; net: number }[] | null;
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
    lastAction: { type: string; amount?: number } | null;
    holeCards: [Card, Card] | null;   // own always; others only if revealed (R-7.3, R-5.8)
  }[];
  legalActions: LegalActions | null;  // only for the viewer, only on their turn
  result: HandResultView | null;      // pots, winners, amounts, labels
}
```

### 8.4 Client state
- `useTableState` holds the latest snapshot and **ignores any snapshot whose `version` ≤ the current one**.
- React never computes poker values. It derives display-only values, such as seat rotation so "me" sits at the bottom, and the countdown from `turnDeadline`.
- The action panel sends `{ handId, seq }` from the snapshot it rendered. After sending, it disables itself until a newer snapshot arrives or the ack returns an error.

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

## 10. Timers & pacing (`tableController` + `clock.ts`)

| Timer | Default | Notes |
|---|---|---|
| Turn timer | room setting (30 s) | `turnDeadline` sent to clients; stale-guarded by `(handId, seq)` |
| Street delay | 800 ms | between the end of a betting round and dealing the next street |
| Run-out card delay | 1500 ms | each street dealt during an all-in run-out |
| Showdown / results pause | 5000 ms (3000 ms if won by folds) | before the next hand |
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

## 12. Database entities (Phase 10, optional)
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
- **Env vars:** `PORT`, `API_PORT` (dev only), `NODE_ENV`, `LOG_LEVEL`. Phase 10 adds `DATABASE_URL`; Phase 11 adds the Google OAuth vars.
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
| Table controller | Vitest + fake `Clock` | Hand sequencing, timers, pacing, rebuys, busts, removals, game end |
| Socket integration | Vitest + in-process server + `socket.io-client` | Multi-client flows, all error codes, **no hole-card leakage in any emitted payload**, reconnect restores the view |
| E2E | Playwright (3 browser contexts) | Create → invite link join → play hands → disconnect/reconnect → finish |
| Manual | 3 browser profiles, plus one phone on the LAN | Feel, layout, timing |

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
- **7** Polish
- **8** Security audit + E2E
- **9** Deploy
- **10** (optional) Persistence
- **11** (optional) Google auth
