---
name: Private Hold'em
description: A card-room table among friends, where the state of the hand is always the brightest thing on screen.
colors:
  room: "#1f0d12"
  room-lift: "#2b1219"
  felt: "#1c6445"
  felt-lit: "#22744f"
  felt-edge: "#124530"
  felt-ink: "rgb(236 226 200 / 0.16)"
  felt-label: "rgb(8 26 17 / 0.62)"
  rail: "#3a1c14"
  rail-lit: "#57301f"
  rail-shade: "#2a130d"
  brass: "#d2a54c"
  brass-lit: "#e7c16e"
  brass-hover: "#dfb35a"
  brass-trim: "#a88444"
  brass-ink: "#2a1407"
  paper: "#f7f2e7"
  ink: "#f3ecdf"
  ink-muted: "#c5b49c"
  ink-faint: "#8e7b67"
  suit-red: "#c62f3b"
  suit-black: "#1b1b1f"
  card-back: "#7b1d2a"
  plaque: "#24110f"
  plaque-turn: "#33190f"
  plaque-edge: "#4a2a1d"
  avatar: "#5a2e22"
  button: "#33191a"
  button-hover: "#43211f"
  field: "#1a0b0c"
  fold-ink: "#f0b7b3"
  danger: "#e0645f"
  win: "#7fcf9c"
  chip-red: "#c62f3b"
  chip-blue: "#2f5fb3"
  chip-black: "#26262b"
  chip-green: "#1f8a56"
  chip-stripe: "rgb(255 255 255 / 0.85)"
  chip-inlay: "rgb(255 255 255 / 0.35)"
typography:
  display:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "clamp(22px, calc(var(--table-w) * 0.026), 30px)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  felt-lettering:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "calc(var(--table-w) * 0.026)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.32em"
  body:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.35
    fontFeature: "tnum"
  body-strong:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "tnum"
  figure:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    fontFeature: "tnum"
  action:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  hand:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.15
    fontFeature: "tnum"
  label:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    fontFeature: "tnum"
  tag:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.04em"
  notice:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.02em"
  card-rank:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "36cqw"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  pill: "999px"
  panel: "16px"
  button: "10px"
  control: "8px"
  preset: "7px"
  code: "6px"
  card: "11% / 7.86%"
spacing:
  gutter: "24px"
  header: "52px"
  panel-pad: "12px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "20px"
  side-column: "400px"
components:
  button-action:
    backgroundColor: "{colors.button}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    height: "48px"
  button-action-hover:
    backgroundColor: "{colors.button-hover}"
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.brass-hover}"
  button-fold:
    backgroundColor: "{colors.button}"
    textColor: "{colors.fold-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.fold-ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
  chip-preset:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.preset}"
    height: "30px"
  input-amount:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    width: "86px"
    height: "34px"
  action-panel:
    backgroundColor: "rgb(24 10 12 / 0.92)"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-pad}"
    width: "344px"
  next-game-panel:
    backgroundColor: "rgb(24 10 12 / 0.92)"
    rounded: "{rounded.panel}"
    padding: "14px"
    width: "{spacing.side-column}"
  seat-plaque:
    backgroundColor: "{colors.plaque}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "7px 16px 7px 7px"
  seat-plaque-turn:
    backgroundColor: "{colors.plaque-turn}"
  seat-tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.room}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  seat-tag-quiet:
    backgroundColor: "{colors.plaque-edge}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  bar-notice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.room}"
    typography: "{typography.notice}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  standings-plaque:
    backgroundColor: "{colors.plaque}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "7px 20px 7px 10px"
    width: "{spacing.side-column}"
  standings-plaque-top:
    backgroundColor: "{colors.plaque-turn}"
  standings-net:
    textColor: "{colors.ink-muted}"
    typography: "{typography.action}"
  standings-net-up:
    textColor: "{colors.win}"
  standings-net-down:
    textColor: "{colors.fold-ink}"
  bot-mark:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "0 7px"
  open-seat:
    backgroundColor: "rgb(36 17 15 / 0.72)"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "58px"
  bot-panel:
    backgroundColor: "rgb(24 10 12 / 0.96)"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-pad}"
    width: "268px"
  bot-remove:
    backgroundColor: "{colors.plaque}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.preset}"
    padding: "2px 10px"
  bot-level:
    backgroundColor: "{colors.button}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "0 14px"
    height: "44px"
  hand-hint:
    backgroundColor: "rgb(24 10 12 / 0.92)"
    textColor: "{colors.ink}"
    typography: "{typography.hand}"
    rounded: "{rounded.panel}"
    padding: "12px 12px 10px"
    width: "188px"
  hand-hint-rung:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "0 8px"
    height: "19px"
  hand-hint-rung-lit:
    backgroundColor: "{colors.plaque-turn}"
    textColor: "{colors.ink}"
    rounded: "6px"
  pot-label:
    backgroundColor: "{colors.felt-label}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  result-plate:
    backgroundColor: "{colors.felt-label}"
    textColor: "{colors.paper}"
    typography: "{typography.display}"
    rounded: "{rounded.panel}"
    padding: "8px 22px 10px"
