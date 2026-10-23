import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueWorld, RoguePlayerTank } from '../src/js/50-rogue-world.js';
import { resolveRoguePlayerWeapon } from '../src/js/40-rogue-balance.js';
import { getRoundConfig, ROUND_COUNT, RogueState } from '../src/js/42-rogue-state.js';
import { Tank, Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { resolveWeaponProfile, validateWeaponProfile } from '../src/js/10-weapon-config.js';

function makeWorld() {
  return new RogueWorld({ width: 800, height: 600, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 30),
    explosionPool: new Pool(() => new Explosion(), 20), audio: {},
  });
}

test('survival players move farther and sustain faster standard fire while team weapon profiles stay unchanged', () => {
  const input = { keys: { d: true }, mouse: { canvasX: 700, canvasY: 400, down: true } };
  const run = player => {
    let shots = 0;
    const world = {
      bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 2000 }, camera: { x: 0, y: 0 },
      bulletPool: { spawn() { shots++; } }, playSpatialAudio() {},
    };
    for (let i = 0; i < 156; i++) player.update(1 / 120, world, input);
    return { shots, distance: player.x - 100 };
  };
  const team = run(new Tank(100, 400, 'blue', true));
  const survival = run(new RoguePlayerTank(100, 400));
  assert.ok(Math.abs(team.distance - 125 * 1.3) < 1e-8);
  assert.ok(Math.abs(survival.distance - 200 * 1.3) < 1e-8);
  assert.ok(survival.shots > team.shots);
  validateWeaponProfile(resolveRoguePlayerWeapon());
  assert.notEqual(resolveRoguePlayerWeapon(), resolveWeaponProfile('standard'));
  const teamPlayer = new Tank(0, 0, 'blue', true);
  assert.equal(teamPlayer.speed, 125);
  assert.equal(teamPlayer.weapon.damage, 25);
  assert.equal(teamPlayer.reloadTime, .5);
});

test('unupgraded standard fire destroys a fresh survival enemy in three hits within 0.8 seconds at 220px', () => {
  const world = makeWorld(); world.startRound(1);
  const { player } = world, enemy = world.tanks[1];
  player.x = 100; player.y = 400;
  enemy.x = 320; enemy.y = 400;
  world.tanks = [player, enemy]; world.camera = { x: 0, y: 0 };
  const fire = player.fireProjectiles.bind(player);
  player.fireProjectiles = (world, profile) => fire(world, { ...profile, randomSpreadRadians: 0 });
  const input = { keys: {}, mouse: { canvasX: enemy.x, canvasY: enemy.y, down: true } };
  const damageTaken = [];
  const takeDamage = enemy.takeDamage.bind(enemy);
  enemy.takeDamage = damage => { damageTaken.push(damage); takeDamage(damage); };
  assert.equal(enemy.hp, 90);
  for (let i = 0; i < 96 && enemy.hp > 0; i++) {
    player.update(1 / 120, world, input);
    world.bulletPool.updateAll(1 / 120); world.handleCollisions();
  }
  assert.ok(enemy.hp <= 0);
  assert.deepEqual(damageTaken, [40, 40, 40]);
  assert.equal(world.killcount.player, 1);
});

test('an explosive payload damages a close group, falls off with distance and credits only actual kills', () => {
  const world = makeWorld(); world.startRound(1);
  const { player } = world, enemies = world.tanks.slice(1, 4);
  player.x = 100; player.y = 400; player.turretAngle = 0;
  const state = new RogueState(); state.abilities = ['explosive']; state.applyStats(player);
  const fire = player.fireProjectiles.bind(player);
  player.fireProjectiles = (world, profile) => fire(world, { ...profile, randomSpreadRadians: 0 });
  enemies.forEach((enemy, index) => { enemy.x = 400; enemy.y = 365 + index * 35; });
  world.tanks = [player, ...enemies];
  player.tryShoot(world);
  assert.equal(player.ammo, 289);
  for (let i = 0; i < 60; i++) {
    world.bulletPool.updateAll(1 / 120); world.handleCollisions();
  }
  assert.ok(enemies.every(enemy => enemy.hp < enemy.maxHP));
  assert.ok(enemies[1].hp <= 0);
  assert.ok(enemies[0].hp > 0 && enemies[2].hp > 0);
  assert.equal(world.killcount.player, 1);
  assert.equal(player.hp, 125);
});

