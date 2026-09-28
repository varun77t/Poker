# Socket.IO & HTTP Contract

This is the live reference for everything the client and server exchange. The types in [`shared/src/events.ts`](../shared/src/events.ts), [`shared/src/views.ts`](../shared/src/views.ts) and [`shared/src/schemas.ts`](../shared/src/schemas.ts) are the source of truth, and this page must stay in sync with them.

**Status:** Phase 4 (hands are dealt and played in real time). Rebuys, game end and restart arrive in Phase 6; bots in Phase 7.

---

## 1. Identity

1. The client calls `POST /api/session` (§5) and stores `{ playerId, sessionToken, displayName }` in `localStorage`.
2. The client connects with `io({ auth: { token: sessionToken } })`.
3. The server's handshake middleware resolves the token. It sets `socket.data.playerId`, or rejects the connection with `connect_error` message **`AUTH_INVALID`**.
   - On `AUTH_INVALID`, the client discards the stored session, creates a new one under the remembered name, and reconnects. The old seat is gone.
4. Handlers take identity **only** from `socket.data.playerId`. Payload schemas are strict, so a payload that carries `playerId`, `hostId` or any other unknown key is rejected with `INVALID_PAYLOAD`.
5. **One live socket per player.** A new connection with the same token replaces the old one. The old socket receives `session:replaced` and is disconnected. The seat stays connected throughout.

---

## 2. Conventions

- Every client→server event is `emit(event, payload, ack)`.
  - The payload is always an object (use `{}` when there are no fields).
  - Events sent without an ack callback are dropped.
- Acks have one shape:
  ```ts
  type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };
  ```
  `message` is safe to show to the user.
- **Pipeline for every event:** rate limit → ack required → strict zod parse → handler → ack.
- **State is pushed, not pulled.** After any change to a room, every member (seated, not left) receives a `state` snapshot on their own socket. Snapshots differ per player (hole cards), so there is never one shared broadcast.
  - A snapshot is often emitted *before* the ack of the request that caused it.
  - Clients drop a snapshot whose `version` is ≤ the one they already hold for the same room.

### Error codes

| Code | Meaning |
|---|---|
| `INVALID_PAYLOAD` | Payload failed schema validation (wrong type, unknown key, out-of-range value) |
| `RATE_LIMITED` | Too many events (per socket) or join attempts (per player) |
| `ROOM_NOT_FOUND` | No live room with that code (also returned for malformed codes) |
| `ROOM_FULL` | All 5 seats are taken |
| `NOT_IN_ROOM` | The action needs a seat and the player has none |
| `NOT_HOST` | Host-only action |
| `NOT_ENOUGH_PLAYERS` | Fewer than 2 seated players |
| `INVALID_STATE` | Not allowed in the room's current status (e.g. starting twice) |
| `STALE_ACTION` | The action's `handId`/`seq` is not the current hand state (double click, delayed or replayed packet) |
| `NOT_YOUR_TURN` | Not this player's turn, or they are not in the hand (folded, all-in, waiting for the next hand) |
| `ILLEGAL_ACTION` | The action isn't allowed now (e.g. check facing a bet, raise when raising is closed, R-4.5) |
| `INVALID_AMOUNT` | Missing, extra or out-of-range bet/raise amount (R-4.9) |
| `INTERNAL` | Unexpected server error (details are logged server-side only) |
| `REBUY_NOT_ALLOWED` | Reserved for Phase 6 |

---

## 3. Client → Server

| Event | Payload | Ack data | Rules |
|---|---|---|---|
| `sys:ping` | `{}` | `{ serverTime: number }` | Latency check |
| `sync:request` | `{}` | `{ roomCode: string \| null }` | Reports the player's room. If they have one, the server also re-sends `state`. The client sends this on every (re)connect. |
| `room:create` | `{ settings: RoomSettings }` | `{ code }` | Leaves any current room first. Creator takes seat 0 and is host. |
| `room:join` | `{ code: string }` (≤16 chars) | `{ code }` | See below |
| `room:leave` | `{}` | `{}` | See below. Host passes to the next member clockwise. When the last member leaves, any game stops, the room goes back to an empty lobby and is deleted after 10 minutes. `NOT_IN_ROOM` if not seated. |
| `room:updateSettings` | `{ settings: RoomSettings }` | `{}` | Host only (`NOT_HOST`); not while `playing` (`INVALID_STATE`). In `waiting`, every seated player's stack is reset to the new `startingStack`. In `finished`, only the settings change; they apply on restart. Identical settings are a no-op (no new snapshot). |
| `game:start` | `{}` | `{}` | Host only; status `waiting` or `finished`; ≥ 2 seated. Sets status `playing` and deals the first hand straight away (the first button is a random seat, R-2.2). |
| `game:action` | `{ handId, seq, type, amount? }` | `{}` | See §3.1 |

