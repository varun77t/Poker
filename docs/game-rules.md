# Game Rules — No-Limit Texas Hold'em (engine specification)

The engine in `server/src/engine/` must implement these rules **exactly**. Every rule has an ID (`R-x.y`); Phase 3 tests should cite the ID they cover. Where real-world rules vary, a simplification was chosen and is marked **(simplified)**.

---

## 1. Terms

| Term | Meaning |
|---|---|
| Seat | Table positions 0–4. "Clockwise" / "left of" means the next higher seat index, wrapping 4 → 0. |
| Eligible player | Seated, stack > 0 at the start of the hand, not waiting to be dealt in. Only eligible players are dealt in. |
| In-hand status | `active` (can still act), `folded`, or `allIn` (stack is 0, still contesting pots). |
| Able to act | Status `active`. Folded and all-in players never act again this hand. |
| `committed` | Chips a player has put in on the **current street** (resets to 0 each street). |
| `contributed` | Chips a player has put in during the **whole hand** (blinds included). Used for pots. |
| `betLevel` | The amount every active player must have `committed` to stay in on this street. |
| `minRaise` | The minimum raise increment: the size of the last *full* bet or raise this street. |

All amounts are **non-negative integers**. There are no fractional chips anywhere.

---

## 2. Hand setup

- **R-2.1** A hand starts only if there are ≥ 2 eligible players.
- **R-2.2** The button seat is an input to the engine. The table controller chooses it:
  - **First hand of a game:** a uniformly random eligible seat (secure RNG).
  - **Later hands:** the first eligible seat clockwise from the previous button seat. The previous seat may now be empty. **(simplified: "moving button", not "dead button")** A consequence is that a player may occasionally skip or repeat a blind after someone busts or leaves. That's acceptable for friendly play.
- **R-2.3** Blind positions with **3–5 players**: SB = first eligible seat clockwise from the button; BB = first eligible seat clockwise from the SB.
- **R-2.4** Blind positions **heads-up (2 players)**: the **button posts the small blind**, and the other player posts the big blind.
- **R-2.5** Blind posting: a player posts `min(blind, stack)`. If that uses their whole stack, they are `allIn` immediately.
- **R-2.6** After blinds, `betLevel = bigBlind` and `minRaise = bigBlind`. This holds **even if the big blind posted less** because they were short-stacked. Other players must still call the full big blind to continue.
- **R-2.7** Deal order: one card at a time to each eligible player, starting with the first eligible seat clockwise from the button, twice around. The deck is an injected ordered array. `deck[0]` is dealt first. This order is what makes fixed-deck tests predictable.

---

## 3. Streets & board

- **R-3.1** Streets are `preflop → flop → turn → river → showdown`.
- **R-3.2** Before dealing the flop, the turn, and the river, one card is burned (taken off the deck unseen). Then the flop deals 3 cards and the turn and river 1 card each.
- **R-3.3** When a street's betting round completes (§5) and ≥ 2 players are not folded, all `committed` values reset to 0. After that, `betLevel = 0`, `minRaise = bigBlind`, and every player's "has acted" flag is cleared.

---

## 4. Actions

Clients send an **intent**. The engine checks it against `getLegalActions` and rejects anything illegal with a typed error. It never "corrects" an illegal amount.

Let `toCall = min(betLevel − committed, stack)`, and `maxTo = committed + stack` (the most this player can commit this street).

| Action | Legal when | Effect |
|---|---|---|
| `fold` | It's the player's turn. (Allowed even if check is possible.) | status → `folded` |
| `check` | `committed == betLevel` | No chips move |
| `call` | `betLevel > committed` | Commits `toCall`. If that empties the stack → `allIn` |
| `bet { amount }` | `betLevel == 0` and `stack > 0` | Commit up to `amount` total this street (see R-4.2) |
| `raise { amount }` | `betLevel > 0`, raising is open to this player (R-4.5), and `maxTo > betLevel` | Commit up to `amount` total this street (see R-4.3) |
| `allIn` | `stack > 0` | Shorthand. The engine turns it into `call`, `bet`, or `raise` to `maxTo`, whichever fits. If raising is closed to the player (R-4.5), it is legal only as a call. |

- **R-4.1** **`amount` means "total commitment for this street after the action" ("raise TO"),** not the increment.
- **R-4.2** **Bet:** requires `bigBlind ≤ amount ≤ maxTo`. If `maxTo < bigBlind`, the only legal bet is `amount == maxTo` (an all-in for less).
- **R-4.3** **Raise:** requires `betLevel + minRaise ≤ amount ≤ maxTo`. If `maxTo < betLevel + minRaise`, the only legal raise is `amount == maxTo` (a short all-in raise).
- **R-4.4** **Full vs. short raise.** Let `increase = amount − betLevel` (for a bet, `betLevel` is 0).
  - If `increase ≥ minRaise`, it is a **full raise**:
    - `minRaise = increase` and `betLevel = amount`.
    - Every other `active` player's "has acted" flag is cleared (action reopens).
  - Otherwise it is a **short all-in**:
    - `betLevel = amount`, and `minRaise` is unchanged.
    - Flags are **not** cleared. Other players must still respond because they face more chips.
