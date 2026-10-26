const REQUIRED_POSITIVE_FIELDS = [
  "pelletCount",
  "damage",
  "reloadTime",
  "projectileSpeed",
  "aiLeadSpeed",
  "projectileLifetime",
  "projectileRadius",
  "penetration",
  "fireRange",
];

export const DEFAULT_WEAPON_ID = "standard";
export const PLAYER_WEAPON_IDS = Object.freeze(["standard", "heavy", "scatter"]);

export function getNextPlayerWeaponId(currentWeaponId) {
  const currentIndex = PLAYER_WEAPON_IDS.indexOf(currentWeaponId);
  if (currentIndex < 0) return PLAYER_WEAPON_IDS[0];
  return PLAYER_WEAPON_IDS[(currentIndex + 1) % PLAYER_WEAPON_IDS.length];
}

const WEAPON_DEFINITIONS = {
  standard: {
    title: "Standard Cannon",
    fireMode: "Single shot",
    description: "Balanced cannon for accurate sustained fire.",
    tankShape: "circle",
    pelletCount: 1,
    damage: 25,
    reloadTime: 0.5,
    projectileSpeed: 450,
    aiLeadSpeed: 400,
    projectileLifetime: 1.5,
    projectileRadius: 3,
    penetration: 1,
    fireRange: 500,
    randomSpreadRadians: Math.PI / 36,
    volleySpreadRadians: Math.PI / 10,
  },
  heavy: {
    title: "Heavy Cannon",
    fireMode: "Explosive shell",
    description: "Explosive shell with splash damage and strong knockback.",
    tankShape: "square",
    pelletCount: 1,
    damage: 25,
    reloadTime: 3,
    projectileSpeed: 600,
    aiLeadSpeed: 600,
    projectileLifetime: 0.8,
    projectileRadius: 6,
    penetration: 1,
    fireRange: 650,
    randomSpreadRadians: Math.PI / 72,
    volleySpreadRadians: 0,
    explosion: {
      radius: 90,
      minDamage: 25,
      maxDamage: 75,
      pushForce: 450,
      visualRadius: 70,
    },
  },
  scatter: {
    title: "Scatter Cannon",
    fireMode: "3-shot / 30° spread",
    description: "Three standard shells cover a wide frontal arc.",
    tankShape: "triangle",
    pelletCount: 3,
    damage: 25,
    reloadTime: 1.5,
    projectileSpeed: 450,
    aiLeadSpeed: 400,
    projectileLifetime: 1.5,
    projectileRadius: 3,
    penetration: 1,
    fireRange: 500,
    randomSpreadRadians: 0,
    volleySpreadRadians: Math.PI / 6,
  },
};

export const WEAPON_PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(WEAPON_DEFINITIONS).map(([id, definition]) => [
      id,
      Object.freeze({
        id,
        ...definition,
        explosion: definition.explosion
          ? Object.freeze({ ...definition.explosion })
          : null,
      }),
    ]),
  ),
);

export function resolveWeaponProfile(weaponId = DEFAULT_WEAPON_ID) {
  const profile = WEAPON_PROFILES[weaponId];
  if (!profile) throw new Error(`Unknown weapon profile: ${weaponId}`);
  validateWeaponProfile(profile);
  return profile;
}

export function validateWeaponProfile(profile) {
  if (!profile || typeof profile.id !== "string" || profile.id.trim() === "") {
    throw new Error("Weapon profile requires an id");
  }
  if (typeof profile.title !== "string" || profile.title.trim() === "") {
    throw new Error(`Weapon ${profile.id} requires a title`);
  }
  for (const field of ["fireMode", "description"]) {
    if (typeof profile[field] !== "string" || profile[field].trim() === "") {
      throw new Error(`Weapon ${profile.id} requires ${field}`);
    }
  }
  if (!new Set(["circle", "square", "triangle"]).has(profile.tankShape)) {
    throw new Error(`Weapon ${profile.id} has invalid tankShape`);
  }
  for (const field of REQUIRED_POSITIVE_FIELDS) {
    if (!Number.isFinite(profile[field]) || profile[field] <= 0) {
      throw new Error(`Weapon ${profile.id} has invalid ${field}`);
    }
  }
  if (!Number.isInteger(profile.pelletCount)) {
    throw new Error(`Weapon ${profile.id} pelletCount must be an integer`);
  }
  for (const field of ["randomSpreadRadians", "volleySpreadRadians"]) {
    if (!Number.isFinite(profile[field]) || profile[field] < 0) {
      throw new Error(`Weapon ${profile.id} has invalid ${field}`);
    }
  }
  if (profile.explosion) {
    for (const field of ["radius", "minDamage", "maxDamage", "pushForce", "visualRadius"]) {
      if (!Number.isFinite(profile.explosion[field]) || profile.explosion[field] <= 0) {
        throw new Error(`Weapon ${profile.id} has invalid explosion ${field}`);
      }
    }
    if (profile.explosion.minDamage > profile.explosion.maxDamage) {
      throw new Error(`Weapon ${profile.id} has inverted explosion damage`);
    }
  }
  return profile;
}

// Used by combat and UI previews so displayed values match the fired projectiles.
export function getModifiedWeaponProfile(profile, modifiers = {}) {
  const damage = (modifiers.damageMultiplier ?? 1) * (modifiers.projectileDamageMultiplier ?? 1);
  const speed = modifiers.projectileSpeedMultiplier ?? 1;
  const lifetime = modifiers.projectileLifetimeMultiplier ?? 1;
  const blast = modifiers.explosionRadiusMultiplier ?? 1;
  const extra = modifiers.extraProjectiles ?? 0;
  return {
    ...profile,
    damage: profile.damage * damage,
    reloadTime: profile.reloadTime / (modifiers.attackSpeedMultiplier ?? 1),
    projectileSpeed: profile.projectileSpeed * speed,
    projectileRadius: profile.projectileRadius * (modifiers.projectileSizeMultiplier ?? 1),
    wallBounces: modifiers.wallBounces ?? 0,
    fireRange: profile.fireRange * speed * lifetime,
    projectileLifetime: profile.projectileLifetime * lifetime,
    pelletCount: profile.pelletCount + extra,
    volleySpreadRadians: extra > 0 && profile.pelletCount === 1
      ? Math.PI / 12 : profile.volleySpreadRadians,
    penetration: profile.penetration + (profile.explosion ? 0 : (modifiers.penetrationBonus ?? 0)),
    explosion: profile.explosion ? {
      ...profile.explosion,
      minDamage: profile.explosion.minDamage * damage,
      maxDamage: profile.explosion.maxDamage * damage,
      radius: profile.explosion.radius * blast,
      visualRadius: profile.explosion.visualRadius * blast,
    } : null,
  };
}

export function getProjectileAngles(profile, baseAngle, random = Math.random) {
  validateWeaponProfile(profile);
  if (profile.pelletCount === 1) {
    const spread = (random() * 2 - 1) * profile.randomSpreadRadians;
    return [baseAngle + spread];
  }
  const startAngle = baseAngle - profile.volleySpreadRadians / 2;
  const step = profile.volleySpreadRadians / (profile.pelletCount - 1);
  return Array.from(
    { length: profile.pelletCount },
    (_, index) => startAngle + step * index,
  );
}
