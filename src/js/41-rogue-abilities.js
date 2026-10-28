import { ROGUE_PLAYER_BASE, ARMOR_PER_UPGRADE, getRoguePlayerWeapon, getRogueExplosivePayload, getRogueDeathBlast, getRogueExplosionRadiusText } from './40-rogue-balance.js';
import { EXPLOSIVE_AMMO_COST } from './20-rogue-ammo.js';

export const DIVIDEND_RULES = Object.freeze({ pointsPerRound: 100, pointsCap: 5000 });
export const ABILITY_CHOICE_COUNT = 4;

// Base percentages add; oversized-shell size/speed factors multiply per pick.
// Icons are local SVG paths, avoiding font and image dependencies.
export const ABILITIES = Object.freeze({
  hull: {
    name: 'Reinforced Hull', description: '+100 max HP, but −35% base move speed. No instant healing.',
    effects: { maxHP: 100, speed: -0.35 }, icon: 'M5 7 12 3l7 4v7l-7 7-7-7Z M12 8v8 M8 12h8',
  },
  turbo: {
    name: 'Turbo Engine', description: '+60% base move speed, but −35% base damage. Escaping costs stopping power.',
    effects: { speed: 0.60, damage: -0.35 }, icon: 'M14 2 5 14h6l-1 8 9-13h-6Z',
  },
  loader: {
    name: 'Autoloader', description: '+80% base fire rate, but −35% base damage. Burns ammo much faster.',
    effects: { attackSpeed: 0.80, damage: -0.35 }, icon: 'M19 8a8 8 0 1 0 1 8 M19 3v5h-5 M9 9v6h6V9Z',
  },
  overcharge: {
    name: 'Overcharged Shells', description: '+100% base damage, but −40% base fire rate. Long gaps leave you exposed.',
    effects: { damage: 1.00, attackSpeed: -0.40 }, icon: 'M8 20V9l4-6 4 6v11Z M8 15h8 M10 23h4',
  },
  piercing: {
    name: 'Piercing Rounds', description: '+3 standard-shell pierce, but −30% base damage. Payloads cannot pierce.',
    effects: { penetrationBonus: 3, damage: -0.30 }, icon: 'M2 12h18 M15 7l5 5-5 5 M7 4v5 M7 15v5 M12 4v5 M12 15v5',
  },
  splitter: {
    name: 'Split Barrel', description: '+3 standard shells per volley, but −40% base damage. Each shell costs 1 ammo.',
    effects: { extraProjectiles: 3, damage: -0.40 }, icon: 'M3 12h7 M10 12l9-7 M10 12l9 7 M15 5h4v4 M15 19h4v-4',
  },
  ballistics: {
    name: 'High Velocity', description: '+100% base shell speed and +25% base damage, but −8 armor. Incoming hits hurt more.',
    effects: { projectileSpeed: 1.00, damage: 0.25, armor: -8 }, icon: 'M2 7h7 M1 12h6 M2 17h7 M11 8h6l5 4-5 4h-6Z',
  },
  blast: {
    name: 'Wide Blast', description: '+35% base blast radius, but −35% base damage. Radius caps: payload 150px, nova 110px.',
    requiresExplosion: true,
    effects: { explosionRadius: 0.35, damage: -0.35 }, icon: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M5 5l3 3 M16 16l3 3 M5 19l3-3 M16 8l3-3 M12 8l4 4-4 4-4-4Z',
  },
  recycler: {
    name: 'Combat Recycler', description: '+10 HP per credited kill, but −50 max HP. Cannot revive a destroyed tank.',
    effects: { killHeal: 10, maxHP: -50 }, icon: 'M7 3h10v5h4v9h-4v4H7v-4H3V8h4Z M12 8v8 M8 12h8',
  },
  plating: {
    name: 'Heavy Plating', description: '+10 armor, but −40% base move speed. Surrounded tanks struggle to escape.',
    effects: { armor: 10, speed: -0.40 }, icon: 'M4 5h16v9l-8 7-8-7Z M8 8h8v5l-4 4-4-4Z',
  },
  glass: {
    name: 'Glass Reactor', description: '+200% base damage, but −80 max HP. One pick leaves a base hull at 45 HP.',
    effects: { damage: 2, maxHP: -80 }, icon: 'M12 2 3 8l9 14 9-14Z M3 8h18 M8 8l4 14 4-14 M9 2l-1 6 M15 2l1 6',
  },
  storm: {
    name: 'Bullet Storm', description: '+7 standard shells per volley, but −65% base damage. Each shell costs 1 ammo.',
    effects: { extraProjectiles: 7, damage: -0.65 }, icon: 'M2 6h6 M2 12h6 M2 18h6 M11 4h8l3 2-3 2h-8Z M11 10h8l3 2-3 2h-8Z M11 16h8l3 2-3 2h-8Z',
  },
  siege: {
    name: 'Siege Battery', description: '+150% base damage and +20% base blast radius, but −65% base fire rate.',
    effects: { damage: 1.5, explosionRadius: 0.2, attackSpeed: -0.65 }, icon: 'M3 20h18 M5 20V10h14v10 M9 10V3h6v7 M8 14h8 M8 17h8',
  },
  blood: {
    name: 'Blood Engine', description: '+20 HP per credited kill, but −65 max HP. A base hull drops to 60 HP.',
    effects: { killHeal: 20, maxHP: -65 }, icon: 'M12 2C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-12Z M12 10v8 M8 14h8',
  },
  rail: {
    name: 'Rail Accelerator', description: '+8 standard-shell pierce and +150% base shell speed, but −60% base fire rate.',
    effects: { penetrationBonus: 8, projectileSpeed: 1.5, attackSpeed: -0.6 }, icon: 'M2 8h20 M2 16h20 M4 12h16 M16 9l4 3-4 3 M6 3v3 M11 3v3 M6 18v3 M11 18v3',
  },
  reactor: {
    name: 'Redline Reactor', description: '+200% base fire rate, but −55% base damage and −8 armor. Faster ammo drain, harder incoming hits.',
    effects: { attackSpeed: 2, damage: -0.55, armor: -8 }, icon: 'M12 2v5 M12 17v5 M2 12h5 M17 12h5 M5 5l4 4 M15 15l4 4 M5 19l4-4 M15 9l4-4 M12 8l3 4-3 4-3-4Z',
  },
  slowOrb: {
    name: 'Orbital Magazine', description: '+2 standard shells and +200% base flight time, but −70% base shell speed. Misses arrive very late.',
    effects: { extraProjectiles: 2, projectileLifetime: 2, projectileSpeed: -0.7 }, icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M2 12a10 5 0 1 0 20 0 10 5 0 1 0-20 0 M12 2v4 M12 18v4',
  },
  warhead: {
    name: 'Unstable Warheads', description: '+60% base blast radius, but −50% base damage and −35% base shell speed. Caps: shell 150px, nova 110px.',
    requiresExplosion: true,
    effects: { explosionRadius: 0.6, damage: -0.50, projectileSpeed: -0.35 }, icon: 'M12 2 14 8l6-3-3 6 5 3-7 1 1 7-5-5-5 4 1-7-6-2 7-2Z',
  },
  juggernaut: {
    name: 'Iron Fortress', description: '+200 max HP and +12 armor, but −60% base move speed and −50% base fire rate. No healing.',
    effects: { maxHP: 200, armor: 12, speed: -0.6, attackSpeed: -0.5 }, icon: 'M3 21V7h4V3h4v4h2V3h4v4h4v14Z M9 21v-7h6v7 M7 10h2 M15 10h2',
  },
  volatile: {
    name: 'Death Cascade', description: 'Kills erupt for 0–40 base damage in 70px, but −12 armor. Enemy-only blast; radius capped at 110px.',
    effects: { deathBlastDamage: 40, armor: -12 }, icon: 'M3 5h6v6H3Z M15 13h6v6h-6Z M9 8h4l5 5 M12 2v3 M18 5l-2 2 M21 9h-3 M6 15v6 M3 18h6',
  },
  explosive: {
    name: 'Explosive Payload', description: '+1 enemy-only explosive shell per volley (10 ammo), but −40% base fire rate. Base blast 15–80 damage, 90px.',
    effects: { extraExplosiveProjectiles: 1, attackSpeed: -0.40 }, icon: 'M8 20V9l4-6 4 6v11Z M8 14h8 M3 5l3 3 M21 5l-3 3 M2 13h3 M19 13h3',
  },
  ricochet: {
    name: 'Ricochet Rounds', description: '+1 wall bounce per shell. Repeat picks add bounces; flight time stays the same.',
    effects: { wallBounces: 1 }, icon: 'M3 3v18 M7 5l10 7L7 19 M14 19H7v-7',
  },
  oversized: {
    name: 'Oversized Rounds', description: 'Shell size ×2 and shell speed ×0.7 per level. Damage unchanged. Maximum level 3.', maxLevel: 3,
    effects: { projectileSize: 1, shellSpeedFactor: -0.3 }, icon: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M2 8V2h6 M16 2h6v6 M22 16v6h-6 M8 22H2v-6',
  },
  recalibrate: {
    name: 'Recalibration', description: 'Choose an owned ability to lose one level. Its benefits and penalties are recalculated. Used immediately.', action: 'remove',
    effects: {}, icon: 'M4 7h12l-4-4 M20 17H8l4 4 M4 7v5 M20 17v-5',
  },
  bargain: {
    name: 'Devil’s Bargain', description: 'Points earned ×2, but damage taken ×2 per level. Maximum level 3.', maxLevel: 3,
    effects: { pointFactor: 1, incomingDamageFactor: 1 }, icon: 'M4 3l4 5h8l4-5v12l-8 7-8-7Z M8 12h1 M15 12h1',
  },
  dividends: {
    name: 'Round Dividend', description: `Each cleared round grants round ×${DIVIDEND_RULES.pointsPerRound} points per level. Your points are capped at ${DIVIDEND_RULES.pointsCap.toLocaleString('en-US')}.`,
    effects: { roundIncome: DIVIDEND_RULES.pointsPerRound, pointsCap: -1 }, icon: 'M3 8h18 M6 8v12 M12 8v12 M18 8v12 M3 21h18 M12 2 2 7h20Z',
  },
  shield: {
    name: 'Pulse Shield', description: 'Block all damage for 1 second every 3 combat seconds. First shield at 3 seconds. Maximum level 1.', maxLevel: 1,
    effects: { pulseShield: 1 }, icon: 'M4 5l8-3 8 3v7c0 5-8 10-8 10S4 17 4 12Z M12 6v12 M8 12h8',
  },
  lightHull: {
    name: 'Light Chassis', description: '+25% base move speed, but −25 max HP. No instant healing.',
    effects: { speed: 0.25, maxHP: -25 }, icon: 'M4 17l4-10h8l4 10Z M2 12h5 M17 12h5 M9 20h6',
  },
  heavyAmmo: {
    name: 'Dense Ammunition', description: '+80% base damage, but −25% base shell speed.',
    effects: { damage: 0.8, projectileSpeed: -0.25 }, icon: 'M7 21V9l5-7 5 7v12Z M7 12h10 M7 17h10',
  },
  overdrive: {
    name: 'Overdrive Matrix', description: '+150% base fire rate and +75% base damage, but −35% base move speed.',
    effects: { attackSpeed: 1.5, damage: 0.75, speed: -0.35 }, icon: 'M12 2 4 13h6l-1 9 11-13h-7Z M3 3l3 3 M18 18l3 3',
  },
});