---

# Design System: Private Hold'em

## Overview

**Creative North Star: "The Table Is the Room"**

A real card-room table seen from your own chair. A deep wine room recedes into shadow, a padded mahogany rail carries a single brass trim line, and the green felt is lit from above so the centre of the table, where the board and pot sit, is the brightest thing on screen. Everything the player needs (whose turn, what a call costs, what is in the pot, who won) lives on or around the felt, not in sidebars.

The world is warm, calm, and physical. Cards are cream paper with authored suit shapes, chips are flat striped discs, name plaques are dark leather pills. Motion is the table's own: cards slide from the dealer spot and turn over, chips slide to a bet, sweep into the pot when a street closes, and fly to the winner. It explains what happened and then stops. The owner confirmed two rejections: the online-casino look (glow, neon, stat sidebars, chip clutter) and the flat grey software table.

Density is low and sized for arm's length on a laptop: 16px is the smallest routine text, cards scale with the table, and the whole screen fits a 1280x680 window with no scrolling.

**Key Characteristics:**
- One accent, brass, and it always means "now": the turn, the primary action, the winning cards.
- Depth comes from light and material (lit felt, graded rail, soft drop shadows), never from glow.
- Marcellus is lettering on the felt and in results; Barlow Semi Condensed with tabular figures carries every name and number.
- Pills and ovals for things that sit on the table; modest rounded rectangles for controls you press.
- Motion is physical and quick, and disappears entirely under reduced motion.

**Scope.** Two screens use this world today: the in-game table and the finished-game screen. The landing, create-room, lobby and room screens still carry an early placeholder style (green/gold tokens in `src/styles/global.css`) that is not this system; they are due to be restyled to match it in the polish phase. The tokens live in `src/styles/cardRoom.module.css` on its `.world` class (which both in-game screens put on their root), together with the shared controls (action, primary, ghost and danger buttons, and the bar error line). They are scoped to `.world` rather than `:root` so the world stays self-contained until the other screens move over.

## Colors

A dim wine-and-mahogany room around a lit green felt, with cream paper and a single brass accent.

### Primary
- **Card-Room Brass** (brass): The one accent. The turn plaque's border and draining timer ring, the primary action button, the lift ring around winning cards, the winning hand line under a result, the game winner's seat edge, standings plaque and rank numeral on the finished screen, the "hurry" status, focus outlines, text selection and the range slider. Its lighter sibling **Brass Highlight** (brass-lit) is only the primary button's border; **Brass Hover** (brass-hover) is only its hover fill; **Dark Umber** (brass-ink) is the text set on brass.
- **Rail Trim Brass** (brass-trim): A duller brass that is decoration, not signal: the single trim line inside the rail and the hover border on quiet controls. It never marks state.

