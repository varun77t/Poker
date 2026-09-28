# Product Specification — Private Hold'em

## 1. Summary
A web app for playing private No-Limit Texas Hold'em with friends. Someone creates a room, shares a 6-character code or an invite link, and 2–5 people play with virtual chips in real time. Empty seats can be filled with bots, so one person can also play alone. No accounts are needed: players pick a display name and play.

**Virtual chips only.** Chips have no monetary value, cannot be bought, sold, or transferred, and are never redeemable for anything.

## 2. Users & identity
- **Guest player:** enters a display name (1–20 characters, trimmed, repeated spaces collapsed; letters in any language, digits, spaces, and `_ - . '` only).
- The server issues a guest session (`playerId` + secret `sessionToken`). The browser keeps it in `localStorage`, so a refresh or a network drop does not lose your seat.
- Sessions live in server memory and expire 24 hours after last activity. If the server restarts, the client silently creates a new session. The player keeps their name but loses any seat.
- One browser profile = one player. Opening the app in a second tab takes over the session; the first tab shows "Opened in another tab".
- Display names don't need to be unique globally. If two players in the same room share a name, the later one is shown as `Name (2)`.
- *(Optional, later)* Google sign-in as another way to get a session.

## 3. Rooms

### 3.1 Room code
- 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. This excludes the easily confused `0 O 1 I L`.
- Input is case-insensitive and ignores spaces.
- Codes are unique among live rooms.
- Invite link: `https://<host>/room/<CODE>`. Opening it prompts for a name if needed, then joins.

### 3.2 Capacity & seats
- Maximum **5 seated players**, minimum **2** to start. Bots (§3.7) take seats and count toward both limits.
- Seats are numbered 0–4 around the table. A joining player takes the lowest free seat.
- There are no separate spectators in the MVP. Busted players keep their seat until they leave.
- A player can be in only one room at a time. Joining another room leaves the current one.

### 3.3 Host
- The room creator is the host.
- **Host-only controls:** change the room settings (lobby or finished screen only), add and remove bots, start the game, end the game, restart after it finishes.
- **Host migration:** if the host leaves (or is removed after disconnecting), host passes to the next occupied seat clockwise, skipping bots.

### 3.4 Room states
| State | Meaning |
|---|---|
| `waiting` | Lobby. Players can join or leave. No cards are dealt. |
| `playing` | Hands are dealt continuously. Players may still join; they are dealt in from the next hand. |
| `finished` | Game over. Results are shown. The host can restart (fresh stacks, back to `playing`) or players can leave. |

### 3.5 Room settings (chosen at creation, editable by the host until the game starts)
- The host can change any setting while the room is `waiting`, or on the finished screen before a restart. They are locked while a game is `playing`.
- Changing them in the lobby resets every seated player's chips to the new starting stack (nobody has played yet). After a finished game the new settings apply when the host restarts.
- Everyone sees the change straight away: the changed values are highlighted and a note says the host changed the settings.

| Setting | Default | Allowed |
|---|---|---|
| Starting stack | 1,000 | 100 – 1,000,000 |
| Small blind | 5 | 1 – big blind |
| Big blind | 10 | ≥ 2 and ≤ starting stack ÷ 10 |
| Turn timer | 30 s | 15 – 120 s |
| Rebuys allowed | Yes | Yes / No |

Blinds do not increase over time (no tournament structure in the MVP).

### 3.6 Room lifetime
- A room with zero players is deleted after **10 minutes**.
- All rooms are lost if the server restarts. This is an accepted MVP limitation, and players see a "Room no longer exists" message.

### 3.7 Bots (Phase 7)
- **Adding:** the host adds a bot to an open seat, choosing **Easy** or **Normal**, and can remove it again. A bot added during a game is dealt in from the next hand, like a late joiner.
- **Solo play:** bots count toward the 2-player minimum, so one person plus one bot can play. The landing page has **Play against bots**, which creates a room with default settings and 3 Normal bots, then opens the lobby so the host can adjust before starting.
- **Fair play:** a bot sees only what a player in its seat would see (never hidden cards) and follows exactly the same rules and turn order. It waits a second or two before acting, so the game feels natural.
- **Levels:**
  - **Easy** plays loosely and predictably: many hands, lots of calling, few raises.
  - **Normal** plays by hand strength and pot odds, sizes its bets sensibly, and bluffs occasionally, with enough randomness that it has no fixed pattern.
