import type { BotLevel } from '@poker/shared';
import { createRng, decide, recordHand, type PlayerRead } from '../../src/bots';
import {
  advance,
  applyAction,
  createHand,
  firstButtonSeat,
  getLegalActions,
  nextButtonSeat,
  shuffledDeck,
  toGameView,
  type HandState,
} from '../../src/engine';
import { seededRandomInt } from '../helpers/random';

export interface MatchResult {
  /** Net chips per seat (final stack minus everything bought in). Sums to zero. */
  net: number[];
  hands: number;
  decisions: number;
}

/**
 * Bots only, straight on the engine (no table controller, no clock): one seat per entry of `levels`,
 * 1,000 chips and 5/10 blinds, busted seats buy back in before the next hand. Fully seeded.
 */
export function playMatch(levels: BotLevel[], hands: number, seed: number): MatchResult {
  const random = seededRandomInt(seed);
  const start = 1000;
  const stacks = levels.map(() => start);
  const buyIns = levels.map(() => start);
  const seats = levels.map((_, i) => i);
  let button = firstButtonSeat(seats, random);
  let decisions = 0;
  const reads = new Map<string, PlayerRead>();

  for (let handId = 1; handId <= hands; handId++) {
    stacks.forEach((stack, i) => {
      if (stack === 0) {
        stacks[i] = start;
        buyIns[i] = (buyIns[i] as number) + start;
      }
    });
    if (handId > 1) button = nextButtonSeat(button, seats);
    let state: HandState = createHand({
      handId,
      players: seats.map((seat) => ({ playerId: `s${seat}`, seat, stack: stacks[seat] as number })),
      buttonSeat: button,
      smallBlind: 5,
      bigBlind: 10,
      deck: shuffledDeck(random),
    }).state;

    while (state.awaiting !== 'none') {
      if (state.awaiting === 'deal') {
        state = advance(state).state;
        continue;
      }
      const actor = state.players.find((p) => p.seat === state.toActSeat)!;
      const legal = getLegalActions(state, actor.playerId)!;
      const intent = decide(
        { level: levels[actor.seat] as BotLevel, view: toGameView(state, actor.playerId), legal, bigBlind: 10, reads },
        createRng(random(2 ** 31)),
      );
      const result = applyAction(state, actor.playerId, intent);
      if (!result.ok) throw new Error(`illegal bot action ${JSON.stringify(intent)}: ${result.error.message}`);
      state = result.state;
      decisions++;
    }
    for (const p of state.players) stacks[p.seat] = p.stack;
    recordHand(reads, state.players, toGameView(state, '').history);
  }
  return { net: stacks.map((stack, i) => stack - (buyIns[i] as number)), hands, decisions };
}