export const RARITIES = Object.freeze({
  common: { name: 'Common', chance: 0.6 }, rare: { name: 'Rare', chance: 0.3 }, legendary: { name: 'Legendary', chance: 0.1 },
});
const RARE = new Set(['overcharge', 'piercing', 'splitter', 'ballistics', 'blast', 'recycler', 'blood', 'rail', 'slowOrb', 'warhead', 'siege', 'oversized', 'bargain', 'heavyAmmo']);
const LEGENDARY = new Set(['glass', 'storm', 'reactor', 'juggernaut', 'volatile', 'explosive', 'dividends', 'shield', 'overdrive']);
export function abilityRarity(id) { return LEGENDARY.has(id) ? 'legendary' : RARE.has(id) ? 'rare' : 'common'; }
export function canOfferAbility(id, owned) {
  const ability = ABILITIES[id];
  if (!ability) return false;
  if (ability.action) return owned.length > 0;
  if (owned.filter(item => item === id).length >= (ability.maxLevel ?? Infinity)) return false;
  return !ability.requiresExplosion || owned.includes('explosive') || owned.includes('volatile');
}

export function rollAbilityRarity(sample) {
  return sample < RARITIES.common.chance ? 'common' : sample < RARITIES.common.chance + RARITIES.rare.chance ? 'rare' : 'legendary';
}

