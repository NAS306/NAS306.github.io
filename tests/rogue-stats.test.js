import { createShopState } from './helpers/rogue-shop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueWorld, RoguePlayerTank } from '../src/js/50-rogue-world.js';
import { RogueState, ROUND_SECONDS } from '../src/js/42-rogue-state.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { getRogueRunSummary } from '../src/js/22-rogue-stats.js';
import { supplyRoundAmmo } from '../src/js/20-rogue-ammo.js';
import { Tank, Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';

function fixture(abilities = []) {
  const world = new RogueWorld({ width: 1000, height: 700, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 20), explosionPool: new Pool(() => new Explosion(), 30), audio: {},
  });
  const state = createShopState(); state.abilities = [...abilities]; state.applyStats(world.player);
  return { world, state, player: world.player, stats: world.player.runStats };
}
function hit(world, target, damage, isPlayerBullet = true) {
  world.bulletPool.spawn({ x: target.x, y: target.y, vx: 0, vy: 0, team: isPlayerBullet ? 'blue' : 'red', isPlayerBullet, damage, radius: 3, lifetime: 1, penRate: 1 });
  world.handleCollisions();
}

test('damage taken counts actual HP loss after armor and negative armor, excluding overkill, invalid hits and capacity changes', () => {
  const { player, stats, state } = fixture();
  player.armor = 10; player.takeDamage(25);
  assert.equal(stats.damageTaken, 15);
  player.takeDamage(2); assert.equal(stats.damageTaken, 16);
  player.armor = -4; player.takeDamage(10); assert.equal(stats.damageTaken, 30);
  state.abilities = ['glass']; state.applyStats(player);
  assert.equal(player.hp, 45); assert.equal(stats.damageTaken, 30);
  for (const damage of [0, -1, NaN, Infinity]) player.takeDamage(damage);
  assert.equal(stats.damageTaken, 30);
  player.takeDamage(999); assert.equal(stats.damageTaken, 75);
  player.takeDamage(999); assert.equal(stats.damageTaken, 75);
});

test('ordinary and piercing shells count enemy HP actually removed and exclude enemy fire and already destroyed targets', () => {
  const { world, player, stats } = fixture();
  const first = new Tank(200, 200, 'red'), second = new Tank(300, 200, 'red');
  first.hp = 10; second.armor = 10; world.tanks.push(first, second);
  hit(world, first, 40); assert.equal(stats.damageDealt, 10);
  hit(world, second, 40); assert.equal(stats.damageDealt, 40);
  world.handleCollisions(); assert.equal(stats.damageDealt, 40);
  const third = new Tank(600, 200, 'red'); world.tanks.push(third);
  world.bulletPool.spawn({ x: 300, y: 200, vx: 0, vy: 0, team: 'blue', isPlayerBullet: true, damage: 40, radius: 3, lifetime: 2, penRate: 2 });
  world.handleCollisions();
  const piercer = world.bulletPool.pool.find(bullet => bullet.active);
  piercer.x = piercer.prevX = third.x; piercer.y = piercer.prevY = third.y;
  world.handleCollisions(); assert.equal(stats.damageDealt, 110);
  hit(world, player, 20, false);
  assert.equal(stats.damageTaken, 20); assert.equal(stats.damageDealt, 110);
});

test('payload and chained explosions include every credited enemy hit but enemy friendly fire earns no damage credit', () => {
  const { world, player, stats } = fixture(['volatile', 'glass']);
  player.x = 20; player.y = 20;
  const enemies = [new Tank(400, 400, 'red'), new Tank(420, 400, 'red'), new Tank(440, 400, 'red')];
  enemies.forEach(enemy => { enemy.hp = 30; });
  enemies[0].hp = 10; world.tanks.push(...enemies);
  hit(world, enemies[0], 40);
  assert.ok(enemies.every(enemy => enemy.hp <= 0));
  assert.equal(stats.damageDealt, 70); assert.equal(world.killcount.player, 3);
  const enemy = new Tank(400, 400, 'red'); world.tanks.push(enemy);
  const blast = { minDamage: 50, maxDamage: 50, radius: 100, visualRadius: 80, pushForce: 0 };
  world.causeWeaponExplosion(400, 400, 'red', blast, false);
  assert.equal(stats.damageDealt, 70);
  world.causeWeaponExplosion(400, 400, 'blue', { ...blast, maxDamage: 200, hitAllies: false }, true);
  assert.equal(stats.damageDealt, 145); assert.equal(stats.damageTaken, 0);
});

