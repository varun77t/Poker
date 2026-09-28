# Socket.IO & HTTP Contract

This is the live reference for everything the client and server exchange. The types in [`shared/src/events.ts`](../shared/src/events.ts), [`shared/src/views.ts`](../shared/src/views.ts) and [`shared/src/schemas.ts`](../shared/src/schemas.ts) are the source of truth, and this page must stay in sync with them.

**Status:** Phase 2 (sessions and rooms). Game events arrive in Phase 4.

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
- **State is pushed, not pulled.** After any change to a room, every seated player receives a `state` snapshot on their own socket.
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
| `INTERNAL` | Unexpected server error (details are logged server-side only) |
| `STALE_ACTION`, `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `INVALID_AMOUNT`, `REBUY_NOT_ALLOWED` | Reserved for game events (Phase 4+) |

---

## 3. Client → Server

| Event | Payload | Ack data | Rules |
|---|---|---|---|
| `sys:ping` | `{}` | `{ serverTime: number }` | Latency check |
| `sync:request` | `{}` | `{ roomCode: string \| null }` | Reports the player's room. If they have one, the server also re-sends `state`. The client sends this on every (re)connect. |
| `room:create` | `{ settings: RoomSettings }` | `{ code }` | Leaves any current room first. Creator takes seat 0 and is host. |
| `room:join` | `{ code: string }` (≤16 chars) | `{ code }` | See below |
| `room:leave` | `{}` | `{}` | Frees the seat now. Host passes to the next occupied seat clockwise. An empty room is deleted after 10 minutes. `NOT_IN_ROOM` if not seated. |
| `game:start` | `{}` | `{}` | Host only; status `waiting` or `finished`; ≥ 2 seated. Sets status `playing` (dealing arrives in Phase 4). |

**`room:join` rules:**
- The code is normalized: uppercased, with spaces and dashes removed.
- Joining a room you're already in is idempotent.
- The player is seated in the lowest free seat. If the room is `playing`, they are marked `waitingForNextHand`.
- Joining leaves any other room, but only after the new room is known to have space.
- **Errors:** `ROOM_NOT_FOUND`, `ROOM_FULL`, and `RATE_LIMITED` (10 joins per minute per player).

### `RoomSettings`

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
| `state` | `TableSnapshot` | After every change to the player's room, on reconnect, and on `sync:request` |
| `session:replaced` | `{}` | Just before the server disconnects this socket, because the same session connected elsewhere |

```ts
interface TableSnapshot {
  version: number;          // increases on every room change
  room: RoomView;
  game: null;               // GameView from Phase 4
}
interface RoomView {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  settings: RoomSettings;
  youId: string;            // the receiving player
  seats: (SeatView | null)[]; // always 5; null = open seat
  finalResults: null;       // Phase 6
}
interface SeatView {
  seat: number;
  playerId: string;
  displayName: string;      // "Sam (2)" when another seated player is also "Sam" (case-insensitive, by join order)
  stack: number;
  connected: boolean;       // false while the player is disconnected (lobby: seat released after 60 s)
  waitingForNextHand: boolean;
  busted: boolean;
}
```

---

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