- **R-4.5** **Raise rights.** An `active` player may raise if either:
  - (a) they have not acted since action was last reopened, or
  - (b) `betLevel − betLevelWhenTheyLastActed ≥ minRaise`. This allows several short all-ins that together add up to a full raise.
  
  Otherwise they may only `call` or `fold`.
- **R-4.6** A player whose `stack` hits 0 becomes `allIn` and is skipped for the rest of the hand.
- **R-4.7** Actions are accepted only from the player whose turn it is. The exception is `forceFold` (§9), which is controller-only and not a client action.
- **R-4.8** **Someone must be able to respond.** A player may bet or raise only if at least one *other* player is still `active`. When everyone else is all-in or folded, the player may only check, call or fold (an extra raise could never be called). `allIn` then counts only as a call.
- **R-4.9** `amount` is required for `bet` and `raise` and must be absent for every other action. A missing, negative, non-integer or out-of-range amount is rejected as `INVALID_AMOUNT`, never adjusted.

`getLegalActions(state, playerId)` returns `null` when it's not that player's turn. Otherwise it returns:
```
{ canFold, canCheck, canCall, callAmount, canBet, canRaise, minTo, maxTo }
```
`minTo` and `maxTo` apply to whichever of bet or raise is available. The client builds its buttons and slider **only** from this object.

---

## 5. Turn order & betting-round completion

- **R-5.1** **Preflop**, first to act is the first `active` player clockwise from the **big blind**. Heads-up, that's the button (small blind).
- **R-5.2** **Postflop**, first to act is the first `active` player clockwise from the **button**. Heads-up, that's the big blind.
- **R-5.3** After each action, the turn passes to the next `active` player clockwise.
- **R-5.4** **Hand ends immediately** when only one player is not folded. They win every pot they're eligible for (§7). No cards are revealed.
- **R-5.5** A betting round is **complete** when every `active` player has acted since action last reopened **and** has `committed == betLevel`.
- **R-5.6** **Big blind option.** Posting a blind is not "acting". So if everyone calls preflop, the round isn't complete until the BB checks or raises (R-5.5 covers this automatically).
- **R-5.7** **No one left to bet against.** Suppose at most one player is `active` and their `committed` is ≥ the highest `committed` of every other non-folded player. Then the round is complete and **no further betting happens this hand**. If exactly one player is `active` but faces a larger all-in, they must still call or fold first.
- **R-5.8** **Run-out.** Once no further betting is possible (R-5.7) and ≥ 2 players are not folded:
  - All non-folded hands are revealed at once (all-in showdown).
  - The remaining board cards are dealt with no betting, then the hand goes to showdown.
  - The table controller paces the reveal. The engine just produces the final state and the events.

---

## 6. Pots

Pots are built from each player's `contributed` for the whole hand, including folded players' contributions.

- **R-6.1** **Layering.**
  - Take the distinct positive `contributed` values in ascending order: L1 < L2 < … < Lk.
  - For each layer `i`:
    - `contributors` = players with `contributed ≥ Li`.
    - The layer amount = `(Li − Li-1) × |contributors|`, with L0 = 0.
    - `eligible` = contributors whose status is not `folded`.
- **R-6.2** **Uncalled chips.** A layer with exactly **one** contributor is returned to that contributor. This happens even if they folded, because nobody matched those chips. This one rule covers both uncalled bets and the extra above a short all-in.
  - The chips go back as soon as a betting round ends (or the hand ends by folds), so stacks and pots are right during the pause before the next street.
  - A player who was all-in and gets chips back this way is no longer all-in. Nobody is left to bet against, so the hand still runs out (R-5.8).
- **R-6.3** Adjacent layers with the same `eligible` set are merged into a single pot. The result is a main pot plus zero or more side pots.
- **R-6.4** A layer with ≥ 2 contributors but **no** eligible players is impossible in normal play. It can only follow a `forceFold` (R-9.1): for example, two players who had both put in more than an all-in player both leave the table. The layer is merged into the next lower layer that has eligible players, so the chips go to that layer's winners, and the engine emits a `deadChipsMerged` event. The property test checks that it never happens without a forced fold.
- **R-6.5** **Display:** during a hand, clients get the pots computed by R-6.1–R-6.3 from chips committed on *previous* streets, plus each player's current-street `committed` shown separately.

---

## 7. Showdown & payouts

- **R-7.1** Each pot is awarded on its own, to the eligible player(s) holding the best 5-card hand made from their 2 hole cards plus the 5 board cards.
- **R-7.2** **Ties** split the pot equally with integer division. Leftover odd chips go **one at a time** to the tied winners in clockwise order, starting from the first seat clockwise from the button.
- **R-7.3** **Reveal (simplified):** at showdown, every non-folded player's hole cards are revealed. There's no mucking and no show order. Folded players' cards are **never** revealed to anyone.
- **R-7.4** When a hand is won by everyone else folding (R-5.4), the winner's cards are **not** revealed.
- **R-7.5** The hand result lists:
  - for each pot: amount, eligible players, winners, and the amount each wins;
  - for each revealed player: best 5 cards, hand category, and a readable label.
