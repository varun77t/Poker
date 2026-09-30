# Security & Multiplayer Audit (Phase 9)

**Scope:** the Socket.IO server, the HTTP session endpoint, and what the browser receives.
**Threat model:** a player who opens DevTools and sends hand-made messages (`socket.emit`), replays old ones, floods the server, or reads every payload the server sends them.
**Method:** every attack below is a test in `server/test/security.test.ts`. Each one runs against a real in-process server through a real `socket.io-client`, with no help from the React app. The earlier suites (`sessionsAndRooms`, `gameSync`, `botSync` and the engine/view tests) cover the same ground from other angles. Playwright end-to-end tests (`e2e/`) then play real games in Chromium against the production build.

**Result:**
- All 17 attacks are refused.
- Two weaknesses were found and fixed (see *Fixes*).
- Two risks remain for Phase 10 (see *Residual risks*).

## How the server defends itself

Every client→server event goes through one pipeline (`server/src/socket/guard.ts`):

1. **Rate limit per player.** 20 events per 5 s (token bucket). `room:join` is 10 a minute and `room:create` is 5 a minute. After 50 refused events in a row the socket is disconnected.
2. **Ack required.** An event without an ack callback is dropped.
3. **Strict zod schema** (`shared/src/schemas.ts`). Objects are strict: any unknown key, such as a spoofed `playerId`, is rejected. Numbers must be integers in range.
4. **Identity from the session only.** `socket.data.playerId` is pinned at the handshake from the session token. No payload field is ever treated as identity.
5. **Authorization.** The server checks room membership, the host for host-only actions, and the room status.
6. **The pure engine decides legality.** It checks whose turn it is, the legal actions and the bet bounds. Actions carry `handId` + `seq`, so anything stale is refused.
7. **Errors.** Errors go back in the ack. Anything unexpected is logged and reported only as `INTERNAL`, never with a stack trace.

What leaves the server:
- Every outbound game state is built by `toGameView(state, viewerId)` (`server/src/engine/view.ts`), once per viewer.
- Other players' hole cards are included only when no more betting can happen: at showdown (R-7.3) or in an all-in run-out (R-5.8). Folded hands are never included.
- The deck is never included.

Transport:
- Socket.IO `maxHttpBufferSize` is 10 kB.
- HTTP JSON bodies are capped at 10 kB.

## Attacks tried

| # | Attack | How it is stopped | Result |
|---|---|---|---|
| S1 | Act for another player; act out of turn | Identity comes from the session, so Bob's action is Bob's. On Alice's turn he gets `NOT_YOUR_TURN`. A `playerId` or `seat` in the payload is `INVALID_PAYLOAD`. The hand is unchanged. | Refused |
| S2 | Spoof identity fields on any event or over HTTP | Strict schemas reject `playerId`, `hostId`, `displayName`, `roomCode` and similar on all 11 event types. `POST /api/session` with a `playerId` is a 400. | Refused |
| S3 | Connect with no, guessed, malformed or oversized session token | The handshake middleware refuses every one with `AUTH_INVALID` before any handler exists. Tokens are 256-bit random values. | Refused |
| S4 | Act for a bot's seat | Bots are server-side players with no session or socket. On a bot's turn every human action is `NOT_YOUR_TURN`, and naming the bot is `INVALID_PAYLOAD`. | Refused |
| S5 | Negative, fractional, string, null, boolean, array, object, NaN, Infinity and huge amounts; wrong action types | Malformed amounts are refused by the schema (`INVALID_PAYLOAD`). NaN and Infinity arrive as `null` over JSON. Well-formed but illegal amounts (below the minimum raise, above your stack, 1e9) are `INVALID_AMOUNT`, and a bet when there is already a bet, or a check facing one, is `ILLEGAL_ACTION`. Nothing moves. | Refused |
| S6 | Replay or duplicate an action (double click, delayed packet, made-up seq/hand) | Every action carries the `handId` + `seq` it was based on. Of two identical in-flight actions exactly one lands, and every other copy is `STALE_ACTION`. | Refused |
| S7 | Act after folding, after leaving, or from a connection replaced by a second tab | A folded player has no turn. After leaving, the player gets `NOT_IN_ROOM`. A replaced connection is told (`session:replaced`) and disconnected by the server, so it can send nothing more. | Refused |
| S8 | Change chips from the client | No event sets chips, and made-up events have no handler and no effect. A raise above your stack is `INVALID_AMOUNT`, since the bounds come from the server's count. A rebuy while holding chips is `REBUY_NOT_ALLOWED`. | Refused |
| S9 | Read others' hole cards or secrets by inspecting every payload | Across 9 hands with folds, showdowns and all-in run-outs, every event each player received was recorded and checked. Only `state` and `session:replaced` are ever sent. No session token appears in any payload, not even your own. Another player's cards appear only once betting is closed, folded hands never, and the deck never. | No leak |
| S10 | Invalid room codes (empty, short, long, symbols, ambiguous letters, markup, paths, wrong types, 17+ characters) | Codes are normalized and checked against the 6-character alphabet: `ROOM_NOT_FOUND` for bad strings, `INVALID_PAYLOAD` for wrong types or length. A real code works however it is typed (lower case, spaces, dash). | Refused |
| S11 | Brute-force room codes | `room:join` is limited to 10 a minute per player, and reconnecting does not reset it. The code space is 31⁶ ≈ 887 million. | Rate limited |
| S12 | Join a full room | `ROOM_FULL`; the table is unchanged. | Refused |
| S13 | A non-host starts the game, changes settings, adds or removes bots, or ends the game | `NOT_HOST` for each. Even the host cannot change settings mid-game (`INVALID_STATE`). | Refused |
| S14 | Flood events, then reconnect to reset the limit | Rate limited per player, and the allowance is kept across reconnects (fixed in this phase). Sustained flooding disconnects the socket. | Rate limited |
| S15 | Create rooms over and over | `room:create` is limited to 5 a minute per player (added in this phase). | Rate limited |
| S16 | Oversized payloads | A 20 kB socket message makes the transport close that connection; everyone else is unaffected. A 20 kB HTTP body gets 413. | Refused |
| S17 | Disconnect on your turn to stall the table | The turn timer runs server-side. An absent player's turn checks if it can, otherwise folds, on time (R-9.2), and play moves on. After 3 missed hands in a row the seat is released (R-9.3). | Handled |

