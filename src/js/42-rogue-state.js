import { ABILITIES, calculateRogueStats, rollAbilityChoices } from './41-rogue-abilities.js';
import { getRogueEnemyScaling } from './40-rogue-balance.js';
import { ENEMY_DICE_FACES, createEnemyDiceBonuses, rollEnemyDice } from './21-rogue-dice.js';
import { AMMO_PER_POINT } from './20-rogue-ammo.js';
import { healRoguePlayer } from './22-rogue-stats.js';

// Survival rules are independent of DOM and the existing team scenarios.
export const ROUND_SECONDS = 40;
export const ROUND_COUNT = 10;
export const KILL_POINTS = 4;
export const UPGRADES = Object.freeze({
  heal: { name: 'Repair', description: 'Restore all HP' },
  speed: { name: 'Speed', description: '+3% of base speed' },
  damage: { name: 'Damage', description: '+3% of base damage' },
  attackSpeed: { name: 'Fire Rate', description: '+3% of base fire rate' },
  armor: { name: 'Armor', description: '−2 damage per hit; minimum 1' },
});

// Standard / Scatter / Heavy percentages. Each row sums to 100.
const MIXES = [
  [80, 15, 5], [65, 25, 10], [55, 30, 15], [65, 15, 20], [45, 35, 20],
  [50, 20, 30], [35, 40, 25], [40, 25, 35], [30, 40, 30], [30, 30, 40],
];
export function getRoundConfig(round, enemyDiceBonuses = {}) {
  if (!Number.isInteger(round) || round < 1 || round > ROUND_COUNT) {
    throw new RangeError('Round must be between 1 and 10');
  }
  const [standard, scatter, heavy] = MIXES[round - 1];
  return { ...getRogueEnemyScaling(round, ROUND_COUNT, enemyDiceBonuses), weights: { standard, scatter, heavy } };
}

export class RogueState {
  constructor() {
    this.round = 1;
    this.remaining = ROUND_SECONDS;
    this.phase = 'combat';
    this.points = 0;
    this.pointsEarned = 0;
    this.kills = 0;
    this.abilities = [];
    this.abilityChoices = [];
    this.selectedAbility = null;
    this.enemyDiceBonuses = createEnemyDiceBonuses();
    this.diceResult = null;
    this.diceRolled = false;
    this.levels = Object.fromEntries(Object.keys(UPGRADES).map(key => [key, 0]));
  }
  cost(key) { return Object.hasOwn(UPGRADES, key) ? 5 + this.levels[key] * 2 : Infinity; }
  applyStats(player) {
    Object.assign(player, calculateRogueStats(this.levels, this.abilities));
    player.hp = Math.min(player.hp, player.maxHP);
  }
  chooseAbility(id, player) {
    if (this.phase !== 'shop' || this.selectedAbility !== null || !Object.hasOwn(ABILITIES, id) || !this.abilityChoices.includes(id)) return false;
    this.abilities.push(id);
    this.selectedAbility = id;
    this.applyStats(player);
    return true;
  }
  buy(key, player) {
    if (this.phase !== 'shop' || this.diceRolled || !Object.hasOwn(UPGRADES, key) || this.points < this.cost(key)) return false;
    if (key === 'heal' && player.hp >= player.maxHP) return false;
    this.points -= this.cost(key);
    this.levels[key]++;
    if (key === 'heal') healRoguePlayer(player, player.maxHP);
    this.applyStats(player);
    return true;
  }
  rollDice(random = Math.random) {
    if (this.phase !== 'shop' || this.selectedAbility === null || this.diceRolled) return null;
    this.diceResult = rollEnemyDice(random);
    this.diceRolled = true;
    if (this.diceResult.bomb) {
      for (const { key } of ENEMY_DICE_FACES.filter(face => face.key)) this.enemyDiceBonuses[key] += this.diceResult.bonus;
    } else if (this.diceResult.key) this.enemyDiceBonuses[this.diceResult.key] += this.diceResult.bonus;
    return this.diceResult;
  }
  buyAmmo(player, points = 1) {
    if (this.phase !== 'shop' || this.diceRolled || !Number.isSafeInteger(points) || points <= 0 || points > this.points) return false;
    this.points -= points;
    player.ammo += points * AMMO_PER_POINT;
    return true;
  }
  startRound() {
    if (this.phase !== 'shop' || this.selectedAbility === null || !this.diceRolled) return false;
    this.remaining = ROUND_SECONDS;
    this.phase = 'combat';
    return true;
  }
  tick(dt, hp) {
    if (this.phase !== 'combat') return;
    if (hp <= 0) { this.phase = 'lost'; return; }
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining > 1e-8) return;
    this.remaining = 0;
    if (this.round === ROUND_COUNT) this.phase = 'won';
    else {
      this.round++;
      this.phase = 'shop';
      this.selectedAbility = null;
      this.diceRolled = false;
      this.diceResult = null;
      this.abilityChoices = rollAbilityChoices(Math.random, this.abilities);
    }
  }
  awardKills(count) {
    if (this.phase !== 'combat') return;
    this.kills += count;
    this.points += count * KILL_POINTS;
    this.pointsEarned += count * KILL_POINTS;
  }
}
