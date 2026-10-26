import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopState } from './helpers/rogue-shop.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { Bullet, Explosion, Tank } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { getRoguePlayerWeapon, getRogueExplosivePayload, getRogueDeathBlast } from '../src/js/40-rogue-balance.js';
import { traceRogueRicochet } from '../src/js/45-rogue-projectiles.js';

function fixture(abilities = []) {
  const world = new RogueWorld({ width: 1200, height: 650, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 30), explosionPool: new Pool(() => new Explosion(), 20), audio: {},
  });
  const state = createShopState(); state.abilities = [...abilities]; state.applyStats(world.player);
  return { world, state, player: world.player };
}
const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
function shot(x, y, vx, vy, bounces = 1) {
  const bullet = new Bullet();
  bullet.init({ x, y, vx, vy, radius: 2, lifetime: 10, wallBounces: bounces });
  return bullet;
}

test('ricochet reflects each edge, preserves speed and life, and consumes one bounce per corner', () => {
  for (const [x, y, vx, vy, expectedX, expectedY] of [
    [90, 50, 20, 0, 86, 50], [10, 50, -20, 0, 14, 50],
    [50, 90, 0, 20, 50, 86], [50, 10, 0, -20, 50, 14],
    [90, 90, 20, 20, 86, 86],
  ]) {
    const bullet = shot(x, y, vx, vy); bullet.update(1); traceRogueRicochet(bullet, bounds);
    assert.equal(bullet.x, expectedX); assert.equal(bullet.y, expectedY);
    assert.equal(bullet.vx, vx === 0 ? 0 : -vx); assert.equal(bullet.vy, vy === 0 ? 0 : -vy);
    assert.equal(bullet.wallBouncesRemaining, 0); assert.equal(bullet.rogueWallStop, false);
    assert.equal(bullet.age, 1); assert.equal(bullet.lifetime, 10);
  }
});

test('fast shells traverse multiple reflected legs and stop at the next wall once bounces run out', () => {
  const bullet = shot(50, 50, 300, 0, 2);
  bullet.update(1); traceRogueRicochet(bullet, bounds);
  assert.equal(bullet.wallBouncesRemaining, 0); assert.equal(bullet.rogueWallStop, true);
  assert.equal(bullet.x, 98); assert.equal(bullet.y, 50);
  assert.equal(bullet.rogueSegments.length, 3);
  const exact = shot(90, 50, 8, 0); exact.update(1); traceRogueRicochet(exact, bounds);
  assert.equal(exact.x, 98); assert.equal(exact.vx, -8); assert.equal(exact.wallBouncesRemaining, 0);
});

test('reflected hit tests follow outbound and returning legs without a false diagonal through the arena', () => {
  const { world } = fixture();
  const bullet = shot(80, 20, 40, 40); bullet.update(1); traceRogueRicochet(bullet, bounds);
  assert.equal(world.bulletSegmentIntersectsCircle(bullet, { x: 90, y: 30, radius: 0 }), true);
  assert.equal(world.bulletSegmentIntersectsCircle(bullet, { x: 84, y: 52, radius: 0 }), true);
  assert.equal(world.bulletSegmentIntersectsCircle(bullet, { x: 78, y: 40, radius: 0 }), false);
});

test('both shell types receive repeated size, damage and bounce effects without changing blast size or nova damage', () => {
  const { world, state, player } = fixture(['oversized', 'oversized', 'ricochet', 'ricochet', 'explosive', 'splitter', 'glass', 'volatile']);
  state.levels.damage = 3; state.applyStats(player);
  const regular = getRoguePlayerWeapon(player), payload = getRogueExplosivePayload(player);
  assert.equal(player.projectileSizeMultiplier, 2.25); assert.equal(player.projectileDamageMultiplier, .25);
  assert.equal(regular.damage, 40 * player.damageMultiplier * .25);
  assert.equal(payload.explosion.maxDamage, 80 * player.damageMultiplier * .25);
  assert.equal(payload.explosion.radius, 90); assert.equal(payload.projectileRadius, 6 * 2.25);
  assert.equal(getRogueDeathBlast(player).maxDamage, 40 * player.damageMultiplier);
  player.tryShoot(world);
  const shells = world.bulletPool.pool.filter(bullet => bullet.active);
  assert.equal(shells.length, 5); assert.equal(player.ammo, 286);
  for (const shell of shells) {
    assert.equal(shell.wallBouncesRemaining, 2);
    assert.equal(shell.radius, shell.explosion ? payload.projectileRadius : regular.projectileRadius);
  }
  world.bulletPool.reset(); state.abilities = []; state.applyStats(player); player.fireCooldown = 0;
  player.tryShoot(world);
  const plain = world.bulletPool.pool.find(bullet => bullet.active);
  assert.equal(plain.wallBounceLimit, 0); assert.equal(plain.wallBouncesRemaining, 0);
  assert.equal(plain.radius, getRoguePlayerWeapon(player).projectileRadius); assert.equal(plain.damage, 43.6);
  assert.equal(plain.rogueSegments, null);
});