## Fixes made in this phase

1. **The event rate limit reset on every reconnect.** The token bucket was keyed by socket id and deleted on disconnect, so a flooder could reconnect to get a fresh allowance. It is now keyed by player and kept across reconnects (idle buckets are still swept). Test: S14.
2. **Room creation was only limited by the general event limit.** Each `room:create` leaves the previous room, and an empty room lives for 10 minutes, so a script could leave thousands of empty rooms in memory. `room:create` is now limited to 5 a minute per player. Test: S15.

## End-to-end tests (Playwright)

`npm run e2e` builds the app, starts the production server on port 4173, and runs Chromium at a 1536×700 laptop window:

- **Friends** (`e2e/tests/friends.spec.ts`, three browser contexts):
  - Alice creates a room; Bob and Carol join from the invite link.
  - Each player sees only their own cards face up.
  - They play three hands.
  - Carol's tab closes: the others see her as Away and play continues.
  - Carol comes back in a new tab with the same seat, and play carries on with her.
- **Solo** (`e2e/tests/solo.spec.ts`):
  - "Play against bots" seats three Medium bots.
  - The player answers with the **C** key while the bots act on their own.
  - After three hands the host ends the game and the final standings appear.

## Residual risks (for Phase 10)

- **Per-network limits need the real client address.** `POST /api/session` is limited to 10 a minute per IP. Behind a hosting proxy every visitor would share the proxy's address, so production must set Express `trust proxy` for `req.ip` to be the visitor. Once it is set, a per-IP limit on `room:join` should be added too. Without one, a patient attacker could make many guest sessions over hours and multiply their room-code guesses. Even then, a correct guess only seats them visibly in a friends' lobby, where everyone can see them.
- **Transport security and headers.** Locally the app runs over plain HTTP. In production the platform's HTTPS, plus secure headers (helmet), must be in place (Phase 10).

Not risks for this app:
- **Session tokens** are kept in `localStorage`, which only matters if a script could be injected. Display names are restricted to letters, numbers, spaces and `_ - . '`, and React escapes all text.
- **Game state is held in one server's memory**, by design. A restart ends live games (documented for Phase 10).

## Commands run

- `npm run typecheck`: shared, server, client and e2e.
- `npm run lint`
- `npm run test`: unit, property and integration tests, including `security.test.ts`.
- `npm run build`
- `npm run e2e`