test('repairs and kill recovery count only HP actually restored and never count max-HP increases or revivals', () => {
  const { world, state, player, stats } = fixture(['recycler']);
  player.takeDamage(30); state.points = 12;
  assert.equal(state.buy('heal', player), true); assert.equal(stats.healing, 30);
  assert.equal(state.buy('heal', player), false); assert.equal(stats.healing, 30);
  state.abilities.push('hull'); state.applyStats(player);
  assert.equal(player.hp, 75); assert.equal(stats.healing, 30);
  assert.equal(state.buy('heal', player), true); assert.equal(stats.healing, 130);
  player.hp = player.maxHP - 2;
  const enemy = new Tank(200, 200, 'red'); enemy.hp = 10; world.tanks.push(enemy);
  hit(world, enemy, 40); assert.equal(stats.healing, 132);
  player.hp = 0;
  const other = new Tank(200, 200, 'red'); other.hp = 10; world.tanks.push(other);
  hit(world, other, 40); assert.equal(player.hp, 0); assert.equal(stats.healing, 132);
});

test('ammo totals include ten-unit payloads and partial volleys, but exclude supplies, purchases and blocked shots', () => {
  const { world, state, player, stats } = fixture(['splitter', 'explosive']);
  state.points = 4; state.buyAmmo(player, 4); supplyRoundAmmo(player, 2);
  assert.equal(player.ammo, 676); assert.equal(stats.ammoSpent, 0);
  player.tryShoot(world); assert.equal(stats.ammoSpent, 14);
  player.tryShoot(world); assert.equal(stats.ammoSpent, 14);
  player.fireCooldown = 0; player.ammo = 3;
  player.tryShoot(world); assert.equal(stats.ammoSpent, 17);
  player.fireCooldown = 0; player.tryShoot(world); assert.equal(stats.ammoSpent, 17);
});

test('earned points and stats persist across rounds and purchases, freeze during the ending scene, and reset for a new run', () => {
  const { world, player, stats, state } = fixture();
  state.phase = 'combat'; state.awardKills(3);
  assert.equal(state.points, 12); assert.equal(state.pointsEarned, 12);
  player.takeDamage(10); player.tryShoot(world);
  state.tick(ROUND_SECONDS, player.hp);
  state.buyAmmo(player, 4); state.buy('speed', player);
  assert.equal(state.points, 3); assert.equal(state.pointsEarned, 12);
  const before = { ...stats };
  world.updateAfterRound(1); world.clearRound(); world.startRound(2);
  assert.deepEqual(stats, before);
  state.phase = 'lost'; state.awardKills(1); assert.equal(state.pointsEarned, 12);
  const fresh = fixture();
  assert.deepEqual(fresh.stats, { damageTaken: 0, damageDealt: 0, healing: 0, ammoSpent: 0 });
  assert.equal(fresh.state.pointsEarned, 0);
  assert.notEqual(new RoguePlayerTank(0, 0).runStats, player.runStats);
});

test('victory and loss show the six requested combat totals including real ammo efficiency', () => {
  const { player, state, stats } = fixture();
  let summary = getRogueRunSummary(state, stats);
  assert.equal(summary.find(row => row.key === 'kills').value, '0');
  Object.assign(stats, { damageTaken: 34.25, damageDealt: 200, healing: 10, ammoSpent: 23 });
  Object.assign(state, { kills: 3, points: 1, pointsEarned: 12 });
  const section = {}, values = Object.fromEntries(summary.map(row => [row.key, {}]));
  const game = { state, world: { player }, runStatValues: values, el: () => section };
  for (const phase of ['shop', 'won', 'lost']) {
    state.phase = phase; RogueGame.prototype.renderRunSummary.call(game);
    assert.equal(section.hidden, phase === 'shop');
    if (phase !== 'shop') {
      assert.equal(Object.keys(values).length, 6);
      assert.equal(values.kills.textContent, '3'); assert.equal(values.damageTaken.textContent, '34.3');
      assert.equal(values.damageDealt.textContent, '200');
      assert.equal(values.healing.textContent, '10'); assert.equal(values.ammoSpent.textContent, '23');
      assert.equal(values.ammoPerKill.textContent, '7.67');
    }
  }
});

test('overall ammo per kill uses total ammo / total kills, and zero kills has no defined efficiency', () => {
  const { state, stats } = fixture();
  assert.equal(getRogueRunSummary(state, stats).find(row => row.key === 'ammoPerKill').value, '—');
  state.kills = 4; stats.ammoSpent = 16;
  assert.equal(getRogueRunSummary(state, stats).find(row => row.key === 'ammoPerKill').value, '4.00');
  assert.ok(getRogueRunSummary(state, stats).every(row => row.key !== 'pointsEarned'));
});