### Secondary
- **Lamp-Lit Felt** (felt, felt-lit, felt-edge): The playing surface, always a radial light pool (felt-lit at the centre, felt at 45%, felt-edge at the rim). **Felt Shade** (felt-label) is a translucent dark green used for plates that sit on the felt: pot labels, the result plate, the waiting plate. **Printed Felt Ink** (felt-ink) is the faint cream of lettering printed into the cloth.

### Tertiary
- **Card Suits and Chips**: **Suit Red** (suit-red) and **Suit Black** (suit-black) on cream card faces; **Burgundy Card Back** (card-back) under a faint brass crosshatch. Chips come in four flat colours, **Chip Red**, **Chip Blue**, **Chip Black**, **Chip Green**, each with a white dashed edge stripe (**Chip Stripe**, chip-stripe) and a fainter inner ring (**Chip Inlay**, chip-inlay), which also draws the dashed ring on a bot's avatar disc; stacks are built from these by amount, never as free decoration.

### Neutral
- **Wine Room** (room, room-lift): The backdrop, a radial gradient from room-lift at the centre to room at 70%. Also the text colour on paper-coloured tags and the dealer button.
- **Mahogany Rail** (rail, rail-lit, rail-shade): The padded rail, graded top to bottom (rail-lit, rail at 40%, rail-shade).
- **Leather Plaque** (plaque, plaque-turn, plaque-edge, avatar): Name plaques and their hairline edges; plaque-edge is also the standard 1px border for every control and panel. plaque-turn is the slightly warmer plaque of the player to act. avatar fills the initial disc.
- **Oxblood Controls** (button, button-hover, field): Fill of action buttons and their hover; field is the sunken fill of the amount input.
- **Cream Paper** (paper): Card faces, seat tags, the dealer button, and result headlines.
- **Parchment Ink** (ink, ink-muted, ink-faint): Primary text, secondary text (stacks, labels, meta), and the faintest tier.
- **Signal colours**: **Fold Blush** (fold-ink) for the Fold button, destructive text, and a player's net loss on the final standings. **Danger** (danger) for errors and the border of danger buttons (Leave table, End game). **Payout Green** (win) for chips gained: the floating "+amount" as winnings land and a player's net gain on the final standings.

### Named Rules
**The Brass Means Now Rule.** Brass (brass) marks the one thing that is live right now: whose turn, the action you can take, the cards that won, and at game end the player who won. Statuses (All-in, Last hand, Out of chips) are never brass. When nothing is actionable, even the primary button's ghost drops to neutral oxblood. Decorative brass uses brass-trim, never brass.

**The Lit Centre Rule.** The felt is the brightest large surface and the board sits in its light pool. The room and rail stay darker than the felt; nothing outside the table may out-shine it.

**The Signed Net Rule.** Payout green (win) and fold blush (fold-ink) are the only up and down colours, and they only ever colour a signed figure: "+1,240" in win, "−550" in fold-ink, "Even" in ink-muted. The sign carries the meaning; the colour repeats it. Neither colour fills a surface or marks anything that is not a chip change.

## Typography

**Display Font:** Marcellus (with Georgia, serif)
**Body Font:** Barlow Semi Condensed 500/600/700 (with system-ui, sans-serif)

**Character:** Marcellus is engraved, gently flared lettering, like a name printed into felt or a brass plate; Barlow Semi Condensed is a compact, plain working face whose tabular figures keep stacks, bets and pots aligned as they change.

