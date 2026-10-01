---
name: Private Hold'em
description: A card-room table among friends, in dark green and cornsilk, where the state of the hand is always the easiest thing to read.
colors:
  green: "#132a13"
  cornsilk: "#faf4d3"
  room: "#0b1a0b"
  room-2: "#132a13"
  felt: "#2a5529"
  felt-hi: "#356a33"
  felt-edge: "#1b3b1b"
  felt-ink: "rgb(250 244 211 / 0.15)"
  felt-label: "rgb(7 20 7 / 0.6)"
  rail: "#f3ecc6"
  rail-hi: "#fdf8e0"
  rail-lo: "#cfc69c"
  rail-seam: "rgb(19 42 19 / 0.55)"
  lit: "#faf4d3"
  lit-edge: "#fffbea"
  lit-hover: "#ece5c1"
  lit-ink: "#132a13"
  trim: "#868f73"
  paper: "#faf4d3"
  ink: "#faf4d3"
  ink-muted: "#c3c5a5"
  ink-faint: "#8f977c"
  suit-red: "#c0303a"
  suit-black: "#132a13"
  card-back: "#132a13"
  plaque: "#0e1f0e"
  plaque-turn: "#1c371b"
  plaque-edge: "#2e4a2c"
  avatar: "#2a4a29"
  button: "#1a331a"
  button-hover: "#224321"
  field: "#081408"
  panel: "rgb(9 22 9 / 0.92)"
  panel-solid: "rgb(9 22 9 / 0.97)"
  fold-ink: "#f0b7b3"
  danger: "#e0645f"
  win: "#a6e3a1"
  chip-red: "#c62f3b"
  chip-blue: "#2f5fb3"
  chip-black: "#26262b"
  chip-green: "#1f8a56"
  chip-stripe: "rgb(255 255 255 / 0.85)"
  chip-inlay: "rgb(255 255 255 / 0.35)"
typography:
  hero:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "60px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  display:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "clamp(22px, calc(var(--table-w) * 0.026), 30px)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "normal"
  heading:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.15
  headline:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  felt-lettering:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "calc(var(--table-w) * 0.026)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.32em"
  room-code:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.16em"
    fontFeature: "tnum"
  lede:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.35
    fontFeature: "tnum"
  body-strong:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "tnum"
  field:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  figure:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    fontFeature: "tnum"
  action:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  hand:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.15
    fontFeature: "tnum"
  label:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    fontFeature: "tnum"
  tag:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.04em"
  keycap:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "15px"
  notice:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.02em"
  card-rank:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
    fontSize: "36cqw"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  pill: "999px"
  panel: "16px"
  button: "10px"
  field: "10px"
  control: "8px"
  preset: "7px"
  code: "6px"
  keycap: "4px"
  mark: "4px"
  card: "11% / 7.86%"
spacing:
  gutter: "24px"
  header: "52px"
  panel-pad: "12px"
  side-panel-pad: "14px"
  shell-panel-pad: "28px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "20px"
  side-column: "400px"
  intro-column: "440px"
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
    backgroundColor: "{colors.lit}"
    textColor: "{colors.lit-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.lit-hover}"
  button-fold:
    backgroundColor: "{colors.button}"
    textColor: "{colors.fold-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.button}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "0 20px"
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
  keycap:
    backgroundColor: "transparent"
    typography: "{typography.keycap}"
    rounded: "{rounded.keycap}"
    padding: "0 4px"
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
  text-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "48px"
  select:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "0 36px 0 14px"
    height: "48px"
  settings-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  shell-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.shell-panel-pad}"
  notice:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  action-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-pad}"
    width: "344px"
  side-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.side-panel-pad}"
    width: "{spacing.side-column}"
  settings-changed-mark:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.room}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.mark}"
    padding: "0 3px"
  room-code-display:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.room-code}"
  toast:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "4px 4px 4px 16px"
  reconnect-banner:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.room}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "4px 16px 4px 12px"
  dialog:
    backgroundColor: "{colors.panel-solid}"
    rounded: "{rounded.panel}"
    padding: "24px"
    width: "400px"
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
    backgroundColor: "{colors.plaque}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "58px"
  bot-panel:
    backgroundColor: "{colors.panel-solid}"
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
    backgroundColor: "{colors.panel}"
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
    typography: "{typography.figure}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  result-plate:
    backgroundColor: "{colors.felt-label}"
    textColor: "{colors.paper}"
    typography: "{typography.display}"
    rounded: "{rounded.panel}"
    padding: "8px 22px 10px"
  waiting-plate:
    backgroundColor: "{colors.felt-label}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.panel}"
    padding: "14px 20px"
---

# Design System: Private Hold'em

## Overview

**Creative North Star: "The Table Is the Room"**

A real card-room table seen from your own chair, made from two colours the owner chose: Dark Green and Cornsilk. The room is the darkest green and recedes into shadow, a padded cornsilk rail rings the table with a thin green seam where it meets the cloth, and the green felt is lit from above so the board and pot sit in its light pool, framed by the cream rail. Everything light (text, cards, the move to make) is cornsilk. Everything the player needs (whose turn, what a call costs, what is in the pot, who won) lives on or around the felt, not in sidebars; even the lobby is the table itself with nothing dealt yet.

The world is calm and physical. Cards are cornsilk paper with authored suit shapes, chips are flat striped discs, name plaques are dark green leather pills. Motion is the table's own: cards slide from the dealer spot and turn over, chips slide to a bet, sweep into the pot when a street closes, and fly to the winner. It explains what happened and then stops. The owner confirmed two rejections: the online-casino look (glow, neon, stat sidebars, chip clutter) and the flat grey software table.