test('final-round enemy replacements use the faster interval without exceeding the cap or losing movement and fire-rate reductions', () => {
  const world = makeWorld(); world.startRound(10);
  for (const enemy of world.tanks.slice(1)) {
    assert.equal(enemy.hp, 117); assert.equal(enemy.maxHP, 117);
    assert.equal(enemy.speed, 50);
    assert.equal(enemy.attackSpeedMultiplier, .5); assert.equal(enemy.damageMultiplier, .59);
    // Keep this test focused on spawning; combat is covered above.
    enemy.update = () => {};
  }
  const spawnEnemy = world.spawnEnemy.bind(world);
  world.spawnEnemy = () => { spawnEnemy(); world.tanks.at(-1).update = () => {}; };
  world.tanks.splice(1, 3);
  const initial = world.getAliveTankCount('red');
  const input = { keys: {}, mouse: { canvasX: 400, canvasY: 400, down: false } };
  world.update(.01, input);
  assert.equal(world.getAliveTankCount('red'), initial + 1);
  world.update(world.roundConfig.replacementInterval - .01, input);
  assert.equal(world.getAliveTankCount('red'), initial + 1);
  world.update(.02, input);
  assert.equal(world.getAliveTankCount('red'), initial + 2);
  for (let i = 0; i < 10; i++) world.update(world.roundConfig.replacementInterval, input);
  assert.equal(world.getAliveTankCount('red'), world.roundConfig.maxEnemies);
});

test('each round increases enemy density strongly but HP and damage gently, and every spawn uses those round values', () => {
  const world = makeWorld();
  let previous;
  for (let round = 1; round <= ROUND_COUNT; round++) {
    const config = getRoundConfig(round);
    assert.equal(config.enemyMaxHP, 90 + (round - 1) * 3);
    assert.ok(Math.abs(config.enemyDamageMultiplier - .5 * (1 + (round - 1) * .02)) < 1e-10);
    if (previous) {
      assert.equal(config.maxEnemies - previous.maxEnemies, 6);
      assert.ok(config.replacementInterval < previous.replacementInterval);
    }
    world.startRound(round);
    for (const enemy of world.tanks.slice(1)) {
      assert.equal(enemy.maxHP, config.enemyMaxHP);
      assert.equal(enemy.damageMultiplier, config.enemyDamageMultiplier);
    }
    previous = config;
  }
  const first = getRoundConfig(1), last = getRoundConfig(10);
  assert.equal(last.maxEnemies / first.maxEnemies, 10);
  assert.ok(Math.abs(first.replacementInterval / last.replacementInterval - 5) < 1e-10);
  assert.ok(last.enemyMaxHP / first.enemyMaxHP <= 1.3);
  assert.ok(last.enemyDamageMultiplier / first.enemyDamageMultiplier <= 1.2);
  world.player.hp = 80; world.startRound(1);
  assert.equal(world.player.hp, 80);
  assert.equal(world.tanks[1].hp, 90);
  assert.equal(world.tanks[1].damageMultiplier, .5);
  assert.throws(() => getRoundConfig(0), RangeError);
  assert.throws(() => getRoundConfig(11), RangeError);
});

test('under continuous kills the final round actually spawns over four times as many enemies as round one', () => {
  const simulate = round => {
    const world = makeWorld(); world.startRound(round);
    let spawned = 0;
    const spawnEnemy = world.spawnEnemy.bind(world);
    world.spawnEnemy = () => { spawned++; spawnEnemy(); world.tanks.at(-1).update = () => {}; };
    const input = { keys: {}, mouse: { canvasX: 400, canvasY: 400, down: false } };
    for (let step = 0; step < 300; step++) {
      world.tanks = [world.player];
      world.update(1 / 60, input);
    }
    return spawned;
  };
  assert.ok(simulate(10) > simulate(1) * 4);
});