### Hierarchy
- **Display** (Marcellus 400, clamp(22px, 2.6% of table width, 30px), 1.15): The showdown result ("You win 280"), in cream paper on a felt plate.
- **Headline** (Marcellus 400, 24px, 1.2): Table-level status plates such as "Waiting for players", and the "Final standings" heading of the finished screen.
- **Title** (Marcellus 400, 19px, 1, 0.02em): The product name in the header.
- **Felt Lettering** (Marcellus 400, 2.6% of table width, 0.32em, uppercase): The name printed into the felt, in felt-ink; it fades away while a result or waiting plate is shown.
- **Body** (Barlow 500, 16px, 1.35, tabular figures): Default for the page; stacks, meta, status lines.
- **Body Strong** (Barlow 600, 16px): Player names, bet amounts, the room code, ghost buttons.
- **Action** (Barlow 700, 18px, 1.1): Action button labels; the amount sits under it at 13px/600. Also the signed net on a standings plaque (line height 1).
- **Hand** (Barlow 700, 20px, 1.15): The one strong line of the hand hint, the kind of hand you hold ("Full House"); its detail ("Kings over Sevens") sits under it at 600 16px in ink-muted.
- **Label** (Barlow 600, 14px): Bet presets, the host's bot Remove control, the "Add a bot" line on an open seat, and the rungs of the hand hint's ladder (on a 19px row).
- **Tag** (Barlow 700, 13px, 0.04em): State tags on plaques (All-in, Away, Left, Out of chips, blind, last action), and the outlined bot mark ("Easy bot", "Medium bot", "Pro bot") in a name row.
- **Notice** (Barlow 700, 14px, 1.2, 0.02em): The header's status pill ("Last hand").
- **Card Rank** (Barlow 700, 36% of card width, 1, -0.02em): Card indices, scaled with the card via container units.

### Named Rules
**The Tabular Rule.** Every number on the table uses tabular figures (set once on the page root). Numbers that jump width as chips move are a defect.

**The Lettering Rule.** Marcellus is for things a card room would letter or engrave: the felt, the result, the room's name, a table-level heading such as "Final standings", and the initial on an avatar disc. It never sets names, numbers, buttons or controls.

## Layout

A single fixed, non-scrolling stage. A 52px header strip (24px side gutters, 20px gaps) carries the name, room code, hand number, blinds and Leave table. Below it the oval table is centred and scales with the window: its width is the smallest of (viewport width minus 360px), (viewport height minus 256px) times 2.05, and 1320px, and its height is width / 2.05. Card width is 6.6% of table width, so the whole table, cards and board scale together from a 1280x680 laptop window up to large monitors.

Your seat is always bottom centre, your two cards large (1.3 card widths) and overlapping the rail and your plaque; other seats sit clockwise at left, top-left, top-right and right, their cards at 0.62 card widths. The board of five sits in the felt centre, with the pot or result plate always just above it. The action panel is docked bottom-right, 344px wide, 24px from the edge; opposite it, the hand hint is docked bottom-left (24px from the left, 20px from the bottom, 188px wide) while you hold live cards. Bets sit on the felt in front of each seat (the side seats' at 21% and 79% of table width, far enough in that a wide plaque, with a long name or a bot mark, clears its bet chip and tag); the dealer button travels between seats. Seats size to their content (max-content), so a seat near the table's edge is never squeezed by its position.

The finished-game screen keeps the same 52px header and splits the stage below it into two columns 24px apart: the resting table on the left, centred in its area (width the smallest of (viewport width minus 622px), (viewport height minus 256px) times 2.05, and 1100px, still at 2.05 : 1), and a 400px column on the right. The column stacks, 22px apart, the "Final standings" heading with its ranked plaques 8px apart, and straight beneath them the next-game panel. Changing settings swaps the panel for the settings form in the same column.

Spacing is small-step and tight: 6, 8 and 10px inside controls and stacks, 12px panel padding, 20-24px at the page frame. Desktop only; there are no mobile breakpoints.

## Elevation & Depth

Depth is physical light and material, not glow. The room is a radial gradient, the rail a vertical gradient with a faint top highlight, and the felt a radial light pool with an inset brass trim line and an inset shadow under the rail. Objects that sit on the table cast short, soft, dark drop shadows; floating UI (the action panel) casts a longer one. Brass never glows; the one ring around winning cards is a hard 2.5px outline plus an ordinary drop shadow.

### Shadow Vocabulary
- **Table Drop** (`box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.7), inset 0 2px 0 rgb(255 255 255 / 0.08)`): The table on the floor, with the rail's top highlight.
- **Felt Well** (`box-shadow: inset 0 0 0 2px var(--brass-soft), inset 0 10px 30px rgb(0 0 0 / 0.35)`): The felt inside the rail: brass trim line plus rail shade.
- **Panel Float** (`box-shadow: 0 20px 40px -12px rgb(0 0 0 / 0.7)`): The docked action panel, the hand hint, the next-game panel and the host's bot panels.
- **Plaque Rest** (`box-shadow: 0 8px 18px -6px rgb(0 0 0 / 0.6)`): Name plaques on the rail.
- **Card Rest** (`box-shadow: 0 2px 4px rgb(0 0 0 / 0.35)`): Cards and the dealer button lying on felt.
- **Card Lift** (`box-shadow: 0 0 0 2.5px var(--brass), 0 8px 16px rgb(0 0 0 / 0.4)` with an 8px rise): Winning cards at showdown.
- **Chip Edge** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.45)`): Each chip in a stack.
- **Brass Sheen** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.35)`): Only on the live primary button.

