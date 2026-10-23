import { RogueState, ROUND_SECONDS } from '../../src/js/42-rogue-state.js';

// Purchase/card fixtures explicitly finish the unmodified first combat round.
export function createShopState() {
  const state = new RogueState();
  state.tick(ROUND_SECONDS, 125);
  return state;
}
