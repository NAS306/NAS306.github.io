import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueState, getRoundConfig, UPGRADES, ROUND_SECONDS } from '../src/js/42-rogue-state.js';
import { RogueWorld, RoguePlayerTank } from '../src/js/50-rogue-world.js';
import { ROGUE_PLAYER_BASE } from '../src/js/40-rogue-balance.js';
import { Bullet, Explosion, Tank } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { createShopState } from './helpers/rogue-shop.js';

function makeWorld(width = 800) {
  const canvas = { width, height: 600, getContext: () => ({}) };
  const resources = { bulletPool: new Pool(() => new Bullet(), 20), explosionPool: new Pool(() => new Explosion(), 10), audio: {} };
  return new RogueWorld(canvas, resources);
}
const input = { keys: {}, mouse: { canvasX: 400, canvasY: 400, down: false } };
function startRoundWithAbility(state, player = new Tank(0, 0, 'blue', true)) {
  // A fixed non-defensive choice keeps the round/economy fixtures deterministic.
  state.abilityChoices = ['overcharge', 'piercing', 'blast'];
  assert.equal(state.chooseAbility('overcharge', player), true);
  state.rollDice(() => 5.5 / 7); // Pass keeps combat fixtures independent of dice buffs.
  assert.equal(state.startRound(), true);
}

test('40 second rounds carry HP; only completion of round 10 wins', () => {
  assert.equal(ROUND_SECONDS, 40);
  const state = new RogueState(), player = new Tank(0, 0, 'blue', true);
  player.takeDamage(25);
  for (let round = 1; round <= 10; round++) {
    assert.equal(state.round, round);
    if (round === 1) {
      assert.equal(state.phase, 'combat'); assert.deepEqual(state.abilities, []);
      assert.deepEqual(state.abilityChoices, []); assert.equal(state.diceRolled, false);
    } else {
      assert.equal(state.phase, 'shop'); startRoundWithAbility(state, player);
    }
    state.tick(30, player.hp);
    assert.equal(state.phase, 'combat');
    state.tick(ROUND_SECONDS - 30 - 0.1, player.hp);
    assert.equal(state.phase, 'combat');
    state.tick(0.1, player.hp);
    assert.equal(player.hp, 100);
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.startRound(), false);
});

test('lethal damage takes priority over simultaneous round completion', () => {
  const state = new RogueState();
  state.tick(ROUND_SECONDS, 0);
  assert.equal(state.phase, 'lost');
});

test('upgrade prices increase independently including healing; purchases require shop and funds', () => {
  const state = createShopState(), player = new Tank(0, 0, 'blue', true);
  assert.equal(state.buy('speed', player), false);
  state.points = 100;
  assert.equal(state.buy('heal', player), false);
  assert.equal(state.cost('heal'), 5);
  player.takeDamage(30);
  assert.equal(state.buy('heal', player), true);
  assert.equal(player.hp, 125);
  assert.equal(state.cost('heal'), 7);
  assert.equal(state.cost('speed'), 5);
  state.buy('speed', player); state.buy('speed', player);
  assert.equal(state.cost('speed'), 9);
  assert.equal(state.cost('damage'), 5);
  assert.equal(state.points, 83);
  assert.equal(player.speed, ROGUE_PLAYER_BASE.speed * 1.06);
  startRoundWithAbility(state, player);
  assert.equal(state.buy('damage', player), false);
});

test('damage, splash and attack rate use additive base percentages for standard fire and explosive payloads', () => {
  const state = createShopState(), player = new RoguePlayerTank(0, 0);
  state.points = 100;
  for (let i = 0; i < 2; i++) { state.buy('damage', player); state.buy('attackSpeed', player); }
  for (const owned of [[], ['explosive']]) {
    state.abilities = owned; state.applyStats(player); player.fireCooldown = 0;
    const projectiles = [];
    player.tryShoot({ bulletPool: { spawn: p => projectiles.push(p) }, playSpatialAudio() {} });
    assert.equal(projectiles[0].damage, player.weapon.damage * 1.06);
    assert.equal(player.fireCooldown, player.weapon.reloadTime / player.attackSpeedMultiplier);
    if (owned.length) {
      assert.equal(projectiles.length, 2);
      assert.equal(projectiles[1].explosion.maxDamage, 80 * 1.06);
    }
  }
});

test('armor reduces each hit, leaves minimum damage 1, and keeps hit flash', () => {
  const state = createShopState(), player = new Tank(0, 0, 'blue', true);
  state.points = 100;
  state.buy('armor', player); state.buy('armor', player);
  player.takeDamage(25);
  assert.equal(player.hp, 104);
  assert.ok(player.hitFlashRemaining > 0);
  player.takeDamage(2);
  assert.equal(player.hp, 103);
  const normal = new Tank(0, 0, 'red'); normal.takeDamage(0.5);
  assert.equal(normal.hp, 124.5);
});

