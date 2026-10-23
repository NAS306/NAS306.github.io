import { clamp } from './00-math.js';

export const ROUND_END_SECONDS = 1.5;
const PANEL_START_SECONDS = 0.95;

export function getRoundTransitionFrame(elapsed) {
  const time = clamp(elapsed, 0, ROUND_END_SECONDS);
  const arrival = clamp(time / 0.4, 0, 1);
  const departure = clamp((time - PANEL_START_SECONDS) / (ROUND_END_SECONDS - PANEL_START_SECONDS), 0, 1);
  return {
    done: time >= ROUND_END_SECONDS,
    panelVisible: time >= PANEL_START_SECONDS,
    timeScale: 0.04 + 0.96 * (1 - time / ROUND_END_SECONDS) ** 2,
    bannerX: time < 0.4 ? 120 * (1 - arrival) ** 3 : -120 * departure ** 2,
    bannerOpacity: (1 - (1 - arrival) ** 3) * (1 - departure ** 2),
    panelX: 100 * (1 - departure) ** 3,
    panelOpacity: 1 - (1 - departure) ** 3,
  };
}

export class RogueRoundTransition {
  constructor(outcome, round) {
    this.outcome = outcome;
    this.round = round;
    this.elapsed = 0;
    this.panelShown = false;
  }
  advance(dt) {
    // Integrate the slowdown curve so visual movement is frame-rate independent.
    const before = this.elapsed;
    const advanced = this.elapsed + Math.max(0, dt);
    this.elapsed = advanced >= ROUND_END_SECONDS - 1e-9 ? ROUND_END_SECONDS : advanced;
    const integral = t => 0.04 * t + 0.96 * (t - t * t / ROUND_END_SECONDS + t ** 3 / (3 * ROUND_END_SECONDS ** 2));
    return { ...getRoundTransitionFrame(this.elapsed), simulationDelta: integral(this.elapsed) - integral(before) };
  }
}
