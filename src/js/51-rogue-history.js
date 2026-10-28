import { ROGUE_RUN_METRICS, getRogueRunMetricValues } from './22-rogue-stats.js';
import { getRoguePlayerWeapon, getRogueExplosivePayload, getRogueDeathBlast } from './40-rogue-balance.js';
import { EXPLOSIVE_AMMO_COST } from './20-rogue-ammo.js';

export const ROGUE_HISTORY_METRICS = ROGUE_RUN_METRICS;

// At most thirty small snapshots, kept only for this run.
export class RogueRunHistory {
  constructor() { this.rows = []; this.previous = {}; }
  record(round, outcome, state, player) {
    if (this.rows.some(row => row.round === round)) return false;
    const totals = getRogueRunMetricValues(state, player.runStats);
    const combat = {};
    for (const { key } of ROGUE_RUN_METRICS) {
      if (key === 'ammoPerKill') continue;
      combat[key] = totals[key] - (this.previous[key] ?? 0);
    }
    // A round's efficiency is its own ammo / kills, never a difference of ratios.
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
    const preparation = state.roundPreparation?.round === round ? state.roundPreparation : null;
    this.rows.push(Object.freeze({ round, outcome, combat: Object.freeze(combat), tank: Object.freeze(tank), preparation }));
    this.previous = totals;
    return true;
  }
}

// Each metric uses its own per-round peak. Raw values stay available for tables/tooltips.
// A zero-kill round has no efficiency point, so lines never imply zero ammo / kill.
export function getRogueChartModel(rows) {
  const series = ROGUE_HISTORY_METRICS.map(metric => {
    const values = rows.map(row => row.combat[metric.key]);
    const peak = Math.max(0, ...values.filter(Number.isFinite));
    const points = values.map((value, index) => {
      const percent = Number.isFinite(value) ? peak > 0 ? value / peak * 100 : 0 : null;
      return { round: rows[index].round, outcome: rows[index].outcome, value, percent,
        x: rows.length === 1 ? 468 : 60 + index * 816 / Math.max(1, rows.length - 1),
        y: percent === null ? null : 240 - percent * 2.2 };
    });
    return { ...metric, peak, points };
  });
  return { series, ticks: [0, 25, 50, 75, 100].map(value => ({ value, y: 240 - value * 2.2 })) };
}
