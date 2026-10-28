import { resolveWeaponProfile, getModifiedWeaponProfile } from './10-weapon-config.js';

// Survival tuning is isolated from the weapons and tanks used by team modes.
export const ROGUE_PLAYER_BASE = Object.freeze({ maxHP: 125, speed: 200 });
export const ARMOR_PER_UPGRADE = 1;
export const ROGUE_EXPLOSION_RULES = Object.freeze({
  payloadRadius: 90, maxPayloadRadius: 150,
  novaRadius: 70, maxNovaRadius: 110,
  falloffExponent: 2,
});
export const ROGUE_ENEMY_RULES = Object.freeze({
  maxHP: 90,
  hpPerRound: 3,
  damageGrowthPerRound: 0.02,
  initialMaxEnemies: 6,
  extraEnemiesPerRound: 6,
  initialReplacementInterval: 0.3,
  finalReplacementInterval: 0.06,
  movementMultiplier: 0.5,
  attackSpeedMultiplier: 0.5,
  damageMultiplier: 0.5,
  trackingResponse: 0.5,
});

// Called after getRoundConfig validates the round; growth is relative to round 1.
export function getRogueEnemyScaling(round, roundCount, diceBonuses = {}) {
  const rules = ROGUE_ENEMY_RULES;
  const elapsed = round - 1;
  const progress = elapsed / Math.max(1, roundCount - 1);
  return {
    maxEnemies: rules.initialMaxEnemies + elapsed * rules.extraEnemiesPerRound,
    replacementInterval: rules.initialReplacementInterval +
      (rules.finalReplacementInterval - rules.initialReplacementInterval) * progress,
    enemyMaxHP: rules.maxHP * (1 + (diceBonuses.maxHP ?? 0) / 100) + elapsed * rules.hpPerRound,
    enemyDamageMultiplier: rules.damageMultiplier * (1 + elapsed * rules.damageGrowthPerRound + (diceBonuses.damage ?? 0) / 100),
    enemyMovementMultiplier: rules.movementMultiplier * (1 + (diceBonuses.speed ?? 0) / 100),
    enemyAttackSpeedMultiplier: rules.attackSpeedMultiplier * (1 + (diceBonuses.attackSpeed ?? 0) / 100),
    enemyProjectileSpeedMultiplier: 1 + (diceBonuses.projectileSpeed ?? 0) / 100,
  };
}

const STANDARD_BASE = resolveWeaponProfile('standard');
const PLAYER_STANDARD = Object.freeze({
  ...STANDARD_BASE, damage: 40, reloadTime: 0.2, projectileSpeed: 750,
  fireRange: STANDARD_BASE.fireRange * 750 / STANDARD_BASE.projectileSpeed,
});
const EXPLOSIVE_PAYLOAD = Object.freeze({
  ...PLAYER_STANDARD, title: 'Explosive Payload', projectileRadius: 6, projectileSpeed: 1000,
  fireRange: PLAYER_STANDARD.fireRange * 1000 / 750,
  explosion: Object.freeze({ minDamage: 15, maxDamage: 80, radius: ROGUE_EXPLOSION_RULES.payloadRadius, visualRadius: ROGUE_EXPLOSION_RULES.payloadRadius, pushForce: 450, hitAllies: false, falloffExponent: ROGUE_EXPLOSION_RULES.falloffExponent }),
});

export function resolveRoguePlayerWeapon() { return PLAYER_STANDARD; }
export function getRoguePlayerWeapon(stats) { return getModifiedWeaponProfile(PLAYER_STANDARD, stats); }
export function getRogueExplosivePayload(stats) {
  // Only repeat payload picks add large shells; standard multishot stays separate.
  const profile = getModifiedWeaponProfile(EXPLOSIVE_PAYLOAD, {
    ...stats, extraProjectiles: Math.max(0, (stats.extraExplosiveProjectiles ?? 0) - 1),
  });
  const radius = Math.min(ROGUE_EXPLOSION_RULES.maxPayloadRadius, profile.explosion.radius);
  return { ...profile, explosion: { ...profile.explosion, radius, visualRadius: radius } };
}

export function getRogueDeathBlast(stats) {
  if (!(stats.deathBlastDamage > 0)) return null;
  const maxDamage = stats.deathBlastDamage * stats.damageMultiplier;
  const radius = Math.min(ROGUE_EXPLOSION_RULES.maxNovaRadius, ROGUE_EXPLOSION_RULES.novaRadius * stats.explosionRadiusMultiplier);
  return {
    minDamage: 0, maxDamage, radius,
    visualRadius: radius, pushForce: 120, hitAllies: false,
    falloffExponent: ROGUE_EXPLOSION_RULES.falloffExponent,
  };
}

export function getRogueExplosionRadiusText(stats) {
  const radii = [];
  if (stats.extraExplosiveProjectiles > 0) radii.push(`Shell ${Number(getRogueExplosivePayload(stats).explosion.radius.toFixed(1))}px`);
  const nova = getRogueDeathBlast(stats);
  if (nova) radii.push(`Nova ${Number(nova.radius.toFixed(1))}px`);
  return radii.join(' / ') || 'None';
}