test('round mixtures change, max enemies grows by six, and no allies or bases are present', () => {
  const world = makeWorld();
  assert.deepEqual([world.bounds.maxX, world.bounds.maxY], [800, 800]);
  assert.equal(world.strongholds.length, 0); assert.equal(world.turrets.length, 0);
  let prior;
  for (let round = 1; round <= 10; round++) {
    const config = getRoundConfig(round);
    assert.equal(config.maxEnemies, round * 6);
    assert.equal(Object.values(config.weights).reduce((a, b) => a + b), 100);
    if (prior) assert.notDeepEqual(config.weights, prior);
    prior = config.weights;
    world.startRound(round);
    assert.equal(world.getAliveTankCount('blue'), 1);
    assert.equal(world.getAliveTankCount('red'), config.maxEnemies);
    if (round === 10) assert.equal(new Set(world.tanks.filter(t => !t.isPlayer).map(t => t.weaponId)).size, 3);
    for (let i = 0; i < 10; i++) world.update(1 / 60, input);
    assert.ok(world.getAliveTankCount('red') <= config.maxEnemies);
  }
});

test('real projectile kills earn exactly four points, clear combat objects and preserve player HP', () => {
  const world = makeWorld(), state = new RogueState();
  world.startRound(1);
  const enemy = world.tanks[1]; enemy.hp = 25;
  world.bulletPool.spawn({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, team: 'blue', isPlayerBullet: true, damage: 25, radius: 3, lifetime: 1, penRate: 1 });
  const before = world.killcount.player;
  world.handleCollisions();
  state.awardKills(world.killcount.player - before);
  assert.equal(state.points, 4); assert.equal(state.kills, 1); assert.equal(state.pointsEarned, 4);
  world.player.takeDamage(10);
  world.clearRound();
  assert.equal(world.player.hp, 115);
  assert.equal(world.tanks.length, 1);
  assert.ok(world.bulletPool.pool.every(p => !p.active));
  assert.ok(world.explosionPool.pool.every(p => !p.active));
  world.resize(1000);
  assert.deepEqual([world.bounds.maxX, world.bounds.maxY], [1000, 1000]);
});

test('new run resets purchases, points, abilities, round and HP', () => {
  const state = new RogueState(), world = makeWorld();
  assert.equal(state.points, 0); assert.equal(world.player.hp, 125);
  assert.equal(state.round, 1); assert.deepEqual(state.abilities, []);
  for (const key of Object.keys(UPGRADES)) assert.equal(state.levels[key], 0);
});

test('one credited kill funds forty ammo while two kills fund a basic upgrade after the round', () => {
  const state = createShopState(), player = new Tank(0, 0, 'blue', true);
  startRoundWithAbility(state, player);
  state.awardKills(1);
  assert.equal(state.points, 4);
  state.awardKills(1); assert.equal(state.points, 8);
  state.tick(ROUND_SECONDS - .1, player.hp);
  assert.equal(state.phase, 'combat');
  state.tick(.1, player.hp);
  assert.equal(state.phase, 'shop');
  assert.equal(state.buy('speed', player), true);
  assert.equal(state.points, 3);
  assert.equal(player.speed, ROGUE_PLAYER_BASE.speed * 1.03);
});

test('a full ten-round run has exactly nine ability choices, nine upgrade phases and nine mandatory dice rolls', () => {
  const state = new RogueState(), player = new RoguePlayerTank(0, 0);
  let shops = 0, dice = 0;
  state.points = 1000;
  assert.equal(state.rollDice(), null);
  assert.equal(state.chooseAbility('turbo', player), false);
  assert.equal(state.buy('speed', player), false);
  assert.equal(state.buyAmmo(player), false);
  for (let round = 1; round <= 10; round++) {
    assert.equal(state.round, round);
    if (round > 1) {
      shops++;
      assert.equal(state.abilityChoices.length, 3);
      assert.equal(state.chooseAbility(state.abilityChoices[0], player), true);
      assert.equal(state.buy('speed', player), true);
      assert.ok(state.rollDice(() => 5.5 / 7)); dice++;
      assert.equal(state.rollDice(), null); assert.equal(state.startRound(), true);
    }
    state.tick(ROUND_SECONDS, player.hp);
  }
  assert.equal(state.phase, 'won'); assert.equal(shops, 9); assert.equal(dice, 9);
  assert.equal(state.abilities.length, 9); assert.equal(state.levels.speed, 9);
});

test('all survival enemy weapons apply gentle round damage growth to the half-damage base, including heavy splash', () => {
  const world = makeWorld();
  world.startRound(10);
  const enemies = world.tanks.filter(tank => !tank.isPlayer);
  const damageMultiplier = .5 * 1.18;
  assert.equal(new Set(enemies.map(tank => tank.weaponId)).size, 3);
  for (const enemy of enemies) {
    world.bulletPool.reset(); enemy.fireCooldown = 0;
    enemy.tryShoot(world);
    const shells = world.bulletPool.pool.filter(shell => shell.active);
    assert.equal(shells.length, enemy.weapon.pelletCount);
    for (const shell of shells) {
      assert.equal(shell.damage, enemy.weapon.damage * damageMultiplier);
      if (enemy.weapon.explosion) {
        assert.equal(shell.explosion.minDamage, enemy.weapon.explosion.minDamage * damageMultiplier);
        assert.equal(shell.explosion.maxDamage, enemy.weapon.explosion.maxDamage * damageMultiplier);
      }
    }
  }
  assert.equal(world.player.damageMultiplier, 1);
  assert.equal(new Tank(0, 0, 'red').damageMultiplier, 1);
});