Density is low and sized for arm's length on a laptop: 16px is the smallest routine text, cards scale with the table, and every in-room screen fits a 1280x680 window with no scrolling.

**Key Characteristics:**
- Two colours, green and cornsilk; suits, chips and the signal colours are the only other hues.
- Lit cornsilk, as an edge, a ring or a button's fill, always means "now": the turn, the primary action, the winning cards and player.
- Depth comes from light and material (lit felt, graded rail, soft drop shadows), never from glow.
- Josefin Sans (600) is lettering on the felt, in results and on screen headings; Nunito Sans with tabular figures carries every name and number. The owner chose this pairing in Phase 8 from five options.
- Pills and ovals for things that sit on the table; modest rounded rectangles for controls you press.
- Motion is physical and quick, and disappears entirely under reduced motion.

**Scope.** Every screen uses this world: the landing, create room, the invite name prompt, the joining and problem states (including not-found), the lobby, the in-game table and the finished-game screen. The tokens live on `:root` in `src/styles/global.css`, which also sets the page itself: the room gradient on the body, ink text, Nunito Sans 500 16px/1.35 with tabular figures, a lit caret, a lit 2px focus outline (3px offset) and lit text selection. The fonts are imported once in `src/main.tsx`. `src/styles/cardRoom.module.css` holds no tokens: its `.world` class is the fixed, non-scrolling stage of the room screens, its `.withSide`, `.sideStage`, `.tableArea`, `.side` and `.sidePanel` classes lay out the lobby and the finished screen, and it carries the table's shared controls (action, primary, ghost and danger buttons). The pre-game screens are built from the Shell, Panel and Notice in `components/Layout.tsx` and the shared Button, TextField and SettingsForm. Phones get their own arrangements of the same world (see Layout, Phones).

## Colors

A dim green room around a lit green felt, with cornsilk paper and a single cornsilk accent.

