---
version: 1
slug: "src-pages-finishedpage-tsx"
primary_target: "src/pages/FinishedPage.tsx"
related_targets: ["src/components/table"]
---

## Scope
The finished-game screen (room status `finished`): Operate mode. Fits a 1280x680 desktop window without scrolling and scales up to large monitors; on phones it becomes one scrolling column (client/DESIGN.md, Phones). Shown to everyone seated after the host ends the game or one player is left with chips (rebuys off).

## Audience, job and constraints
The same friends on a voice call. Job: see who won and by how much, find your own line, and (host) start the next game in one click; others see who they are waiting for; anyone can leave. The owner said the group usually plays again right away, so Restart is the primary action and the standings are the context. Results come only from the server's `finalResults` (ranked by net); players who left the game still have a line. The host may change settings here before restarting (they apply on restart).

## Direction contract
THESIS: The game is over and the table rests: the empty table stays in view, dimmed, while a ranked standings column and the next-game panel take the right. It refuses the pop-up scoreboard over the table and the spreadsheet results grid.

OWN-WORLD: The table's world unchanged: wine room, mahogany rail, lamp-lit felt, leather pill plaques, cream paper, Marcellus lettering, Barlow with tabular figures. Standings are leather plaques ranked top to bottom; the winner's plaque carries brass because it is the winning thing; nets are signed (+/-) and coloured payout green or fold blush, never colour alone.

STORY: A friend sees the winner named on the felt and in the first plaque, finds their own line, and the host restarts with one brass button; everyone else reads who they are waiting for.

FIRST VIEWPORT: 52px header (name, room code, Leave). Left: the resting table, dimmed, seats where people sat, a felt plate naming the game's winner. Right: a 400px column, "Final standings" then ranked plaques (rank, initial, name, final chips and rebuys, net), then the next-game panel with the settings line, Edit settings (host) and the brass Restart, or "Waiting for {host}".

FORM: structure "Standings beside the table", position 7 of my ordered list, dealt as the lead and chosen by the owner; seed key 6fb54152. Signature interaction: the table dims as the standings plaques settle in rank order, winner first.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