test('larger shells really hit a wider target and render at the same increased scale', () => {
  const { world, player } = fixture(['oversized']);
  player.x = 200; player.y = 400; player.turretAngle = 0;
  const fire = player.fireProjectiles.bind(player);
  player.fireProjectiles = (world, profile) => fire(world, { ...profile, randomSpreadRadians: 0 });
  player.tryShoot(world);
  const bullet = world.bulletPool.pool.find(bullet => bullet.active);
  const baseRadius = getRoguePlayerWeapon({}).projectileRadius;
  const target = new Tank(bullet.x + 10, bullet.y + 11 + baseRadius * 1.25, 'red');
  world.tanks.push(target); world.bulletPool.updateAll(1 / 30); world.handleCollisions();
  assert.equal(target.hp, 105);
  bullet.active = true; bullet.sprite = {};
  let drawnSize;
  bullet.draw({ save() {}, restore() {}, translate() {}, rotate() {}, drawImage(...args) { drawnSize = args[3]; } }, { x: 0, y: 0 });
  assert.equal(drawnSize, baseRadius * 1.5 * 16);
});

test('wall contacts keep hit processing active, explode only when spent, and freeze damage after a round', () => {
  for (const ending of [false, true]) {
    const { world, player } = fixture(['ricochet', 'explosive']);
    const bullet = shot(1190, 400, 100, 0);
    bullet.isPlayerBullet = true; bullet.team = 'blue'; bullet.explosion = getRogueExplosivePayload(player).explosion;
    world.bulletPool.pool.push(bullet);
    world.bulletPool.updateAll(.1); world.handleCollisions();
    assert.equal(bullet.active, true); assert.equal(bullet.vx, -100);
    assert.equal(world.explosionPool.pool.filter(item => item.active).length, 0);
    bullet.x = 10; bullet.previousX = 10;
    if (ending) world.updateAfterRound(.2);
    else { world.bulletPool.updateAll(.2); world.handleCollisions(); }
    assert.equal(bullet.active, false);
    assert.equal(world.explosionPool.pool.filter(item => item.active).length, ending ? 0 : 1);
  }
  const { world } = fixture();
  const bullet = shot(1190, 400, 100, 0); bullet.isPlayerBullet = true; bullet.team = 'blue'; bullet.damage = 20; bullet.penRate = 1;
  const enemy = new Tank(1170, 400, 'red'); world.tanks.push(enemy); world.bulletPool.pool.push(bullet);
  world.bulletPool.updateAll(.3); world.handleCollisions();
  assert.equal(enemy.hp, 105); assert.equal(bullet.active, false);
});

test('team weapons and enemy shells retain default size, damage and no bouncing', () => {
  const { world } = fixture(['oversized', 'ricochet']);
  const enemy = new Tank(1190, 400, 'red'); enemy.turretAngle = 0; enemy.tryShoot(world);
  const bullet = world.bulletPool.pool.find(item => item.active);
  assert.equal(bullet.radius, enemy.weapon.projectileRadius); assert.equal(bullet.damage, enemy.weapon.damage);
  assert.equal(bullet.wallBounceLimit, 0);
  world.bulletPool.updateAll(.1); world.handleCollisions(); assert.ok(bullet.x > world.bounds.maxX);
});
