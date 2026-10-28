import { t, tx, getI18n } from './24-i18n.js';
import { ABILITIES, DIVIDEND_RULES } from './41-rogue-abilities.js';
import { EXPLOSIVE_AMMO_COST } from './20-rogue-ammo.js';

export const abilityName = id => t(`ability.${id}.name`, {}, ABILITIES[id]?.name ?? id);
export const rarityName = rarity => t(`rarity.${rarity}`);
export const statValue = value => String(value).replace(/\b(Shell|Nova|blast|None|Unlimited)\b/g, word => tx(word));
export function abilityDescription(id, superMode = false) {
  const ability = ABILITIES[id];
  if (getI18n().locale === 'en') return superMode ? ability.description.replace(/ Maximum level \d+\./g, '').replace('Your points are capped at 5,000.', 'Run points remain unlimited in Super Mode.') : ability.description;
  if (ability.action) return t('ability.pickTarget');
  const percentage = new Set(['speed', 'damage', 'attackSpeed', 'projectileSpeed', 'projectileLifetime', 'explosionRadius']);
  const factors = new Set(['projectileSize', 'shellSpeedFactor', 'pointFactor', 'incomingDamageFactor']);
  const parts = Object.entries(ability.effects).flatMap(([key, value]) => {
    if (key === 'roundIncome') return t('effect.roundIncome', { amount: value });
    if (key === 'pointsCap') return superMode ? [] : t('effect.cap', { amount: getI18n().number(DIVIDEND_RULES.pointsCap) });
    if (key === 'pulseShield') return t('effect.shield');
    if (key === 'extraExplosiveProjectiles') return t('effect.payload', { amount: value, cost: EXPLOSIVE_AMMO_COST });
    const label = t(`effect.${key}`, {}, key);
    if (factors.has(key)) return `${label} ×${Number((1 + value).toFixed(3))}`;
    return `${label} ${value < 0 ? '−' : '+'}${Number((Math.abs(value) * (percentage.has(key) ? 100 : 1)).toFixed(3))}${percentage.has(key) ? '%' : ''}`;
  });
  if (ability.maxLevel && !superMode) parts.push(t('ability.max', { level: ability.maxLevel }));
  if (ability.requiresExplosion && !superMode) parts.push(t('ability.requires'));
  return parts.join(' · ');
}

export function localizedRewardText(reward, superMode, store) {
  return t(superMode ? 'wallet.noReward' : 'wallet.reward', { points: getI18n().number(reward), wallet: getI18n().number(store.data.points) }) + (store.error ? ` | ${tx(store.error)}` : '');
}
