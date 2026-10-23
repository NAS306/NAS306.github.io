import { ROGUE_RUN_METRICS, getRogueRunMetricValues } from './22-rogue-stats.js';
import { getRoguePlayerWeapon, getRogueExplosivePayload, getRogueDeathBlast } from './40-rogue-balance.js';
import { EXPLOSIVE_AMMO_COST } from './20-rogue-ammo.js';

const tankLabels = {
  hp: 'Remaining HP', maxHP: 'Maximum HP', points: 'Points left', ammo: 'Ammo left',
  speed: 'Move speed', damage: 'Standard shell damage', fireRate: 'Fire rate (%)', armor: 'Armor',
  ammoCost: 'Ammo / full volley', reload: 'Reload (s)', projectileSpeed: 'Shell speed',
  projectileLifetime: 'Shell life (s)', pellets: 'Standard shells', penetration: 'Standard pierce',
  killHeal: 'HP / kill', payloadCount: 'Explosive shells', payloadMin: 'Explosion minimum damage',
  payloadMax: 'Explosion maximum damage', payloadRadius: 'Explosion radius',
  novaDamage: 'Death nova damage', novaRadius: 'Death nova radius',
};
export const ROGUE_HISTORY_METRICS = Object.freeze([
  ...ROGUE_RUN_METRICS.map(metric => ({ ...metric, group: 'Round totals', section: 'combat' })),
  ...Object.entries(tankLabels).map(([key, label]) => ({ key: `tank-${key}`, field: key, label, group: 'Tank at round end', section: 'tank' })),
]);

// Ten small snapshots, kept only for this run. Never retain mutable player references.
export class RogueRunHistory {
  constructor() { this.rows = []; this.previous = {}; }
  record(round, outcome, state, player) {
    if (this.rows.some(row => row.round === round)) return false;
    const totals = getRogueRunMetricValues(state, player.runStats);
    const combat = {};
    for (const { key } of ROGUE_RUN_METRICS) {
      if (key !== 'ammoPerKill') combat[key] = totals[key] - (this.previous[key] ?? 0);
    }
    combat.ammoPerKill = combat.kills > 0 ? combat.ammoSpent / combat.kills : null;
    const weapon = getRoguePlayerWeapon(player), payload = getRogueExplosivePayload(player);
    const nova = getRogueDeathBlast(player), payloadCount = player.extraExplosiveProjectiles;
    const tank = {
      hp: Math.max(0, player.hp), maxHP: player.maxHP, points: state.points, ammo: player.ammo,
      speed: player.speed, damage: weapon.damage, fireRate: player.attackSpeedMultiplier * 100,
      armor: player.armor, ammoCost: weapon.pelletCount + payloadCount * EXPLOSIVE_AMMO_COST,
      reload: player.reloadTime / player.attackSpeedMultiplier, projectileSpeed: weapon.projectileSpeed,
      projectileLifetime: weapon.projectileLifetime, pellets: weapon.pelletCount, penetration: weapon.penetration,
      killHeal: player.killHeal, payloadCount,
      payloadMin: payloadCount ? payload.explosion.minDamage : null,
      payloadMax: payloadCount ? payload.explosion.maxDamage : null,
      payloadRadius: payloadCount ? payload.explosion.radius : null,
      novaDamage: nova?.maxDamage ?? null, novaRadius: nova?.radius ?? null,
    };
    this.rows.push(Object.freeze({ round, outcome, combat: Object.freeze(combat), tank: Object.freeze(tank) }));
    this.previous = totals;
    return true;
  }
}

// Pure geometry also handles one round, all-zero series, negative armor and gaps.
export function getRogueChartModel(rows, metric) {
  const values = rows.map(row => row[metric.section][metric.field ?? metric.key]);
  const finite = values.filter(Number.isFinite);
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  const span = max - min || 1;
  const low = min < 0 ? min - span * .1 : 0, high = min === max ? 4 : max + span * .1;
  const points = values.map((value, index) => ({
    round: rows[index].round, outcome: rows[index].outcome, value,
    x: rows.length === 1 ? 355 : 82 + index * 546 / Math.max(1, rows.length - 1),
    y: Number.isFinite(value) ? 260 - (value - low) / (high - low) * 220 : null,
  }));
  const ticks = Array.from({ length: 5 }, (_, index) => ({ value: low + (high - low) * index / 4, y: 260 - index * 55 }));
  return { points, ticks };
}
