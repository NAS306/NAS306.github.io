export const ENEMY_DICE_MIN_BONUS = 20;
export const ENEMY_DICE_MAX_BONUS = 60;
export const ENEMY_DICE_FACES = Object.freeze([
  { key: 'speed', name: 'Move Speed', symbol: '⚀' },
  { key: 'attackSpeed', name: 'Fire Rate', symbol: '⚁' },
  { key: 'damage', name: 'Damage', symbol: '⚂' },
  { key: 'maxHP', name: 'Max HP', symbol: '⚃' },
  { key: 'projectileSpeed', name: 'Shell Speed', symbol: '⚄' },
  { key: null, name: 'Pass', symbol: '⚅' },
  { key: null, name: 'Bomb', symbol: '💣', bomb: true },
].map(Object.freeze));

// Integer percentage points, not roll counts: 23 + 37 = +60% of base.
export function createEnemyDiceBonuses() {
  return Object.fromEntries(ENEMY_DICE_FACES.filter(face => face.key).map(face => [face.key, 0]));
}

export function rollEnemyDice(random = Math.random) {
  const face = ENEMY_DICE_FACES[Math.min(ENEMY_DICE_FACES.length - 1, Math.floor(random() * ENEMY_DICE_FACES.length))];
  const range = ENEMY_DICE_MAX_BONUS - ENEMY_DICE_MIN_BONUS + 1;
  const bonus = face.key || face.bomb ? ENEMY_DICE_MIN_BONUS + Math.min(range - 1, Math.floor(random() * range)) : 0;
  return { ...face, bonus };
}

export const DICE_ENTER_SECONDS = 0.6;
export const DICE_EXIT_SECONDS = 0.4;

// Presentation only. The run state owns the single roll; this timeline cannot
// reroll, spend points or start combat before the card has been acknowledged.
export class RogueDiceReveal {
  constructor() { this.phase = 'entering'; this.elapsed = 0; }
  close() {
    if (this.phase !== 'ready') return false;
    this.phase = 'leaving'; this.elapsed = 0;
    return true;
  }
  advance(dt) {
    if (this.phase === 'ready') return { ready: true, done: false, angle: 0, tilt: 0, scale: 1, opacity: 1 };
    if (this.phase === 'done') return { ready: false, done: true, angle: 720, tilt: 10, scale: .7, opacity: 0 };
    const entering = this.phase === 'entering';
    const duration = entering ? DICE_ENTER_SECONDS : DICE_EXIT_SECONDS;
    this.elapsed = Math.min(duration, this.elapsed + Math.max(0, dt));
    const progress = this.elapsed >= duration - 1e-9 ? 1 : this.elapsed / duration;
    if (progress === 1) {
      this.phase = entering ? 'ready' : 'done';
      return this.advance(0);
    }
    const turn = entering ? (1 - progress) ** 3 : progress ** 2;
    return {
      ready: false, done: false,
      angle: (entering ? -720 : 720) * turn,
      tilt: (entering ? -10 : 10) * turn,
      scale: 1 - turn * .3,
      opacity: entering ? Math.min(1, progress * 4) : 1 - progress ** 2,
    };
  }
}
