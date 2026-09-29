/** Bot names, handed out in this order. A room has 5 seats, so a free name always exists. */
export const BOT_NAMES = ['Ace Bot', 'King Bot', 'Queen Bot', 'Jack Bot', 'Ten Bot'] as const;

/** The first bot name nobody seated in the room is using (case-insensitive), so names stay unique (§3.7). */
export function pickBotName(taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLocaleLowerCase()));
  return BOT_NAMES.find((name) => !used.has(name.toLocaleLowerCase())) ?? BOT_NAMES[0];
}
