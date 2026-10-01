# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
A small private group of friends (2-5 players) playing No-Limit Texas Hold'em together from different places. Each player is on their own laptop or desktop, usually talking to the others on a voice or video call while they play. Sessions are social and run for an hour or more: the table screen is where they spend nearly all of that time.

## Product Purpose
Private Hold'em lets one friend create a room, share a 6-character code or invite link, and play real-time poker with virtual chips. Success is a game that feels like sitting at a real table with friends: everyone always knows whose turn it is, what a call costs and who won, and nobody waits on the software. Empty seats can be filled with bots (Phase 7) so one person can also play alone.

## Positioning
A private table for one group of friends, not a poker site: no accounts, no lobby of strangers, no real money, no ads, no statistics. The server is authoritative and hides every card a player may not see, so friends can trust it even when a player is on the same call.

## Operating Context
- Played mostly on laptops and desktop monitors; the owner's screen is a 14 inch laptop (browser window about 1536 x 700), and the table must fit such a window without scrolling. Friends also play on phones, upright or sideways, so every screen adapts to the window: the in-game table fits a phone screen without scrolling too.
- Mouse and keyboard. Players talk over a separate voice call, so the app has no chat.
- Turn timer (15-120 s, default 30 s), short pauses between streets, about 5 s to show each hand's result, then the next hand starts on its own.

## Capabilities and Constraints
- Rooms of 2-5 seats, host starts the game, late joiners are dealt in next hand, players can leave mid-hand, disconnected players keep their seat and time out.
- Fixed blinds; optional unlimited rebuys at 0 chips (Phase 6); bots at three levels, Easy, Medium and Pro (Phase 7); a hand hint shows each player what their own cards make.
- The client never decides anything about the game: it renders server snapshots and sends intents. Every button and bet-size bound comes from the server's legal actions.
- Stack: React + Vite + CSS Modules (no Tailwind, no component library), TypeScript monorepo.

## Brand Commitments
- Name: Private Hold'em.
- Virtual chips only. Chips have no cash value and can never be bought, so nothing may look or read like real-money gambling (no deposit, cash, jackpot or "win big" language).
- Direction confirmed with the owner (after reviewing mock tables): a real card-room table with warmth and presence, taken from a casino table look but with glow and neon removed, combined with lively, purposeful motion (dealt cards, chips moving to the pot and to the winner). Card dealing should be quick and calm, not spinning or slow. Chips are classic flat poker chips with edge stripes. Unclear state and cramped, stat-heavy layouts are explicitly unwanted.

## Evidence on Hand
No logo, photography or brand artwork exists yet. The owner chose the colours, Dark Green #132A13 and Cornsilk #FAF4D3, and the fonts, Josefin Sans and Nunito Sans, used across every screen (Phase 8). There are no testimonials, statistics or customers, and none should be invented.

## Product Principles
1. The state of the hand is always legible at a glance: whose turn, what it costs, what is in the pot, who won.
2. Nothing waits on the interface: one click per action, motion that explains what happened and then gets out of the way.
3. It should feel like a table among friends, not a casino and not a trading terminal.
4. The server decides; the screen only shows what the server says and never leaks hidden cards.

## Accessibility & Inclusion
Readable at arm's length on a laptop: large card faces and numbers, strong contrast for turn and action state, colour never the only signal (suits also differ by symbol, the active player also has a timer and label). Respect reduced-motion preferences.