export function rollAbilityChoices(random = Math.random, owned = []) {
  const ids = Object.keys(ABILITIES).filter(id => canOfferAbility(id, owned));
  const choices = [];
  for (let i = 0; i < ABILITY_CHOICE_COUNT; i++) {
    const rarity = rollAbilityRarity(random());
    const pool = ids.filter(id => abilityRarity(id) === rarity && !choices.includes(id));
    // Every tier retains at least four eligible cards, including max-level exclusions.
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    choices.push(pool[index]);
  }
  return choices;
}

export function calculateRogueStats(levels, owned) {
  const totals = {};
  let projectileSizeMultiplier = 1, shellSpeedMultiplier = 1, pointMultiplier = 1, incomingDamageMultiplier = 1;
  for (const id of owned) {
    for (const [key, value] of Object.entries(ABILITIES[id].effects)) {
      if (key === 'projectileSize') projectileSizeMultiplier *= 1 + value;
      else if (key === 'shellSpeedFactor') shellSpeedMultiplier *= 1 + value;
      else if (key === 'pointFactor') pointMultiplier *= 1 + value;
      else if (key === 'incomingDamageFactor') incomingDamageMultiplier *= 1 + value;
      else totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return {
    maxHP: Math.max(25, ROGUE_PLAYER_BASE.maxHP + (totals.maxHP ?? 0)),
    speed: ROGUE_PLAYER_BASE.speed * Math.max(0.25, 1 + levels.speed * 0.03 + (totals.speed ?? 0)),
    damageMultiplier: Math.max(0.2, 1 + levels.damage * 0.03 + (totals.damage ?? 0)),
    attackSpeedMultiplier: Math.max(0.25, 1 + levels.attackSpeed * 0.03 + (totals.attackSpeed ?? 0)),
    armor: levels.armor * ARMOR_PER_UPGRADE + (totals.armor ?? 0),
    projectileSpeedMultiplier: Math.max(0.2, 1 + (totals.projectileSpeed ?? 0)) * shellSpeedMultiplier,
    projectileLifetimeMultiplier: 1 + (totals.projectileLifetime ?? 0),
    projectileSizeMultiplier,
    pointMultiplier,
    incomingDamageMultiplier,
    roundIncome: totals.roundIncome ?? 0,
    pointsCap: totals.pointsCap ? DIVIDEND_RULES.pointsCap : Infinity,
    pulseShield: (totals.pulseShield ?? 0) > 0,
    wallBounces: totals.wallBounces ?? 0,
    explosionRadiusMultiplier: 1 + (totals.explosionRadius ?? 0),
    extraProjectiles: totals.extraProjectiles ?? 0,
    extraExplosiveProjectiles: totals.extraExplosiveProjectiles ?? 0,
    penetrationBonus: totals.penetrationBonus ?? 0,
    killHeal: totals.killHeal ?? 0,
    deathBlastDamage: totals.deathBlastDamage ?? 0,
  };
}

export function abilityIcon(id) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ABILITIES[id].icon}"/></svg>`;
}