**`room:join` rules:**
- The code is normalized: uppercased, with spaces and dashes removed.
- Joining a room you're already in is idempotent.
- The player is seated in the lowest free seat. If the room is `playing`, they are marked `waitingForNextHand`.
- Joining leaves any other room, but only after the new room is known to have space.
- If the player left this room during the hand still being played (or shown), they get that seat and its chips back. Their fold stands, and they are dealt in from the next hand.
- Joining a room whose table is waiting for players (§4.2) deals the next hand at once.
- **Errors:** `ROOM_NOT_FOUND`, `ROOM_FULL`, and `RATE_LIMITED` (10 joins per minute per player).

**`room:leave` rules:**
- Not dealt into the current hand (lobby, waiting for the next hand, busted): the seat is freed now.
- Dealt into the current hand: the hand is folded at once (R-9.1; an all-in hand stays in and can still win). The seat stays, marked `leaving`, until the hand is over and its results pause has ended, then it is freed. Chips still on it leave with the player.
- Either way the player stops being a member at once: they get no more `state` events for the room and can create or join another.

### 3.1 `game:action`

```ts
{ handId: number; seq: number; type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn'; amount?: number }
```
- `handId` and `seq` are copied from the `game` of the snapshot the player acted on. If either differs from the current hand state, the action is rejected with `STALE_ACTION` and nothing changes. A double click therefore applies once.
- `amount` is required for `bet` and `raise` and must be absent otherwise. It is the street **total** after the action ("raise TO", R-4.1), between `legalActions.minTo` and `maxTo`.
- `allIn` becomes a call, bet or raise of the whole stack, whichever fits (game-rules §4).
- Schema: integers only, `handId`/`seq` ≥ 0, `0 ≤ amount ≤ 1,000,000,000`, no other keys (`INVALID_PAYLOAD` otherwise).
- **Errors:** `NOT_IN_ROOM`, `INVALID_STATE` (no game, no hand right now, the hand is over, or cards are being dealt), `STALE_ACTION`, `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `INVALID_AMOUNT`.
- On success every member gets a new `state` (usually before the ack).

### 3.2 `RoomSettings`

| Field | Type | Rule | Default |
|---|---|---|---|
| `startingStack` | int | 100 – 1,000,000 | 1000 |
| `smallBlind` | int | ≥ 1 and ≤ `bigBlind` | 5 |
| `bigBlind` | int | ≥ 2 and ≤ `startingStack / 10` | 10 |
| `turnSeconds` | int | 15 – 120 | 30 |
| `rebuys` | boolean | | true |

---

## 4. Server → Client

| Event | Payload | When |
|---|---|---|
| `state` | `TableSnapshot` | After every change to the player's room (actions, timeouts, dealt streets, results, joins, leaves, connection changes), on reconnect, and on `sync:request` |
| `session:replaced` | `{}` | Just before the server disconnects this socket, because the same session connected elsewhere |

Each member gets their **own** snapshot on their own socket; the `game` part is built by `toGameView()` for that player. Players who left (`leaving` seats) get nothing more.

```ts
interface TableSnapshot {
  version: number;          // increases on every room change
  serverTime: number;       // server clock (epoch ms) when sent; use it to correct turnDeadline/nextHandAt for clock skew
  room: RoomView;
  game: GameView | null;    // the current hand, or the one just finished during the results pause; else null
}
interface RoomView {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  settings: RoomSettings;
  youId: string;            // the receiving player
  seats: (SeatView | null)[]; // always 5; null = open seat
  table: TableView | null;  // while status is 'playing'
  finalResults: null;       // Phase 6
}
interface SeatView {
  seat: number;
  playerId: string;
  displayName: string;      // "Sam (2)" when another seated player is also "Sam" (case-insensitive, by join order)
  stack: number;            // chips in front of them; during a hand, what they have left behind (not in the pot)
  connected: boolean;       // false while disconnected (lobby: seat released after 60 s; game: see §4.2)
  waitingForNextHand: boolean; // joined during a game; dealt in from the next hand
  busted: boolean;          // 0 chips between hands (R-10.1): not dealt in
  leaving: boolean;         // left during this hand; the seat is freed before the next one
}
interface TableView {
  nextHandAt: number | null;   // server time the next hand is dealt, during the results pause
  waitingForPlayers: boolean;  // fewer than 2 players have chips: no hand until someone joins (R-10.4)
}
```

### 4.1 `GameView` (source: [`shared/src/game.ts`](../shared/src/game.ts))
```ts
interface GameView {
  handId: number;           // echo with actions
  seq: number;              // echo with actions; increases on every change to the hand
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  board: Card[];            // "As", "Td", ...
  pots: { amount: number; eligibleSeats: number[] }[]; // from previous streets (R-6.5); [] once the hand is over
  buttonSeat: number; sbSeat: number; bbSeat: number;
  toActSeat: number | null; // null while cards are being dealt and after the hand
  turnDeadline: number | null; // server time the current turn times out
  players: {                // dealt-in players, by seat
    seat: number; playerId: string;
    stack: number;          // chips behind
    committed: number;      // chips put in on this street
    status: 'active' | 'folded' | 'allIn';
    lastAction: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise'; amount?: number; allIn: boolean } | null; // this street
    holeCards: [Card, Card] | null; // yours always; others' only once revealed (R-5.8 run-out, R-7.3 showdown); folded never
  }[];
  legalActions: {           // only yours, only on your turn; build buttons and the slider from this alone
    canFold: boolean; canCheck: boolean; canCall: boolean; callAmount: number;
    canBet: boolean; canRaise: boolean; minTo: number; maxTo: number; // bounds of the "raise TO" total
  } | null;
  result: {                 // set when the hand is over
    wonByFold: boolean;     // nobody's cards are shown (R-7.4)
    pots: { amount: number; eligibleSeats: number[]; winners: { seat: number; playerId: string; amount: number }[] }[];
    shown: { seat: number; playerId: string; holeCards: [Card, Card]; best5: Card[]; category: string; label: string }[];
  } | null;
}
```
Players waiting for the next hand also get the `game` (without anyone's hole cards), so they can watch.

### 4.2 How a game runs
- **Start:** `game:start` deals hand 1. Everyone seated with chips is dealt in (R-2.1).
- **Turns:** the player to act has `turnSeconds` (room setting). When it runs out the server checks for them if that's legal, otherwise folds (R-9.2), connected or not.
- **Between streets:** after a betting round closes, the next street is dealt after 0.8 s. When no more betting is possible (R-5.8) everyone's hand is shown and the rest of the board comes out one street every 1.5 s.
- **Results:** the finished hand stays in `game` with its `result` for 5 s after a showdown or 3 s after a hand won by folds (`table.nextHandAt`), then the next hand is dealt with the button moved (R-2.2).
- **Between hands:** seats of players who left are freed; late joiners are dealt in; busted players (0 chips) are skipped. If fewer than 2 players have chips, `game` becomes null and `table.waitingForPlayers` is true until someone joins. (Rebuys and game end: Phase 6.)
- **Disconnects:** a disconnected player keeps their seat and is dealt in; their turns time out. Someone still disconnected when 3 hands in a row have started is removed before the next hand, and their chips leave with them (R-9.3). Reconnecting resets the count and immediately sends the full snapshot, including their cards and, if it's their turn, their options and the running deadline.

## 5. HTTP

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | none | `200 { ok: true, uptime, sockets, rooms }` |
| POST | `/api/session` | `{ displayName }` | See below |

**`POST /api/session` responses:**
- **`201 Ack<SessionInfo>`**: a new session was created.
- **`200 Ack<SessionInfo>`**: a valid `Authorization: Bearer <token>` was sent, so that session was renamed. The `playerId` is unchanged and the room seat is kept.
- **`400` `INVALID_PAYLOAD`**: the name failed validation, or the JSON was malformed.
- **`429` `RATE_LIMITED`**: more than 10 requests per minute from this IP.

`displayName`: 1–20 characters after trimming and collapsing spaces. Allowed: letters in any language, digits, spaces, and `_ - . '`.

---

## 6. Limits

| Limit | Value |
|---|---|
| Socket events | 20 per 5 s per socket (token bucket). After 50 consecutive rejected events the socket is disconnected. |
| `room:join` | 10 per minute per player |
| `POST /api/session` | 10 per minute per IP |
| Socket payload size | 10 KB (`maxHttpBufferSize`) |
| HTTP JSON body | 10 KB |
| Session idle expiry | 24 h (sessions with a live socket never expire) |
| Lobby disconnect grace | 60 s |
| Empty room lifetime | 10 min |
| Turn timer | room setting (15–120 s, default 30 s) |
| Pause before the next street / each run-out street | 0.8 s / 1.5 s |
| Results pause | 5 s after a showdown, 3 s after a hand won by folds |
| Disconnected in a game | removed once 3 hands in a row have started while away |