### Named Rules
**The No-Glow Rule.** Shadows are dark and fall downward. No coloured blurs, halos or neon, on brass or anything else.

## Shapes

Things that belong to the table are round: the oval table and felt, pill plaques, pill pot labels and tags, circular chips, the avatar disc and the dealer button (fully rounded, 999px or 50%). Things you press are modest rounded rectangles: action buttons (10px), inputs and ghost buttons (8px), presets and the bot Remove control (7px), the room code (6px). Floating plates, the action panel and the hand hint use 16px; the band behind the hand hint's lit rung uses 6px. Cards keep true playing-card proportions (5:7) with corners of 11% of their width. Borders are hairlines (1-1.5px) in plaque-edge; dashed borders mean "empty" (open seats, empty board slots) and the white dashed ring on chips is the chip's own edge stripe. The one deliberate exception is a bot's avatar disc: a fainter 1.5px dashed ring in chip-inlay, inset 3px, that reads as a chip's edge stripe (a chip at the table, not a face), never as an empty place.

## Components

### Buttons
Solid, pressable, and quiet until they are the move.
- **Shape:** Gently rounded rectangles (10px), 48px tall, in a three-column row (Fold, Call/Check, Raise) sized 1 : 1.2 : 1.3.
- **Action:** Oxblood fill (button), parchment text (ink), 1px plaque-edge border, 700 18px label with a 13px amount beneath.
- **Primary:** Brass fill, dark umber text, brass-lit border and a thin top sheen. Exactly one per turn, the recommended action.
- **Fold:** The action style with fold-ink text.
- **Hover / Active / Disabled:** Hover lightens the fill (button-hover, brass-hover over 150ms); press nudges down 1px (90ms); disabled at 40% opacity. When it is not your turn the row stays in place as a 30% ghost with the primary reverted to neutral.
- **Ghost / Danger (header):** Transparent, 8px radius, 7px 14px padding, plaque-edge border and ink-muted text; hover moves the border to brass-trim and the text to ink. The danger variant uses a translucent danger border (danger at 50%) and fold-ink text, with a faint danger wash (12%) on hover. Danger is only the confirming button of a destructive inline confirm (Leave, End game); the button that opens the confirm stays ghost.
- **Outside the turn row:** The same action and primary styles serve single moves elsewhere: the busted player's full-width brass "Rebuy for 1,000", and the finished screen's brass "Start next game" beside a ghost "Change settings" (1fr : auto). Each is the one live move on its screen, so it takes brass.

### Chips (bet presets)
- **Style:** Transparent, 30px tall, 7px radius, plaque-edge border, 600 14px ink-muted text, in an evenly divided row (Min, 1/2 pot, Pot, All-in).
- **State:** Hover as the ghost button (brass-trim border, ink text).

