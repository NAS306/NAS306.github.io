import { clamp } from './00-math.js';

export const ROGUE_WARNING_SECONDS = 5;

// Driven by round time rather than CSS timers, so pausing and leaving a round
// cannot leave a warning animation running behind the preparation screen.
export function getRogueCountdown(remaining, inCombat) {
  if (!inCombat || remaining <= 0 || remaining > ROGUE_WARNING_SECONDS) {
    return { active: false, urgency: 0, edgeOpacity: 0, scale: 1, hue: 42 };
  }
  const elapsed = ROGUE_WARNING_SECONDS - remaining;
  const urgency = elapsed / ROGUE_WARNING_SECONDS;
  const pulse = Math.sin(Math.PI * (elapsed % 1)) ** 2;
  return {
    active: true, urgency,
    edgeOpacity: pulse * (0.3 + urgency * 0.4),
    scale: 1 + urgency * 0.4 + pulse * 0.1,
    hue: 42 * (1 - urgency),
  };
}

export class RogueCombatEffects {
  constructor() { this.reset(); }
  reset() {
    this.strength = this.remaining = this.elapsed = 0;
    this.offsetX = this.offsetY = 0;
    this.damageFlash = 0;
  }
  shake(strength, duration) {
    this.strength = Math.max(this.strength, clamp(strength, 0, 8));
    this.remaining = Math.max(this.remaining, clamp(duration, 0, 0.25));
  }
  shoot(weaponId) {
    const strength = weaponId === 'heavy' ? 3.5 : weaponId === 'scatter' ? 1.3 : 0.7;
    this.shake(strength, weaponId === 'heavy' ? 0.16 : 0.08);
  }
  damage(amount) {
    this.shake(3 + amount / 10, 0.22);
    this.damageFlash = 0.12;
  }
  kill(count) { this.shake(2 + Math.min(count, 4) * 0.6, 0.14); }
  update(dt) {
    this.elapsed += dt;
    this.remaining = Math.max(0, this.remaining - dt);
    this.strength *= Math.exp(-18 * dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    if (this.remaining === 0) {
      this.strength = this.offsetX = this.offsetY = 0;
      return;
    }
    const envelope = Math.min(1, this.remaining / 0.05);
    this.offsetX = Math.sin(this.elapsed * 73) * this.strength * envelope;
    this.offsetY = Math.cos(this.elapsed * 91) * this.strength * envelope * 0.7;
  }
}
