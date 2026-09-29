/** Public API of the bots (docs/product-spec.md §3.7). Pure like the engine: see CLAUDE.md. */
export { BOT_NAMES, pickBotName } from './names';
export { createRng, type Rng } from './rng';
export { EQUITY_TRIALS, decide, toLegal, type BotInput } from './strategy';
export { recordHand, tendencies, type PlayerRead, type Reads } from './reads';