- **Never in charge:** bots are never the host. When the last human leaves, the bots are removed too.
- **Never alone:** a new hand starts only if at least one human is connected and has chips. Otherwise the table pauses.
- **Busting:** a busted bot rebuys automatically when rebuys are on. With rebuys off, it leaves the table.
- **Display:** bots are named from a fixed list (e.g. "Ace Bot") and shown with a "Bot" badge and their level.

## 4. Gameplay
- The full rules are in [game-rules.md](game-rules.md).
- **Starting:** the host presses Start when at least 2 players are seated. There is no ready-check.
- **Continuous play:** after each hand, a short results pause (~5 s) is followed by the next hand automatically.
- **Turn timer:** when it runs out, the player auto-checks if that's legal, and otherwise auto-folds.
- **Joining mid-game:** a new player waits for the current hand to finish and is dealt in next hand. They don't have to post a blind to enter.
- **Busting:** a player with 0 chips after a hand is busted.
  - **Rebuys on:** the player sees a "Rebuy for 1,000" button, usable between hands. Rebuys are unlimited.
  - **Rebuys off:** the player stays seated as a spectator until they leave.
- **Leaving mid-hand:** the player's hand is folded immediately. If they are all-in, the hand plays out without them and they are removed afterwards. Their seat stays (marked as left) until the hand's results have been shown. Coming back to the room before then gives them the seat and chips back.
- **Game end:**
  - **Rebuys off:** the game ends when only one player has chips, or when no human has chips (bots don't play on alone).
  - **Rebuys on:** if fewer than two players have chips at the start of a hand, the table pauses until someone rebuys or the host ends the game.
  - **Any time:** the host can end the game.
- **Finished screen:** each player's final stack and net result (final stack − total bought in), ranked.

## 5. Disconnection & reconnection
- **Disconnect in the lobby:** the seat is held for **60 s**, then released.
- **Disconnect during a game:**
  - The player stays seated and is marked "disconnected".
  - When it's their turn, the timer runs as normal (auto-check, else fold).
  - If they are still disconnected after **3 consecutive hands**, they are removed between hands.
- **Reconnect:** the player returns with the same session token. They get their seat, their cards, and the current table state immediately.

## 6. Screens
1. **Landing:** name field, "Create room", "Join room" (code input), "Play against bots" (Phase 7).
2. **Create room:** the settings form (§3.5) with defaults pre-filled.
3. **Lobby** (`/room/:code`, state `waiting`): code with a copy-link button, settings with an Edit button (host), player list with seat, host and bot badges, "Add bot" on open seats and "Remove" on bot seats (host), count "3/5", Start (host, enabled at ≥2), Leave.
4. **Table** (state `playing`): the table with up to 5 seats (your own seat always at the bottom), board, pots, dealer and blind markers, turn countdown, action panel, hand results.
5. **Finished:** results table, Restart (host), Leave.
6. **Error/empty states:** room not found, room full, connection lost / reconnecting, opened in another tab.

## 7. Non-functional requirements
- **Real time:** other players see an action within ~200 ms on a normal connection.
- **Desktop only:** designed for laptop and desktop screens (about 1280 px wide and up) with a mouse and keyboard. Phones and tablets are not supported.
- **Server authority:** the client never decides cards, legality, pots, turns, or winners (see `/CLAUDE.md`).
- **Fairness:** shuffles use a cryptographically secure RNG, and no hidden card data ever reaches a client.
- **Deployment:** one server instance, same origin for the web app and the socket.

## 8. Out of scope (MVP)
Real money, chip purchases, tournaments and blind levels, leaderboards, friends lists, chat, achievements, statistics, public room browser, spectator-only slots, hand-history replay UI, multiple server instances, Redis.

## 9. Decisions made in this spec (change any before Phase 1)
1. Guest names only for the MVP; Google sign-in is optional later.
2. No ready-check. The host starts the game.
3. Late joiners are dealt in next hand without posting a blind.
4. Rebuys are unlimited when enabled and only allowed at 0 chips.
5. Every hand that reaches showdown is revealed automatically (no mucking).
6. Blinds are fixed (no levels).
7. Default settings: 1,000 stack, 5/10 blinds, 30 s timer, rebuys on.
8. Room settings are editable by the host until the game starts (added after Phase 2).
9. Bots (Phase 7): added by the host, two levels (Easy, Normal), never host, never play without a connected human, auto-rebuy when rebuys are on.
10. Desktop only (decided before Phase 4): the UI targets laptop/desktop screens; no phone or tablet layout.