const rounded = value => Number(value.toFixed(3));
const percent = value => `${Number((value * 100).toFixed(1))}%`;
export function getStatSnapshot(stats) {
  const weapon = getRoguePlayerWeapon(stats);
  const payload = getRogueExplosivePayload(stats);
  const nova = getRogueDeathBlast(stats);
  const payloadCount = stats.extraExplosiveProjectiles ?? 0;
  const hitDamage = `${rounded(weapon.damage)}${payloadCount > 0 ? ` / ${rounded(payload.explosion.minDamage)}–${rounded(payload.explosion.maxDamage)} blast` : ''}`;
  const ammoCost = weapon.pelletCount + payloadCount * EXPLOSIVE_AMMO_COST;
  const volley = `${weapon.pelletCount}${payloadCount > 0 ? ` + ${payloadCount} blast` : ''} / ${ammoCost} ammo`;
  const blastRadius = getRogueExplosionRadiusText(stats);
  return [
    { key: 'hp', label: 'Max HP', value: stats.maxHP, text: `${stats.maxHP}` },
    { key: 'speed', label: 'Move speed', value: rounded(stats.speed), text: `${rounded(stats.speed)}` },
    { key: 'damage', label: 'Shell damage', value: `${hitDamage}/${rounded(stats.damageMultiplier)}`, text: `${hitDamage}` },
    { key: 'attackSpeed', label: 'Fire rate / reload', value: `${rounded(stats.attackSpeedMultiplier)}/${rounded(weapon.reloadTime)}`, text: `${percent(stats.attackSpeedMultiplier)} / ${rounded(weapon.reloadTime)}s` },
    { key: 'armor', label: 'Armor', value: stats.armor, text: stats.armor < 0 ? `${stats.armor} (+${-stats.armor} damage taken)` : `${stats.armor}` },
    { key: 'projectileSpeed', label: 'Shell speed', value: rounded(weapon.projectileSpeed), text: `${rounded(weapon.projectileSpeed)}` },
    { key: 'flightTime', label: 'Shell flight time', value: rounded(weapon.projectileLifetime), text: `${rounded(weapon.projectileLifetime)}s` },
    { key: 'shellSize', label: 'Shell size', value: stats.projectileSizeMultiplier ?? 1, text: percent(stats.projectileSizeMultiplier ?? 1) },
    { key: 'wallBounces', label: 'Wall bounces', value: stats.wallBounces ?? 0, text: `${stats.wallBounces ?? 0}` },
    { key: 'penetration', label: 'Standard pierce', value: weapon.penetration, text: `${weapon.penetration}` },
    { key: 'pellets', label: 'Shells / ammo per volley', value: volley, text: volley },
    { key: 'blast', label: 'Explosion radius', value: blastRadius, text: blastRadius },
    { key: 'heal', label: 'HP per kill', value: stats.killHeal, text: `${stats.killHeal}` },
    { key: 'deathNova', label: 'Death nova damage / radius', value: nova ? `${rounded(nova.minDamage)}–${rounded(nova.maxDamage)} / ${rounded(nova.radius)}px` : 'None', text: nova ? `${rounded(nova.minDamage)}–${rounded(nova.maxDamage)} / ${rounded(nova.radius)}px` : 'None' },
    { key: 'points', label: 'Points earned', value: stats.pointMultiplier ?? 1, text: `×${stats.pointMultiplier ?? 1}` },
    { key: 'incomingDamage', label: 'Damage taken', value: stats.incomingDamageMultiplier ?? 1, text: `×${stats.incomingDamageMultiplier ?? 1}` },
    { key: 'roundIncome', label: 'Round income', value: stats.roundIncome ?? 0, text: `Round ×${stats.roundIncome ?? 0}` },
    { key: 'pointsCap', label: 'Point limit', value: stats.pointsCap ?? Infinity, text: Number.isFinite(stats.pointsCap) ? `${stats.pointsCap}` : 'Unlimited' },
    { key: 'shield', label: 'Pulse shield', value: !!stats.pulseShield, text: stats.pulseShield ? '1s every 3s' : 'None' },
  ];
}

export function previewAbility(levels, owned, id) {
  const before = getStatSnapshot(calculateRogueStats(levels, owned));
  const after = getStatSnapshot(calculateRogueStats(levels, [...owned, id]));
  return after.flatMap((stat, index) => stat.value === before[index].value ? [] : [{
    key: stat.key, label: stat.label, before: before[index].text, after: stat.text,
  }]);
}