### Primary
- **Lit Cornsilk** (lit): The one accent, the owner's Cornsilk (#faf4d3). The turn plaque's border and draining timer ring, the primary button's fill, the outer ring around winning cards, the winner's plaque edge (at showdown and at game end), the winning hand line under a result, the top standings plaque's edge and rank numeral, the "hurry" status, focus outlines, the caret, text selection, the range slider and the rebuys checkbox. **Lit Edge** (lit-edge) is only the primary button's border; **Lit Hover** (lit-hover) is only its hover fill; **Lit Ink** (lit-ink, the owner's Dark Green) is the text set on lit.
- **Rail Trim** (trim): Cornsilk worked into the green, a dull sage (#868f73) that is decoration, not signal: link underlines, and the hover border on quiet controls (ghost buttons, presets, fields, the select, the rebuys row, open seats, the Remove tab, Dismiss). It never marks state.

### Secondary
- **Lamp-Lit Felt** (felt, felt-hi, felt-edge): The playing surface, always a radial light pool (felt-hi at the centre, felt at 45%, felt-edge at the rim). felt-edge is also the thin band that separates a winning card from its lit ring. **Felt Shade** (felt-label) is a translucent dark green used for plates that sit on the felt: pot labels, the result plate, the waiting plates. **Printed Felt Ink** (felt-ink) is cornsilk at 15%, the faint lettering printed into the cloth.

### Tertiary
- **Card Suits and Chips**: **Suit Red** (suit-red) and **Suit Black** (suit-black, the Dark Green) on cornsilk card faces; the **Card Back** (card-back) is the Dark Green under a faint cornsilk crosshatch, inside a cornsilk paper margin. Chips come in four flat colours, **Chip Red**, **Chip Blue**, **Chip Black**, **Chip Green**, each with a white dashed edge stripe (**Chip Stripe**, chip-stripe) and a fainter inner ring (**Chip Inlay**, chip-inlay), which also draws the dashed ring on a bot's avatar disc; stacks are built from these by amount, never as free decoration.

### Neutral
- **The Two Colours** (green, cornsilk): The owner's Dark Green (#132a13) and Cornsilk (#faf4d3). Every other neutral is a shade of one or the other; room-2, lit-ink, suit-black and card-back are the green itself, and lit, paper and ink are the cornsilk itself.
- **Green Room** (room, room-2): The backdrop, a radial gradient fixed to the viewport from room-2 (the green) at the centre to room at 70%. room is also the text colour on paper: seat tags, the dealer button, the Last hand notice, the reconnecting banner and a just-changed setting.
- **Cornsilk Rail** (rail, rail-hi, rail-lo, rail-seam): The padded rail, cornsilk graded top to bottom (rail-hi, rail at 40%, rail-lo, a shaded cream), with a 2px green seam (rail-seam) where it meets the felt. The owner asked for the rail in the second colour after the first pass looked too green, so the table reads as cream around green. Paper tags and the dealer button that overlap it carry a 1.5px green keyline.
- **Leather Plaque** (plaque, plaque-turn, plaque-edge, avatar): Name plaques and their hairline edges; plaque-edge is also the standard 1px border for every control, field and panel. plaque-turn is the slightly lighter plaque of the player to act, the top standings plaque and the band behind the hand hint's lit rung. avatar fills the initial disc.
- **Green Controls** (button, button-hover, field): Fill of action and secondary buttons and their hover; field is the sunken fill of every input and the select.
- **Panel Glass** (panel, panel-solid): Floating plates. panel (92%) is the action panel, hand hint, side panels, shell panels and the settings editor; panel-solid (97%) is for plates that float over busy content: the host's bot panels, toasts and the Open in another tab dialog.
- **Cornsilk Paper** (paper): Card faces, the card back's margin, seat tags, the dealer button, the Last hand notice, the reconnecting banner, a just-changed setting and result headlines.
- **Cornsilk Ink** (ink, ink-muted, ink-faint): Primary text (the cornsilk itself), secondary text (stacks, labels, meta, ledes), and the faintest tier (placeholders, field hints).
- **Signal colours**: **Fold Blush** (fold-ink) for the Fold button, destructive text, and a player's net loss on the final standings. **Danger** (danger) for form errors, the border of danger buttons (Leave, End game, Remove), and mixed into the border of toasts and error notices. **Payout Green** (win, #a6e3a1) for chips gained: the floating "+amount" as winnings land and a player's net gain on the final standings.

### Named Rules
**The Lit Cornsilk Means Now Rule.** Lit (lit) marks the one thing that is live right now: whose turn, the action you can take, the cards that won, and the player who won. It always arrives as an edge, a ring or the fill of a full-size button, attached to the live thing itself. Statuses (All-in, Last hand, Out of chips, Reconnecting, a just-changed setting) are also cornsilk, because paper and lit are the same colour, so they are told apart by form: a status is a small filled paper label with room-dark text (a 13-14px tag, a pill, a 4px mark), never an edge, a ring or a button. When nothing is actionable, even the primary button's ghost drops to the neutral green control. Decoration uses trim, never lit, and trim never marks state.

**The Two-Colour Balance Rule.** Neither colour may take over the screen. The room and felt are green; the rail, cards, text, tags and the primary button are cornsilk, so every screen with the table shows a real share of both. The board still sits in the felt's light pool, framed by the rail.

**The Signed Net Rule.** Payout green (win) and fold blush (fold-ink) are the only up and down colours, and they only ever colour a signed figure: "+1,240" in win, "−550" in fold-ink, "Even" in ink-muted. The sign carries the meaning; the colour repeats it. Neither colour fills a surface or marks anything that is not a chip change.

## Typography

**Display Font:** Josefin Sans 600 (with system-ui, sans-serif); only this weight is loaded, so every display style renders at 600
**Body Font:** Nunito Sans 500/600/700 (with system-ui, sans-serif)

**Character:** Josefin Sans is geometric, art-deco lettering with a card-room poise, like a name on a casino sign; Nunito Sans is a soft, open working face whose tabular figures keep stacks, bets and pots aligned as they change. Nunito is wider than a condensed face, so tight spots (action-row keycaps, plaques) were checked at 1536 x 700.

### Hierarchy
- **Hero** (Josefin Sans 600, 60px, 1.05, -0.01em): The product name as the landing's title, the only type at this size.
- **Display** (Josefin Sans 600, clamp(22px, 2.6% of table width, 30px), 1.15): The showdown result ("You win 280"), in cornsilk paper on a felt plate.
- **Heading** (Josefin Sans 600, 30px, 1.15): The one heading of a pre-game panel: "New room", "Room RW8W7B" (the code inside it drops to Nunito Sans 700 at 0.9em, 0.14em tracking), the problem and not-found titles. The Open in another tab dialog's title sits between this and Headline at 26px.
- **Headline** (Josefin Sans 600, 24px, 1.2): Table-level plates ("Waiting for players", "Waiting to start") and side-column headings: "Invite your friends", "Final standings", the settings editor's title.
- **Title** (Josefin Sans 600, 19px, 1, 0.02em): The product name in every 52px bar, where it links home on pre-game screens.
- **Felt Lettering** (Josefin Sans 600, 40% of the card width, 0.32em, uppercase): The name printed into the felt, in felt-ink; it fades away while a result or waiting plate is shown.
- **Room Code** (Nunito Sans 700, 52px, 1, 0.16em): The lobby's room code, the one thing to pass on and so the largest figure on the screen.
- **Lede** (Nunito Sans 500, 20px, 1.4, ink-muted, 34ch): The landing's one line under the title.
- **Body** (Nunito Sans 500, 16px, 1.35, tabular figures): Default for the page; stacks, meta, status lines, sentences in panels.
- **Body Strong** (Nunito Sans 600, 16px): Player names, bet amounts, field labels, the room code on the bar, ghost buttons.
- **Field** (Nunito Sans 600, 18px, 1): Text in inputs and the select. A room-code entry sets 700 20px, 0.22em, uppercase.
- **Action** (Nunito Sans 700, 18px, 1.1): Button labels; in the action row an amount sits under it at 13px/600. Also the signed net on a standings plaque (line height 1).
- **Hand** (Nunito Sans 700, 20px, 1.15): The one strong line of the hand hint, the kind of hand you hold ("Full House"); its detail ("Kings over Sevens") sits under it at 600 16px in ink-muted.
- **Label** (Nunito Sans 600, 14px): Bet presets, the host's bot Remove control, the "Add a bot" line on an open seat, and the rungs of the hand hint's ladder (on a 19px row).
- **Tag** (Nunito Sans 700, 13px, 0.04em): State tags on plaques (All-in, Away, Left, Out of chips, blind, last action), and the outlined bot mark ("Easy bot", "Medium bot", "Pro bot") in a name row.
- **Keycap** (Nunito Sans 700, 13px, 15px line): The F / C / R shortcut letters in the action buttons.
- **Notice** (Nunito Sans 700, 14px, 1.2, 0.02em): The bar's status pill ("Last hand").
- **Card Rank** (Nunito Sans 700, 36% of card width, 1, -0.02em): Card indices, scaled with the card via container units.

### Named Rules
**The Tabular Rule.** Every number uses tabular figures (set once on the body). Numbers that jump width as chips move are a defect.

**The Lettering Rule.** Josefin Sans is for things a card room would letter or engrave: the felt, the result, the room's name, a screen or table-level heading such as "New room" or "Final standings", and the initial on an avatar disc. It never sets names, numbers, codes, buttons or controls.

## Layout

The room screens (lobby, table, finished) are a single fixed, non-scrolling stage under a 52px bar (24px side gutters, 20px gaps) carrying the name, room code, meta and the ghost controls. On the table screen the table fills the stage. Its height is what the window leaves under the bar and above your seat (viewport height minus 248px, at most 600px); its width stretches the oval sideways into what the side seats leave (the smallest of viewport width minus 400px, 2.6 times that height, and 1480px), and the height never exceeds width / 2.05. So on a short laptop window (the owner plays on a 14-inch laptop, about 1536 x 700 inside the browser) the table widens rather than leaving empty bands beside it. Card width is the smaller of 6.6% of table width and 15% of table height; board cards are 1.15 card widths, the centre of attention.

Your seat is always bottom centre, your two cards large (1.3 card widths) and overlapping the rail and your plaque; other seats sit clockwise at left, top-left, top-right and right, their cards at 0.62 card widths. The board of five sits in the felt centre, with the pot or result plate always just above it. The action panel is docked bottom-right, 344px wide, 24px from the edge; opposite it, the hand hint is docked bottom-left (24px from the left, 20px from the bottom, 188px wide) while you hold live cards. Bets sit on the felt in front of each seat (the side seats' at 21% and 79% of table width, far enough in that a wide plaque, with a long name or a bot mark, clears its bet chip and tag); the dealer button travels between seats. Seats size to their content (max-content), so a seat near the table's edge is never squeezed by its position.

The lobby and the finished screen share one split below the bar: two columns 24px apart (12px 24px 20px padding), the table on the left centred in its area (width the smallest of (viewport width minus 622px), (viewport height minus 256px) times 2.05, and 1100px, still at 2.05 : 1), and a 400px column on the right whose blocks stack 22px apart. In the lobby the column is centred vertically (40px bottom padding): the invite (heading, code 10px below, hint, Copy invite link 16px below) and then the side panel. On the finished screen the column starts at the top: the "Final standings" heading with its ranked plaques 8px apart, then the next-game side panel. Changing settings swaps the column's contents for the settings editor in both.

The landing is two columns, a clamp(380px, 29vw, 440px) intro and the table scene, gap clamp(40px, 5vw, 96px), centred vertically, with clamp(40px, 7vw, 160px) on the left and clamp(40px, 5vw, 96px) on the right. The intro stacks 16px apart: title, lede, name field, the two start buttons side by side (1fr 1fr, 10px), and under a plaque-edge hairline (22px above) the join row (field and Join, 10px apart). The scene column is a size container and the scene takes its full width (at most 1040px) at 2.05 : 1, so the whole table always fits beside the form; cards are 8.5% of its width and your two hole cards (1.35 card widths, turned -5deg and 4deg) lie over the near rail.

The other pre-game screens use the Shell: the same 52px bar with the product name linking home, and one panel centred a little above the middle of the room (24px 24px 76px padding), where the felt would be. Create room's panel is 480px, the invite prompt and problem panels 440px.

Spacing is small-step and tight: 6, 8 and 10px inside controls and stacks, 12px action-panel padding, 14px side panels, 16-18px between form rows, 28px in shell panels, 20-24px at the page frame.

### Phones

Every screen adapts by shape, in CSS only. Upright (`orientation: portrait`, up to 900px wide) and on its side (`orientation: landscape`, up to 540px tall) are the two phone shapes; anything else gets the desktop layout above.

- **Table, upright:** the bar (48px, no product name under 600px, short labels such as "Leave", the Hand fact hidden and Blinds shown as a bare value), then the table, then the action panel full width along the bottom (10px gutters, safe-area aware). The stage between them is a size container: the table is the largest tall oval (1 : 1.15) that leaves room for the side seats' plaques and your seat, at most 480px wide. Seats use their upright spots (side seats low on the rail, the top seats straddling the top rail); the board runs nearly the felt's width at 44% height, the pot sits above it with side pots stacked, and a result plate sits under it (one line for the hand). The felt lettering is hidden. The hand hint sits in the stage's bottom-left corner beside your plaque, without its ladder.
- **Table, sideways:** the bar across the top, the wide table on the left (sized from its stage), the action panel as a 280px column on the right. The pot moves to the felt left of your cards; the result keeps its place above the board.
- **Seats on phones:** 32px avatars, 14px names and stacks, plaques at most 136px (yours 148-180px), a bot's level beside its chips ("Medium"), other seats' cards at 0.82 card widths and yours at 1.6. Action buttons are 52px tall; touch screens show no F / C / R keycaps, and the host's Remove tab is always shown. Bot panels open toward the middle of the screen.
- **Lobby and finished screen, upright:** one scrolling column: invite, Start panel, then the table (lobby); standings, next game, then the table (finished). Sideways they keep the split with a 300px column that scrolls.
- **Landing:** one column under 860px wide (form first, the table picture under it); the two start buttons stack under 520px. **Shell panels** take the screen's width less a 12px gutter.

## Elevation & Depth

Depth is physical light and material, not glow. The room is a radial gradient, the rail a vertical cornsilk gradient with a bright top highlight and a soft inner shade at its lower edge, and the felt a radial light pool with an inset green seam and an inset shadow under the rail. Objects that sit on the table cast short, soft, dark drop shadows; floating UI (panels, toasts, dialogs) casts a longer one. Lit never glows; the ring around winning cards is a hard double outline plus an ordinary drop shadow.

### Shadow Vocabulary
- **Table Drop** (`box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.7), inset 0 2px 0 rgb(255 255 255 / 0.6), inset 0 -3px 6px rgb(0 0 0 / 0.18)`): The table on the floor, with the rail's top highlight; also the landing's table scene.
- **Felt Well** (`box-shadow: inset 0 0 0 2px var(--rail-seam), inset 0 10px 30px rgb(0 0 0 / 0.35)`): The felt inside the rail: the green seam plus rail shade.
- **Panel Float** (`--shadow-panel: 0 20px 40px -12px rgb(0 0 0 / 0.7)`): The action panel, the hand hint, side panels, shell panels, the settings editor, the host's bot panels, toasts and the dialog.
- **Plaque Rest** (`--shadow-plaque: 0 8px 18px -6px rgb(0 0 0 / 0.6)`): Name plaques on the rail, standings plaques, and the reconnecting banner.
- **Card Rest** (`box-shadow: 0 2px 4px rgb(0 0 0 / 0.35)`): Cards lying on felt (the dealer button's is 0.4).
- **Card Lift** (`box-shadow: 0 0 0 2px var(--felt-edge), 0 0 0 4.5px var(--lit), 0 8px 16px rgb(0 0 0 / 0.4)` with an 8px rise): Winning cards at showdown. A cornsilk ring on a cornsilk card needs a band of felt between them to read as a ring, so the ring is doubled: 2px of felt-edge, then lit out to 4.5px.
- **Chip Edge** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.45)`): Each chip in a stack.
- **Lit Sheen** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.35)`): Only on the live primary button.

### Named Rules
**The No-Glow Rule.** Shadows are dark and fall downward. No coloured blurs, halos or neon, on lit or anything else.

## Shapes

Things that belong to the table are round: the oval table and felt, pill plaques, pill pot labels and tags, the reconnecting banner, circular chips, the avatar disc and the dealer button (fully rounded, 999px or 50%). Things you press or type into are modest rounded rectangles: action and secondary buttons, text fields, the select, the rebuys row, notices and toasts (10px); ghost buttons and the raise amount (8px); presets and the bot Remove control (7px); the room code on the bar (6px); keycaps and the just-changed setting mark (4px). Floating plates, panels, the dialog and the hand hint use 16px; the band behind the hand hint's lit rung uses 6px; empty board slots 8px. Cards keep true playing-card proportions (5:7) with corners of 11% of their width. Borders are hairlines (1-1.5px) in plaque-edge; dashed borders mean "empty" (open seats at cornsilk 22%, empty board slots at cornsilk 14%) and the white dashed ring on chips is the chip's own edge stripe. The one deliberate exception is a bot's avatar disc: a fainter 1.5px dashed ring in chip-inlay, inset 3px, that reads as a chip's edge stripe (a chip at the table, not a face), never as an empty place.

## Components

### Buttons
Solid, pressable, and quiet until they are the move.
- **Shape:** Gently rounded rectangles (10px), 48px tall. At the table, a three-column row (Fold, Call/Check, Raise) sized 1 : 1.2 : 1.3.
- **Action / Secondary:** The quiet act material: green control fill (button), ink text, 1px plaque-edge border, 700 18px label; in the action row a 13px amount sits beneath. The shared pre-game Button defaults to this ("secondary", 0 20px padding): Play against bots, Join, Copy invite link.
- **Primary:** Lit fill, lit-ink text, lit-edge border and a thin top sheen. Exactly one per screen or turn, the move to make: the recommended action on your turn, Create a room, Take a seat, Create room, Save settings, Start game, Start next game, the busted player's full-width "Rebuy for 1,000", and Try again on a problem panel.
- **Fold:** The action style with fold-ink text.
- **Keycaps:** Each action button carries its shortcut (F fold, C check or call, R raise) as a small keycap tucked into its top-right corner (4px from the top, 6px from the right): Keycap type, 1px currentColor border, 4px radius, 0 4px padding, at 45% opacity, so it takes the button's own ink and never competes with the label.
- **Hover / Active / Disabled / Busy:** Hover shifts the fill (button-hover, lit-hover over 150ms); press nudges down 1px (90ms); disabled at 40% opacity; a busy pre-game button shows at 70% with a progress cursor. When it is not your turn the row stays in place as a 30% ghost with the primary reverted to the neutral green control.
- **Ghost / Danger:** Transparent, 8px radius, 7px 14px padding, plaque-edge border and 600 16px ink-muted text; hover moves the border to trim and the text to ink; disabled at 50%. Ghost is every secondary control beside a primary (Edit settings, Change settings, Cancel) and the bar's Leave. The danger variant uses a translucent danger border (danger at 50%) and fold-ink text, with a faint danger wash (12%) on hover. Danger is only the confirming button of a destructive inline confirm (Leave, End game, Remove); the button that opens the confirm stays ghost.

### Chips (bet presets)
- **Style:** Transparent, 30px tall, 7px radius, plaque-edge border, 600 14px ink-muted text, in an evenly divided row (Min, 1/2 pot, Pot, All-in).
- **State:** Hover as the ghost button (trim border, ink text).

### Cards / Containers
- **Action Panel:** 16px corners, panel glass, plaque-edge border, 12px padding, Panel Float shadow. A one-line status sits above the buttons; when your time is short a "10s left" joins it in lit, 600. Errors from actions go to toasts, not the panel.
- **Shell Panel:** The pre-game plate: panel glass, plaque-edge border, 16px corners, 28px padding, Panel Float. A Heading, a 16px ink-muted line under it, then the form. While a room is joining, the panel gives way to three face-down cards (64px) dealing in on a loop over "Room RW8W7B" and "Taking your seat…".
- **Notice:** A bordered line inside a panel or the landing intro (10px 14px, 1px plaque-edge, 10px radius, ink-muted text with values in ink, 600). The error tone mixes danger into the border (55%) and sets its text in ink; it carries form-level errors.
- **Side Panel:** A plate in the 400px side column, in the action panel's material at 14px padding: the settings sentence, then the host's Start (primary) and Edit or Change settings (ghost) at 1fr : auto, or a 600 waiting line for everyone else. The lobby's reads "Everyone starts with 1,000 chips, blinds 5/10, 30s turns, rebuys on."; the finished screen's opens "Next game:".
- **Settings Sentence:** A muted sentence with its values in ink, 600. A value the host just changed is marked as a status: paper fill, room-dark text, 4px corners, 0 3px padding, fading in and out over 300ms; a guest also sees "Jonas changed the settings." in ink. It never takes lit or trim.
- **Settings Editor:** In place of the side column's usual content: a Headline title, a muted hint, and the settings form in a 16px panel-glass plate (18px padding, Panel Float), ending in the primary Save settings and a full-width ghost Cancel.
- **Felt Plates:** Pot labels (pill), result and waiting plates (16px) in translucent felt-label, so they read as printed on the cloth rather than floating. The waiting plate (14px 20px, width min(420px, 60%)) holds a Headline and a 16px ink-muted line: "Waiting to start" in the lobby, "Waiting for players" at the table. The table's line says why no hand is dealt and who can fix it: with bots holding the only other chips, "The bot doesn't play on its own." (or "The bots don't play on their own."), then who the table is waiting for, who can rebuy, and the invite line with the room code; the host is offered "add a bot" only when fewer than two players have chips. The same result plate announces the game's winner on the resting table ("Jonas wins the game", with "1,240 chips up" as its lit line).
- **Out-of-Chips Panel:** In the action panel's place while busted: a status line opening in ink ("You're out of chips.") and, with rebuys on, the full-width lit rebuy button; with rebuys off, the status line alone.
- **Dialog:** Only "Open in another tab": a 400px panel-solid plate (24px padding, 16px corners, Panel Float) over a green backdrop (rgb(4 12 4 / 0.72)), title in Josefin Sans 26px, body in ink-muted.

### Toasts and the Reconnecting Banner
Notices about the connection and about requests the server turned down, fixed at the top centre of every screen (8px from the top, so they sit in the 52px bar between the room's facts and its controls), width up to 560px, 8px apart, above everything (z-index 40).
- **Toast:** A panel-solid plate, 10px corners, a border of danger mixed 60% into plaque-edge, min 36px tall (4px 4px 4px 16px), Panel Float, the message in body ink and a small ghost Dismiss (3px 10px, 8px radius, 600). Each lasts 6 seconds; at most three show, the oldest giving way; the same message twice restarts its timer instead of stacking. Errors from table actions ("The table moved on before that arrived. Try again."), rebuy, start, end game and leave go here; form mistakes stay inline next to their field.
- **Reconnecting Banner:** A paper pill (min 36px, 4px 16px 4px 12px, Plaque Rest) in room-dark 700: three 8px room-dark dots pulsing in turn, then "Connection lost. Reconnecting", and for a seated player an aside after a room-at-30% hairline, "Your seat is kept while you're away." (500). It is a status everyone should notice, so it is paper, never lit.

### Inputs / Fields
- **Text Field:** 48px tall, field fill, 1px plaque-edge border, 10px radius, 0 14px, Field type; a 600 ink-muted label 6px above; placeholders in ink-faint 500; hints in 16px ink-faint and errors in 16px danger below. Hover moves the border to trim; invalid moves it to danger. Number inputs draw no browser steppers. A room-code field sets tracked capitals (700 20px, 0.22em).
- **Select:** The text field's box with 0 36px 0 14px padding and its own ink-muted chevron drawn from two gradients, so no browser chrome shows; options on the field fill.
- **Settings Form:** Rows 18px apart: two pairs 12px apart (Starting chips beside Time per turn, Small blind beside Big blind), then the rebuys toggle as a bordered row (12px 14px, 1px plaque-edge, 10px radius, trim on hover) with a 20px lit checkbox, "Allow rebuys" in 600 and its hint in ink-muted, then any error notice and the full-width primary submit.
- **Raise Amount:** 86x34px, field fill, plaque-edge border, 8px radius, 600 16px right-aligned, paired with a native range slider tinted lit.
- **Focus:** 2px lit outline; fields and the raise amount take a 1px offset (fields also turn their border lit), everything else 3px.

### Navigation
The 52px bar is the only navigation. On the room screens it carries the product name in Josefin Sans, the room code in a small bordered box (600, 0.08em tracking, 6px radius), meta in ink-muted with values in ink ("Players 3 / 5" in the lobby; "Hand 12 / Blinds 5 / 10" or "Game over" at the table), and ghost controls on the right. Leave and, for the host, End game expand in place to an inline confirm: the question in ink ("End the game after this hand?"), a ghost to back out ("Keep playing"), and the danger button to confirm. While the game is ending, everyone sees a cornsilk **Notice** pill (paper on room, 700 14px, 3px 12px, pill) reading "Last hand". It is a status, like a seat tag, so it is a filled paper label and never a lit edge. On pre-game screens the bar holds only the product name, which links home.

### Landing Table Scene (signature)
The landing's picture is a corner of the real table, built from the table's own materials and components (cornsilk rail gradient, lit felt with its seam, felt-label pot pill, paper dealer button, the real PlayingCard and ChipStack): a flop of three, two empty dashed slots, a 240 pot above the board, and your two hole cards over the near rail. It deals in on load: each card drops 1.2 card widths from 92% scale in 440ms, starting at 180ms and 80ms apart (board first, then your two), and the pot arrives 6px up in 420ms at 620ms. It is decorative (aria-hidden) and shows sample cards, not a game.

### Seat Plaque (signature)
A dark green leather pill (min 176px, yours 220px) with a 40px initial disc in Josefin Sans and name over stack. The player to act gets a lit border, the lighter plaque-turn fill, and a lit timer ring around the avatar that drains linearly over the turn; as the turn arrives the plaque settles up from 95% scale in 320ms. At showdown the winner's plaque takes the lit edge and rises 7px once (900ms, starting at 1100ms with the payout). Folded seats dim only their hole cards and plaque to 50% (your own plaque to 55%), never the whole seat, so a bot panel opened on the seat stays at full strength; your own folded cards darken and sink 10px. A small pill tag at the top-right shows state: paper for actions, blinds and All-in; the quiet plaque-edge tag (ink on plaque-edge) for states that take a player out of play: Away, Left, Out of chips. All-in is a status, not something to act on, so it is a paper tag and never a lit edge. Empty seats are a dashed, translucent pill (58px tall, min 150px, 1.5px dashed cornsilk at 22% on plaque at 72%) reading "Open seat". For the host it is a button with a second line, "Add a bot" (600 14px); hover or an open panel moves its dashed edge to trim and its text to ink.

**The Sitting-Out Rule.** A seat that is out of the hand but still at the table (out of chips, joining next hand, left) dims its cards, avatar and name to 50% and quiets its plaque (edge at 60%, fill at 55%, no shadow), while its state tag stays at full contrast. The reason a seat is out must always be readable even when the seat is not.

### Bot Seats
A bot sits in an ordinary seat plaque with two marks of who it is. In the name row, after the name, an outlined **bot mark** pill reads "Easy bot", "Medium bot" or "Pro bot" (Tag type, 1px ink-muted border at 45%, ink-muted text, 0 7px, no fill). Its avatar disc carries the dashed chip-inlay ring described under Shapes.
- **Add a bot (host):** In the lobby and at the table, pressing the host's open seat opens a panel below it, titled "Add a bot" (ink, 600) with a small ghost Cancel (3px 10px, 14px), over the three levels as full-width action-style rows (44px tall, 6px apart, 0 14px padding): the name on the left in the Action type and how it plays on the right in 13px ink-muted, "Easy" / "Calls a lot", "Medium" / "Plays solid poker" and "Pro" / "Reads you, bluffs well". Medium takes focus when the panel opens. No lit: picking a bot is a setup choice, not the move. Errors show as a 16px danger line.
- **Remove (host):** A small ghost control (plaque fill, plaque-edge border, 7px radius, 2px 10px, 600 14px ink-muted) hangs from the centre of the bot plaque's bottom edge. It is hidden until the seat is hovered or the control has keyboard focus, and its hover border is trim. It is a rectangle, not a pill, because pills are state tags here. Pressing it swaps it for a confirm panel: "Remove Jonas?" in ink, "It folds this hand." in ink-muted when the bot holds cards, then a ghost Keep and the danger Remove, right-aligned, like Leave and End game in the bar.
- **Panels:** Both are floating plates in panel-solid (16px corners, plaque-edge border, 12px padding, Panel Float), 268px wide (232px for the confirm), centred 10px below their anchor. They open with a 180ms plate-in (fade and a 4px drop, none under reduced motion) and close on Escape or a press outside, returning focus to the control that opened them. A seat holding an open panel rises to z-index 6, above neighbouring seats, bets and the dealer button.

**The Mark-Versus-Tag Rule.** An outlined pill says who a seat is (a bot, and how it plays); a filled tag says what the seat is doing (All-in, Away, Left). A mark never fills and never takes lit, and a state never goes outlined.

### Hand Hint
What your cards make right now, as information rather than a move. A plate docked bottom-left in the action panel's material (188px, panel glass, plaque-edge border, 16px corners, Panel Float, 12px 12px 10px padding), shown only while you hold live cards (the server's `GameView.yourHand`) and keyed by hand, so it enters afresh each hand. No eyebrow label sits above it; the aside is labelled "Your hand" for screen readers.
- **Hand line:** The kind of hand in the Hand type (700 20px ink), with its detail split at the comma onto the line below ("Kings over Sevens", 600 16px ink-muted). A visually hidden ", " between them keeps it one phrase when read aloud, and the line is a polite live region.
- **Notes:** Optional lines in 16px ink-muted: "It's all on the board." and "Drawing to a flush or a straight."
- **Ladder:** Under a plaque-edge hairline (10px above, 8px padding), an ordered list of the nine kinds of hand, best first, in 600 14px ink-muted on 19px rows (0 8px padding). A band of plaque-turn with an inset 1px plaque-edge hairline and 6px corners sits behind your rung, which turns ink 700 and carries `aria-current`; as your hand improves the band glides to the new rung. Rungs you are drawing to turn ink, with a small italic "draw" (600 13px ink-muted) at the right.
- **No lit:** The hint says what you hold, not what to do, so under the Lit Cornsilk Means Now Rule it takes no lit anywhere; the lit rung is the same lighter leather as the turn plaque.

### Resting Table (finished screen)
The game-over table: it centres in its area, a dark green shade (rgb(4 12 4 / 0.45)) fades over the felt in 700ms, open seats are hidden, and every seat but the game's winner rests at 72% opacity. The winner keeps full strength and its lit plaque edge, and the result plate sits lit above the shade in the middle of the felt. With no winner yet to name (not enough players), the waiting plate reads "Waiting for players" and names who can rebuy.

### Standings Plaque (finished screen)
A seat plaque taken off the table and ranked: the same leather pill, 1.5px plaque-edge and Plaque Rest shadow, laid out as rank numeral (700, ink-muted), 40px initial disc, name over "2,240 chips, 1 rebuy" in ink-muted, and the signed net at the right edge (700 18px, per the Signed Net Rule). The winner's plaque takes the lit edge, the plaque-turn fill and a lit rank. A bot's line carries the same outlined bot mark after its name and the dashed ring on its disc. A player who left gets a flatter plaque (plaque mixed at 50% with transparent, no shadow), a faded avatar (55%), an ink-muted name and the quiet "Left" tag, with every figure still at full contrast.

### Playing Card (signature)
Cornsilk paper face, 5:7, 11% corners, rank and small suit top-left and a large authored suit shape bottom-right, in suit-red or the green, all sized in container units so a card reads the same at any size. Backs are the Dark Green under a faint cornsilk crosshatch (13%), inset 4% inside a cornsilk paper margin. Non-winning cards at showdown dim (brightness 0.55, saturation 0.6); winning cards lift 8px with the double ring (a 2px felt-edge band, then lit out to 4.5px).

### Chip Stack (signature)
26px flat discs with a 3px white dashed edge stripe and an inner ring, stacked 4px apart. The colour mix is chosen by amount (red alone for small bets up to black, black, green, blue, red at 1,000 and above), so a taller, darker stack means more.

### Motion
Motion uses one ease-out curve (cubic-bezier(0.16, 1, 0.3, 1)). Cards and chips fly between table anchors in 360ms; deals start 300ms in and stagger 70ms per card, board cards 150ms apart; cards turn over in 220ms; bets sweep to the pot 420ms after the closing call; winnings leave the pot at 1100ms with a "+amount" float in payout green, as the winner's plaque rises 7px once (900ms). The turn plaque settles from 95% scale in 320ms. The dealer button travels between seats in 500ms. The host's bot panels drop into place in 180ms, and the hand hint rises 4px into place in the same 180ms plate-in at the start of each hand; the band behind its lit rung glides between rungs over 360ms as your hand improves, the hint's one authored motion. Only the landing settle of a flown object uses a slight overshoot (cubic-bezier(0.34, 1.56, 0.64, 1), 240ms). The result plate rises into place in 400ms. When a game ends, the felt shade and resting seats fade in over 700ms and the standings plaques settle up 10px into place in rank order (440ms each, starting at 260ms, 80ms apart). Off the table: the landing scene deals in once on load, the joining screen's three backs deal in on a 1600ms loop (140ms apart), toasts and the reconnecting banner drop 8px into place in 260ms, and the banner's dots pulse over 1200ms, 150ms apart. Under prefers-reduced-motion nothing flies, fades, settles, rises, deals or pulses (the banner's dots rest at 60%); the screen simply shows the new state.

## Do's and Don'ts

### Do:
- **Do** build every surface from the two colours, Dark Green (#132a13) and Cornsilk (#faf4d3), and the tokens on `:root` in `src/styles/global.css`; suits, chips and the signal colours are the only other hues.
- **Do** reserve lit for what is live now, as an edge, a ring or a primary button's fill: the turn, the primary action, the winning cards and the winner; use trim for decoration.
- **Do** mark statuses as small filled paper labels with room-dark text (tags, the Last hand pill, the reconnecting banner, a just-changed setting).
- **Do** keep hand state (board, pot, result) in the felt's centre, framed by the cornsilk rail, and keep both colours visible in real amounts.
- **Do** set every name and number in Nunito Sans with tabular figures, at 16px or larger for routine text.
- **Do** use Josefin Sans only for lettering: the felt, the result, the product name, screen and table-level headings.
- **Do** express depth with dark, downward shadows and lit gradients, from the Shadow Vocabulary.
- **Do** size table contents from the table width (cards at 6.6%) so the room screens fit 1280x680 without scrolling.
- **Do** make motion physical and quick with the shared ease-out curve, and drop it entirely under reduced motion.
- **Do** pair every colour signal with text or shape (tags, timer ring, suit symbols, the sign on a net, a keycap's letter).
- **Do** keep a sitting-out seat's state tag at full contrast while the rest of the seat dims.
- **Do** mark a bot as who the seat is, with the outlined bot mark and the dashed ring on its disc; keep filled tags for states.
- **Do** send errors from table and room requests to toasts, and keep form mistakes inline next to their field.
- **Do** draw every form control in the card room's materials, with no browser-default steppers or arrows.

### Don't:
- **Don't** use glow, neon, coloured halos or casino lighting effects.
- **Don't** add stat sidebars, HUDs or chip clutter around the table.
- **Don't** fall back to a flat grey software table or generic UI chrome.
- **Don't** use lit as decoration; decorative cornsilk is trim.
- **Don't** mark state with trim, including a just-changed value; a change is a paper mark.
- **Don't** put a lit edge, ring or fill on a status such as "Last hand", "Out of chips", "Left" or "Reconnecting"; statuses are paper or quiet plaque-edge tags.
- **Don't** put lit or an eyebrow label on the hand hint; it is information, not the move.
- **Don't** put a cornsilk ring straight onto a cornsilk card; separate it with a band of felt.
- **Don't** use payout green or fold blush without a signed figure beside them.
- **Don't** use a dashed border for anything but an empty place, except the chip-stripe rings on chips and a bot's avatar disc.
- **Don't** use money language (deposit, cash, jackpot, win big); chips are virtual and never bought.
