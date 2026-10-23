import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueRunHistory, ROGUE_HISTORY_METRICS, getRogueChartModel } from '../src/js/51-rogue-history.js';
import { RogueState, ROUND_SECONDS } from '../src/js/42-rogue-state.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { healRoguePlayer } from '../src/js/22-rogue-stats.js';
import { Pool } from '../src/js/31-systems.js';
import { Bullet, Explosion } from '../src/js/30-entities.js';

function fixture() {
  const canvas = { width: 1440, height: 900, getContext: () => ({}) };
  const world = new RogueWorld(canvas, { bulletPool: new Pool(() => new Bullet(), 50), explosionPool: new Pool(() => new Explosion(), 50), audio: {} });
  const state = new RogueState(); state.applyStats(world.player);
  return { state, world, player: world.player, history: new RogueRunHistory() };
}

test('all ten round starts recenter before enemy spawn, retain HP, stats and carried ammo, including after resize', () => {
  const { world, player } = fixture();
  player.hp = 73; player.armor = -12; player.speed = 350;
  const spawn = world.spawnEnemy.bind(world);
  world.spawnEnemy = () => {
    assert.equal(player.x, world.bounds.maxX / 2); assert.equal(player.y, world.bounds.maxY / 2);
    spawn();
  };
  for (let round = 1; round <= 10; round++) {
    if (round === 5) world.resize(1920);
    player.x = 30; player.y = 90; player.vx = 100; player.vy = 70;
    player.rogueMotionVX = 100; player.rogueMotionVY = 70;
    player.ammo -= 20;
    const ammo = player.ammo;
    world.startRound(round);
    assert.equal(player.vx, 0); assert.equal(player.vy, 0);
    assert.equal(player.rogueMotionVX, 0); assert.equal(player.rogueMotionVY, 0);
    assert.equal(player.hp, 73); assert.equal(player.armor, -12); assert.equal(player.speed, 350);
    assert.equal(player.ammo, ammo + (round > 1 ? 150 : 0));
    assert.equal(world.camera.y, world.player.y - world.canvas.height / 2 + (world.topHudReserve - world.bottomHudReserve) / -2);
  }
});

test('per-round totals reconcile with final totals, including shop repairs, purchases and a failed round with no kills', () => {
  const { world, player, state, history } = fixture();
  world.startRound(1); player.takeDamage(25); player.tryShoot(world); state.awardKills(2);
  player.runStats.damageDealt = 180;
  state.tick(ROUND_SECONDS, player.hp);
  assert.equal(history.record(1, 'cleared', state, player), true);
  const first = history.rows[0];
  assert.equal(first.combat.kills, 2); assert.equal(first.combat.pointsEarned, 8);
  assert.equal(first.combat.ammoSpent, 1); assert.equal(first.combat.ammoPerKill, .5);
  assert.equal(first.tank.ammo, 299); assert.equal(first.tank.hp, 100);
  assert.equal(state.buy('heal', player), true); assert.equal(state.points, 3);
  assert.equal(state.buyAmmo(player, 1), true);
  world.startRound(2); player.fireCooldown = 0; player.tryShoot(world);
  player.takeDamage(10000); state.phase = 'combat'; state.tick(1, player.hp);
  history.record(2, 'lost', state, player);
  const second = history.rows[1];
  assert.equal(second.outcome, 'lost'); assert.equal(second.tank.hp, 0);
  assert.equal(second.combat.healing, 25); assert.equal(second.combat.damageTaken, 125);
  assert.equal(second.combat.ammoSpent, 1); assert.equal(second.combat.ammoPerKill, null);
  assert.equal(second.combat.pointsEarned, 0); assert.equal(second.tank.points, 2);
  assert.equal(first.tank.hp, 100); assert.equal(first.tank.ammo, 299);
  for (const key of ['damageTaken', 'damageDealt', 'healing', 'ammoSpent']) {
    assert.equal(first.combat[key] + second.combat[key], player.runStats[key]);
  }
  assert.equal(history.record(2, 'lost', state, player), false);
  assert.equal(history.rows.length, 2); assert.deepEqual(new RogueRunHistory().rows, []);
});

test('ten snapshots use actual modified weapon stats and capped explosions without mutating past rounds', () => {
  const { state, player, history } = fixture();
  for (let round = 1; round <= 10; round++) {
    state.phase = 'combat'; state.awardKills(round);
    player.runStats.ammoSpent += round * 3;
    state.abilities = Array(round).fill('explosive').concat(Array(round).fill('blast'), ['volatile']);
    state.applyStats(player);
    history.record(round, 'cleared', state, player);
  }
  assert.equal(history.rows.length, 10);
  assert.equal(history.rows[0].combat.kills, 1); assert.equal(history.rows[9].combat.kills, 10);
  assert.equal(history.rows[9].combat.pointsEarned, 40);
  assert.equal(history.rows[9].combat.ammoPerKill, 3);
  assert.ok(history.rows[9].tank.payloadRadius <= 150); assert.ok(history.rows[9].tank.novaRadius <= 110);
  for (const metric of ROGUE_HISTORY_METRICS) {
    const model = getRogueChartModel(history.rows, metric);
    assert.equal(model.points.length, 10);
    assert.ok(model.points.every(point => Number.isFinite(point.x) && (point.y === null || Number.isFinite(point.y))));
  }
});

test('chart geometry handles an empty run, a single zero, inactive abilities, gaps and negative armor', () => {
  const { state, player, history } = fixture();
  const metric = key => ROGUE_HISTORY_METRICS.find(item => item.key === key);
  assert.deepEqual(getRogueChartModel([], metric('kills')).points, []);
  history.record(1, 'cleared', state, player);
  const one = getRogueChartModel(history.rows, metric('kills'));
  assert.equal(one.points[0].x, 355); assert.ok(Number.isFinite(one.points[0].y));
  assert.equal(new Set(one.ticks.map(tick => tick.value.toFixed(1))).size, one.ticks.length);
  assert.equal(getRogueChartModel(history.rows, metric('ammoPerKill')).points[0].y, null);
  assert.equal(getRogueChartModel(history.rows, metric('tank-payloadRadius')).points[0].y, null);
  player.armor = -40; state.kills = 2; player.runStats.ammoSpent = 10; history.record(2, 'cleared', state, player);
  player.armor = 10; history.record(3, 'lost', state, player);
  const armor = getRogueChartModel(history.rows, metric('tank-armor'));
  assert.ok(armor.points[1].y > armor.points[0].y); assert.ok(armor.points[2].y < armor.points[0].y);
  assert.ok(armor.ticks[0].value < -40);
  assert.deepEqual(getRogueChartModel(history.rows, metric('ammoPerKill')).points.map(point => point.value), [null, 5, null]);
});

test('the transition captures final stats once before slow motion and the next supply', () => {
  const { state, player, history, world } = fixture();
  state.awardKills(3); player.takeDamage(20); healRoguePlayer(player, 5);
  state.tick(ROUND_SECONDS, player.hp);
  const game = { state, world, history, root: { classList: { add() {} } },
    el: () => ({ classList: { toggle() {} } }), advanceRoundTransition() {} };
  RogueGame.prototype.beginRoundTransition.call(game);
  RogueGame.prototype.beginRoundTransition.call(game);
  assert.equal(history.rows.length, 1); assert.equal(history.rows[0].round, 1);
  assert.equal(history.rows[0].combat.kills, 3); assert.equal(history.rows[0].combat.healing, 5);
  assert.equal(history.rows[0].tank.ammo, 300);
  world.startRound(2); assert.equal(player.ammo, 450);
  assert.equal(history.rows[0].tank.ammo, 300);
});