### Cards / Containers
- **Action Panel:** 16px corners, near-opaque oxblood (rgb(24 10 12 / 0.92)), plaque-edge border, 12px padding, Panel Float shadow. A one-line status sits above the buttons.
- **Felt Plates:** Pot labels (pill), result and waiting plates (16px) in translucent felt-label, so they read as printed on the cloth rather than floating. The same result plate announces the game's winner on the resting table ("Jonas wins the game", with "1,240 chips up" as its brass line). The waiting plate's muted line under "Waiting for players" says why no hand is dealt and who can fix it: with bots holding the only other chips, "The bot doesn't play on its own." (or "The bots don't play on their own."), then who the table is waiting for, who can rebuy, and the invite line with the room code; the host is offered "add a bot" only when fewer than two players have chips.
- **Next-Game Panel:** The action panel's material (16px corners, rgb(24 10 12 / 0.92), plaque-edge border, Panel Float shadow) at 14px padding: a muted settings sentence with its values in ink, then the host's buttons or a waiting line. A value the host just changed turns paper with an underline.
- **Out-of-Chips Panel:** In the action panel's place while busted: a status line opening in ink ("You're out of chips.") and, with rebuys on, the full-width brass rebuy button; with rebuys off, the status line alone.

### Hand Hint
What your cards make right now, as information rather than a move. A plate docked bottom-left in the action panel's material (188px, rgb(24 10 12 / 0.92), plaque-edge border, 16px corners, Panel Float, 12px 12px 10px padding), shown only while you hold live cards (the server's `GameView.yourHand`) and keyed by hand, so it enters afresh each hand. No eyebrow label sits above it; the aside is labelled "Your hand" for screen readers.
- **Hand line:** The kind of hand in the Hand type (700 20px ink), with its detail split at the comma onto the line below ("Kings over Sevens", 600 16px ink-muted). A visually hidden ", " between them keeps it one phrase when read aloud, and the line is a polite live region.
- **Notes:** Optional lines in 16px ink-muted: "It's all on the board." and "Drawing to a flush or a straight."
- **Ladder:** Under a plaque-edge hairline (10px above, 8px padding), an ordered list of the nine kinds of hand, best first, in 600 14px ink-muted on 19px rows (0 8px padding). A band of plaque-turn with an inset 1px plaque-edge hairline and 6px corners sits behind your rung, which turns ink 700 and carries `aria-current`; as your hand improves the band glides to the new rung. Rungs you are drawing to turn ink, with a small italic "draw" (600 13px ink-muted) at the right.
- **No brass:** The hint says what you hold, not what to do, so under the Brass Means Now Rule it takes no brass anywhere; the lit rung is the same warmer leather as the turn plaque.

### Inputs / Fields
- **Style:** The raise amount: 86x34px, sunken field fill, plaque-edge border, 8px radius, 600 16px right-aligned. Paired with a native range slider tinted brass.
- **Focus:** 2px brass outline, 1px offset (3px everywhere else on the page).
- **Error:** A 15px danger-coloured line under the sizer.
- **Settings Form:** The shared settings form is dressed for the card room by remapping its placeholder `--color-*`, `--radius-sm` and `--font-sans` tokens onto card-room tokens (field, button, plaque-edge, ink tiers, brass, danger, 8px, Barlow) inside a 16px panel of the action-panel fill. Number inputs lose their browser steppers and the select draws its own ink-muted chevron from two gradients, so no browser-default chrome shows.

### Navigation
The header strip (52px, shared by the table and finished screens) is the only navigation: product name in Marcellus, room code in a small bordered box (600, 0.08em tracking), "Hand 12 / Blinds 5 / 10" (or "Game over") in ink-muted with values in ink, and ghost controls on the right. Leave table, and End game for the host, expand in place to an inline confirm: the question in ink ("End the game after this hand?"), a ghost to back out ("Keep playing"), and the danger button to confirm. While the game is ending, everyone sees a cream **Notice** pill (paper on room, 700 14px, 3px 12px, pill) reading "Last hand". It is a status, like a seat tag, so it is cream and never brass.

