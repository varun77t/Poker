---
version: 1
slug: "src-pages-tablepage-tsx"
primary_target: "src/pages/TablePage.tsx"
related_targets: ["src/components/table"]
---

## Scope
The in-game table screen (room status `playing`): Operate mode. Desktop only, must fit a 1280x680 browser viewport without scrolling and scale up to large monitors.

## Audience, job and constraints
Remote friends on a voice call, one laptop each. Job: follow the hand at a glance and act in one click. States that must read instantly: whose turn (and time left), cost to call, pot and side pots, each player's bet, folded / all-in / away / waiting / busted seats, showdown winner and hand. The client renders server snapshots only; buttons and bet bounds come from `legalActions`.

## Direction contract
THESIS: The table is the room: a real card-room table seen from your own chair, where the state of the hand is always the brightest thing on screen. It refuses the online-casino arrangement (glow, neon, stat sidebars, chip clutter) and the flat grey software table.

OWN-WORLD: Deep wine room, padded mahogany rail with one brass trim line, deep green felt lit from above, cream card faces with authored suit shapes, flat striped chips (red, blue, black, green), dark leather name plaques. Marcellus for felt lettering and results; Barlow Semi Condensed with tabular figures for every name and number. Brass is the only accent and always means "now": the turn ring, the primary action, the winning cards.

STORY: A friend glances at the table and knows whose turn it is, what a call costs and what is in the pot. On their turn they act with one click. At showdown they see who won and with what, and the chips visibly go there.

FIRST VIEWPORT: Oval table centred, about 70% of the viewport width; your seat at the bottom with your two cards large over the rail; four seats clockwise (left side, top-left, top-right, right side); board of five in the felt centre with the pot above it; action panel docked bottom-right (344 px wide); a 52 px header strip with room code, hand number, blinds and Leave table.

FORM: card-room table, the owner's pinned mix of mock samples 1 (table, no glow) and 3 (motion, chips); user-pinned, so position 1 of my list over the roll; seed key 46a1946f. Signature interaction: cards slide from the dealer spot and flip; chips slide from a player to their bet, sweep into the pot when a street ends, and fly to the winner.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Reference
Approved prototype: client/prototypes/table-prototype.html (owner: "everything is perfect" after the side seats moved up).