- **R-7.6** **Chip conservation:** `Σ stacks after the hand = Σ stacks before the hand`. The engine asserts this in development and tests.

---

## 8. Hand ranking

- **R-8.1** Categories, best to worst:

| # | Category | Tie-break order | Label example |
|---|---|---|---|
| 1 | Straight flush (A-high = Royal flush) | top card | `Royal Flush`, `Straight Flush, Nine high` |
| 2 | Four of a kind | quad rank, kicker | `Four of a Kind, Queens` |
| 3 | Full house | trips rank, pair rank | `Full House, Kings over Sevens` |
| 4 | Flush | all 5 cards, high to low | `Flush, Ace high` |
| 5 | Straight | top card | `Straight, Ten high` |
| 6 | Three of a kind | trips rank, 2 kickers | `Three of a Kind, Fours` |
| 7 | Two pair | high pair, low pair, kicker | `Two Pair, Aces and Nines` |
| 8 | One pair | pair rank, 3 kickers | `Pair of Jacks` |
| 9 | High card | all 5 cards, high to low | `High Card, Ace` |

- **R-8.2** Aces are high, except in the **wheel** A-2-3-4-5, which is a five-high straight (`Straight, Five high`). The same goes for the steel wheel, a five-high straight flush. There's no wrap-around: Q-K-A-2-3 is not a straight.
- **R-8.3** Suits never break ties.
- **R-8.4** The best hand is the best 5 of the 7 available cards. When the board itself is the best hand for everyone, all eligible players tie.
- **R-8.5** Only the best 5 cards count. A sixth or seventh card never breaks a tie.

---

## 9. Players leaving, timing out, disconnecting

- **R-9.1** **`forceFold(playerId)`** (controller-only):
  - If the player is `active`, they become `folded` immediately, even if it isn't their turn. If it was their turn, the turn advances.
  - If the player is `allIn`, nothing changes: their chips stay in and they remain eligible.
  - The controller removes the player from their seat after the hand ends.
- **R-9.2** **Turn timeout** (controller): if `canCheck`, apply `check`; otherwise apply `fold`. This applies whether the player is connected or not.
- **R-9.3** A disconnected player who has not reconnected after 3 consecutive hands is removed between hands. Their remaining chips leave with them.

---

## 10. Between hands

- **R-10.1** A player with `stack == 0` after a hand is **busted** and is not eligible for the next hand.
- **R-10.2** **Rebuy:** if the room allows rebuys, a busted player may rebuy between hands. Their stack becomes the starting stack and they are eligible for the next hand.
- **R-10.3** Players who joined during a hand become eligible at the next hand start.
- **R-10.4** **Game end:**
  - With rebuys off, the game ends when fewer than 2 players have chips.
  - With rebuys on, the table waits instead (no hand is dealt) until ≥ 2 players have chips or the host ends the game.

---

## 11. Required test scenarios (Phase 3)

| Scenario | Rules |
|---|---|
| Hand rankings, including wheel, steel wheel, and no wrap-around | R-8.1 – R-8.5 |
| Kicker comparisons; board plays → split | R-8.4, R-8.5, R-7.2 |
| Heads-up: blinds, preflop order, postflop order | R-2.4, R-5.1, R-5.2 |
| 3- and 5-player blind positions and first-to-act | R-2.3, R-5.1, R-5.2 |
| Button rotation over hands, including after a bust and after a player leaves | R-2.2 |
| BB option: limp to BB → BB checks (flop dealt) / BB raises (action reopens) | R-5.6 |
| Min bet and min raise; re-raise size tracking | R-4.2 – R-4.4 |
| Short all-in does not reopen action; two short all-ins that together make a full raise do reopen it | R-4.4, R-4.5 |
| Uncalled bet returned | R-6.2 |
| Everyone folds to one player; no reveal | R-5.4, R-7.4 |
| Short-stacked BB all-in: others still call the full BB | R-2.5, R-2.6 |
| All-in preflop → run-out → showdown | R-5.7, R-5.8 |
| 3-way all-in, three different stacks → main + 2 side pots | R-6.1 – R-6.3 |
| Folded player's chips go into the correct pots | R-6.1 |
| Split pot with an odd chip | R-7.2 |
| `forceFold` on and off turn; forceFold on an all-in player | R-9.1 |
| Illegal actions: wrong turn, check facing a bet, raise below min, raise when closed, amount > stack, negative/non-integer amount | R-4.x |
| Facing an all-in with nobody else left: call or fold only | R-4.8 |
| **Property:** random stacks (2–5 players) and random legal actions → chips conserved, no negative stack, hand always terminates, R-6.4 never triggers | R-7.6 |