### Seat Plaque (signature)
A dark leather pill (min 176px, yours 220px) with a 40px initial disc in Marcellus and name over stack. The player to act gets a brass border, the warmer plaque-turn fill, and a brass timer ring around the avatar that drains linearly over the turn. Folded seats dim only their hole cards and plaque to 50% (your own plaque to 55%), never the whole seat, so a bot panel opened on the seat stays at full strength; your own folded cards darken and sink 10px. A small pill tag at the top-right shows state: paper for actions, blinds and All-in; the quiet plaque-edge tag (ink on plaque-edge) for states that take a player out of play: Away, Left, Out of chips. All-in is a status, not something to act on, so it never takes brass. Empty seats are a dashed, translucent pill (58px tall, min 150px, 1.5px dashed cream at 22% on leather at 72%) reading "Open seat". For the host it is a button with a second line, "Add a bot" (600 14px); hover or an open panel moves its dashed edge to brass-trim and its text to ink.

**The Sitting-Out Rule.** A seat that is out of the hand but still at the table (out of chips, joining next hand, left) dims its cards, avatar and name to 50% and quiets its plaque (edge at 60%, fill at 55%, no shadow), while its state tag stays at full contrast. The reason a seat is out must always be readable even when the seat is not.

### Bot Seats
A bot sits in an ordinary seat plaque with two marks of who it is. In the name row, after the name, an outlined **bot mark** pill reads "Easy bot", "Medium bot" or "Pro bot" (Tag type, 1px ink-muted border at 45%, ink-muted text, 0 7px, no fill). Its avatar disc carries the dashed chip-inlay ring described under Shapes.
- **Add a bot (host):** Pressing the host's open seat opens a panel below it, titled "Add a bot" (ink, 600) with a small ghost Cancel (3px 10px, 14px), over the three levels as full-width action-style rows (44px tall, 6px apart, 0 14px padding): the name on the left in the Action type and how it plays on the right in 13px ink-muted, "Easy" / "Calls a lot", "Medium" / "Plays solid poker" and "Pro" / "Reads you, bluffs well". Medium takes focus when the panel opens. No brass: picking a bot is a setup choice, not the move. Errors show as a 16px danger line.
- **Remove (host):** A small ghost control (plaque fill, plaque-edge border, 7px radius, 2px 10px, 600 14px ink-muted) hangs from the centre of the bot plaque's bottom edge. It is hidden until the seat is hovered or the control has keyboard focus, and its hover border is brass-trim. It is a rectangle, not a pill, because pills are state tags here. Pressing it swaps it for a confirm panel: "Remove Jonas?" in ink, "It folds this hand." in ink-muted when the bot holds cards, then a ghost Keep and the danger Remove, right-aligned, like Leave and End game in the header.
- **Panels:** Both are floating plates in the action panel's material (16px corners, rgb(24 10 12 / 0.96), plaque-edge border, 12px padding, Panel Float), 268px wide (232px for the confirm), centred 10px below their anchor. They open with a 180ms plate-in (fade and a 4px drop, none under reduced motion) and close on Escape or a press outside, returning focus to the control that opened them. A seat holding an open panel rises to z-index 6, above neighbouring seats, bets and the dealer button.

**The Mark-Versus-Tag Rule.** An outlined pill says who a seat is (a bot, and how it plays); a filled tag says what the seat is doing (All-in, Away, Left). A mark never fills and never takes brass, and a state never goes outlined.

### Resting Table (finished screen)
The game-over table: it centres in its area, a dark shade (rgb(14 5 8 / 0.42)) fades over the felt in 700ms, open seats are hidden, and every seat but the game's winner rests at 72% opacity. The winner keeps full strength and its brass plaque edge, and the result plate sits lit above the shade in the middle of the felt. With no winner yet to name (not enough players), the waiting plate reads "Waiting for players" and names who can rebuy.

### Standings Plaque (finished screen)
A seat plaque taken off the table and ranked: the same leather pill, 1.5px plaque-edge and Plaque Rest shadow, laid out as rank numeral (700, ink-muted), 40px initial disc, name over "2,240 chips, 1 rebuy" in ink-muted, and the signed net at the right edge (700 18px, per the Signed Net Rule). The winner's plaque takes the brass edge, the plaque-turn fill and a brass rank. A bot's line carries the same outlined bot mark after its name and the dashed ring on its disc. A player who left gets a flatter plaque (half-transparent fill, no shadow), a faded avatar (55%), an ink-muted name and the quiet "Left" tag, with every figure still at full contrast.

