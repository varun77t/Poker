# Poker App — Rules for Every Session

Private multiplayer Texas Hold'em. 2–5 players per room, 6-character room codes, virtual chips only (no cash value, never purchasable).

Full phase plan: `docs/build-plan.md`. Poker rules source of truth: `docs/game-rules.md` (rule IDs `R-x.y`; cite them in tests). Product behavior: `docs/product-spec.md`. Structure, events, state shapes: `docs/architecture.md`.
Implement ONE phase at a time. Do not start the next phase until the current one's tests pass.

## Stack
- TypeScript everywhere. npm workspaces monorepo: `shared/`, `server/`, `client/`.
- Client: React + Vite + CSS Modules (no Tailwind, no shadcn).
- Server: Node + Express + Socket.IO (typed events from `shared/`).
- Validation: zod schemas in `shared/` for every client→server payload.
- Tests: Vitest (+ fast-check for property tests), Playwright for E2E.
- Postgres + Drizzle only in the optional persistence phase. Active game state lives in server memory.

## Critical architecture rule
```
React client --(socket action + handId + seq)--> server
  -> rate limit -> zod schema -> session/room membership -> engine.applyAction
  -> table controller updates state -> emits toGameView(state, playerId) to each player's own socket
```

The client NEVER decides: cards, winners, pots, legal actions, bet sizes, turns, chip counts, game phase. React only renders server state and sends intents.

## Never trust the client
- Player identity comes ONLY from the session token in the Socket.IO handshake (`socket.data.playerId`). Ignore any playerId/name/roomCode identity fields in event payloads except as lookup input that is then verified.
- Never use `socket.id` as player identity (it changes on reconnect).
- Every outbound game state goes through `toGameView()` in `server/src/engine/view.ts`. Never emit the raw engine state. Other players' hole cards are only included once revealed (showdown R-7.3, or all-in run-out R-5.8 in `docs/game-rules.md`); folded hands never.
- Every snapshot carries a room `version` (clients drop older snapshots). Game actions carry `handId` + `seq` from the snapshot they were based on; the server rejects mismatches as `STALE_ACTION` (double-clicks, replays, delayed packets).

## Engine rules
- The engine (`server/src/engine/`) is pure: no timers, no I/O, no Socket.IO, no Math.random. Deck/RNG is injected.
- Shuffle: Fisher–Yates with `crypto.randomInt` (never `sort(() => Math.random() - 0.5)`).
- Chips are integers. `bet`/`raise` amounts mean "raise TO this total for the street", not "raise BY".
- Invariant: total chips (stacks + pots + current bets) never changes within a hand.
- Timers, pacing delays, and reconnection windows live in `server/src/table/tableController.ts`, not the engine.

## Workflow
- Commit at the end of each phase; tag it `phase-N`.
- Keep `docs/socket-events.md` updated whenever an event changes.
