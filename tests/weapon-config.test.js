import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WEAPON_ID,
  PLAYER_WEAPON_IDS,
  getNextPlayerWeaponId,
  getProjectileAngles,
  resolveWeaponProfile,
  validateWeaponProfile,
} from "../src/js/10-weapon-config.js";

test("player weapons cycle predictably in every scenario", () => {
  assert.deepEqual(PLAYER_WEAPON_IDS, ["standard", "heavy", "scatter"]);
  assert.equal(getNextPlayerWeaponId("standard"), "heavy");
  assert.equal(getNextPlayerWeaponId("heavy"), "scatter");
  assert.equal(getNextPlayerWeaponId("scatter"), "standard");
  assert.equal(getNextPlayerWeaponId("unknown"), "standard");
});

test("standard weapon profile preserves the original cannon values", () => {
  const weapon = resolveWeaponProfile(DEFAULT_WEAPON_ID);
  assert.equal(weapon.title, "Standard Cannon");
  assert.equal(weapon.fireMode, "Single shot");
  assert.ok(weapon.description.length > 0);
  assert.equal(weapon.pelletCount, 1);
  assert.equal(weapon.damage, 25);
  assert.equal(weapon.reloadTime, 0.5);
  assert.equal(weapon.projectileSpeed, 450);
  assert.equal(weapon.aiLeadSpeed, 400);
  assert.equal(weapon.projectileLifetime, 1.5);
  assert.equal(weapon.penetration, 1);
  assert.equal(weapon.fireRange, 500);
});

test("weapon profiles reject invalid combat values", () => {
  assert.throws(
    () => validateWeaponProfile({
      ...resolveWeaponProfile(),
      id: "invalid",
      reloadTime: 0,
    }),
    /invalid reloadTime/,
  );
  assert.throws(() => resolveWeaponProfile("missing"), /Unknown weapon profile/);
});

test("multi-pellet profiles produce uniformly spaced projectile angles", () => {
  const profile = {
    ...resolveWeaponProfile(),
    id: "test_scatter",
    pelletCount: 5,
    randomSpreadRadians: 0,
    volleySpreadRadians: Math.PI / 3,
  };
  const angles = getProjectileAngles(profile, 0);
  assert.equal(angles.length, 5);
  const steps = angles.slice(1).map((angle, index) => angle - angles[index]);
  for (const step of steps) assert.ok(Math.abs(step - Math.PI / 12) < 1e-12);
  assert.ok(Math.abs(angles[0] + Math.PI / 6) < 1e-12);
  assert.ok(Math.abs(angles.at(-1) - Math.PI / 6) < 1e-12);
});

test("heavy cannon trades a three-times-longer reload for splash damage", () => {
  const standard = resolveWeaponProfile("standard");
  const heavy = resolveWeaponProfile("heavy");
  assert.equal(heavy.tankShape, "square");
  assert.equal(heavy.reloadTime, standard.reloadTime * 3);
  assert.ok(heavy.projectileSpeed > 0);
  assert.equal(heavy.explosion.radius, 90);
  assert.equal(heavy.damage, 25);
  assert.equal(heavy.explosion.maxDamage, 30);
  assert.ok(heavy.explosion.maxDamage < 50);
});

test("scatter cannon fires three standard shells at 15-degree intervals", () => {
  const standard = resolveWeaponProfile("standard");
  const scatter = resolveWeaponProfile("scatter");
  const angles = getProjectileAngles(scatter, 0);
  assert.equal(scatter.tankShape, "triangle");
  assert.equal(scatter.reloadTime, standard.reloadTime * 4);
  assert.equal(scatter.damage, standard.damage);
  assert.equal(angles.length, 3);
  assert.ok(Math.abs(angles[0] + Math.PI / 12) < 1e-12);
  assert.ok(Math.abs(angles[1]) < 1e-12);
  assert.ok(Math.abs(angles[2] - Math.PI / 12) < 1e-12);
});