### Playing Card (signature)
Cream paper face, 5:7, 11% corners, rank and small suit top-left and a large authored suit shape bottom-right, all sized in container units so a card reads the same at any size. Backs are burgundy with a faint brass crosshatch inside a 4% margin. Non-winning cards at showdown dim (brightness 0.55, saturation 0.6); winning cards lift 8px with the brass ring.

### Chip Stack (signature)
26px flat discs with a 3px white dashed edge stripe and an inner ring, stacked 4px apart. The colour mix is chosen by amount (red alone for small bets up to black, black, green, blue, red at 1,000 and above), so a taller, darker stack means more.

### Table Motion
Motion uses one ease-out curve (cubic-bezier(0.16, 1, 0.3, 1)). Cards and chips fly between table anchors in 360ms; deals start 300ms in and stagger 70ms per card, board cards 150ms apart; cards turn over in 220ms; bets sweep to the pot 420ms after the closing call; winnings leave the pot at 1100ms with a "+amount" float in payout green. The host's bot panels drop into place in 180ms, and the hand hint rises 4px into place in the same 180ms plate-in at the start of each hand; the band behind its lit rung glides between rungs over 360ms as your hand improves, the hint's one authored motion. Only the landing settle uses a slight overshoot (cubic-bezier(0.34, 1.56, 0.64, 1), 240ms). The result plate rises into place in 400ms. When a game ends, the felt shade and resting seats fade in over 700ms and the standings plaques settle up 10px into place in rank order (440ms each, starting at 260ms, 80ms apart). Under prefers-reduced-motion nothing flies, fades or settles; the screen simply shows the new state.

## Do's and Don'ts

### Do:
- **Do** reserve brass (#d2a54c) for what is live now: the turn, the primary action, the winning cards and the game's winner; use brass-trim for decoration.
- **Do** keep the felt the brightest large surface and put hand state (board, pot, result) in its centre.
- **Do** set every name and number in Barlow Semi Condensed with tabular figures, at 16px or larger for routine text.
- **Do** use Marcellus only for lettering: the felt, the result, the product name.
- **Do** express depth with dark, downward shadows and lit gradients, from the Shadow Vocabulary.
- **Do** size table contents from the table width (cards at 6.6%) so the screen fits 1280x680 without scrolling.
- **Do** make motion physical and quick with the shared ease-out curve, and drop it entirely under reduced motion.
- **Do** pair every colour signal with text or shape (tags, timer ring, suit symbols, the sign on a net).
- **Do** keep a sitting-out seat's state tag at full contrast while the rest of the seat dims.
- **Do** mark a bot as who the seat is, with the outlined bot mark and the dashed ring on its disc; keep filled tags for states.
- **Do** dress shared forms for the card room by remapping their tokens onto card-room tokens, with no browser-default steppers or arrows.

### Don't:
- **Don't** use glow, neon, coloured halos or casino lighting effects.
- **Don't** add stat sidebars, HUDs or chip clutter around the table.
- **Don't** fall back to a flat grey software table or generic UI chrome.
- **Don't** use brass as decoration; decorative brass is brass-trim.
- **Don't** put brass on a status such as "Last hand", "Out of chips" or "Left"; statuses are cream or quiet plaque-edge tags.
- **Don't** put brass or an eyebrow label on the hand hint; it is information, not the move.
- **Don't** use payout green or fold blush without a signed figure beside them.
- **Don't** use a dashed border for anything but an empty place, except the chip-stripe rings on chips and a bot's avatar disc.
- **Don't** use money language (deposit, cash, jackpot, win big); chips are virtual and never bought.
- **Don't** treat the green/gold tokens in `src/styles/global.css` as the system; they belong to the unmigrated placeholder screens.
