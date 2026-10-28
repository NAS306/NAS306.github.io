import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueRunHistory, ROGUE_HISTORY_METRICS, getRogueChartModel } from '../src/js/51-rogue-history.js';
import { RogueState, ROUND_SECONDS } from '../src/js/42-rogue-state.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { healRoguePlayer } from '../src/js/22-rogue-stats.js';
import { Pool } from '../src/js/31-systems.js';
import { formatRoundPreparation } from '../src/js/79-rogue-charts.js';
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
    assert.equal(player.ammo, ammo + (round > 1 ? 300 : 0));
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
  assert.equal(first.combat.kills, 2); assert.equal(first.combat.healing, 0);
  assert.equal(first.combat.ammoSpent, 1); assert.equal(first.combat.ammoPerKill, .5);
  assert.deepEqual(Object.keys(first.combat), ['kills', 'damageDealt', 'damageTaken', 'healing', 'ammoSpent', 'ammoPerKill']);
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
  assert.equal(second.tank.points, 2);
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
  assert.equal(history.rows[9].combat.ammoPerKill, 3);
  assert.equal(ROGUE_HISTORY_METRICS.length, 6);
  assert.ok(history.rows[9].tank.payloadRadius <= 150); assert.ok(history.rows[9].tank.novaRadius <= 110);
  for (const series of getRogueChartModel(history.rows).series) {
    assert.equal(series.points.length, 10);
    assert.ok(series.points.every(point => Number.isFinite(point.x) && (point.y === null || Number.isFinite(point.y))));
  }
});

test('combined chart handles an empty run, all zero values and undefined zero-kill efficiency', () => {
  const { state, player, history } = fixture();
  assert.ok(getRogueChartModel([]).series.every(series => series.points.length === 0));
  history.record(1, 'cleared', state, player);
  const one = getRogueChartModel(history.rows);
  assert.equal(one.series[0].points[0].x, 468);
  assert.equal(one.series[0].points[0].y, 240);
  assert.equal(new Set(one.ticks.map(tick => tick.value.toFixed(1))).size, one.ticks.length);
  assert.equal(one.series.find(series => series.key === 'ammoPerKill').points[0].y, null);
  assert.deepEqual(one.ticks.map(tick => tick.value), [0, 25, 50, 75, 100]);
  assert.ok(one.series.every(series => !series.key.includes('hp')));
});

test('each series normalizes against its own peak while preserving raw values and gaps', () => {
  const row = (round, combat) => ({ round, outcome: 'cleared', combat });
  const model = getRogueChartModel([
    row(1, { kills: 1, damageDealt: 10000, damageTaken: 10, healing: 2, ammoSpent: 10, ammoPerKill: 10 }),
    row(2, { kills: 0, damageDealt: 0, damageTaken: 0, healing: 0, ammoSpent: 0, ammoPerKill: null }),
    row(3, { kills: 3, damageDealt: 5000, damageTaken: 5, healing: 1, ammoSpent: 6, ammoPerKill: 2 }),
  ]);
  const series = key => model.series.find(item => item.key === key);
  assert.equal(series('damageDealt').peak, 10000);
  assert.deepEqual(series('damageDealt').points.map(point => point.percent), [100, 0, 50]);
  assert.deepEqual(series('ammoPerKill').points.map(point => point.percent), [100, null, 20]);
  assert.equal(series('ammoPerKill').points[1].y, null);
  assert.equal(series('damageDealt').points[2].value, 5000);
  assert.equal(series('kills').points[2].percent, 100);
  assert.equal(series('kills').points[0].x, 60); assert.equal(series('kills').points[2].x, 876);
});

test('round preparation records only that round’s purchases and chosen ability before selections reset', () => {
  const { state, player, history } = fixture();
  state.tick(ROUND_SECONDS, player.hp); history.record(1, 'cleared', state, player);
  assert.match(formatRoundPreparation(history.rows[0]), /Upgrades: none\nAbility: none \(starting round\)/);
  state.points = 100; state.abilityChoices = ['hull']; state.chooseAbility('hull', player);
  state.buy('damage', player); state.buy('damage', player); state.buy('speed', player); state.buy('heal', player);
  state.rollDice(() => 5.5 / 7); state.startRound();
  state.tick(ROUND_SECONDS, player.hp); history.record(2, 'cleared', state, player);
  const tooltip = formatRoundPreparation(history.rows[1]);
  assert.match(tooltip, /Damage \+2 \(Lv.2\)/); assert.match(tooltip, /Repair \+1 \(Lv.1\)/);
  assert.match(tooltip, /Speed \+1 \(Lv.1\)/); assert.match(tooltip, /Reinforced Hull \(Lv.1\)/);
  assert.equal(state.selectedAbility, null);
  state.buy('damage', player); state.rollDice(() => 5.5 / 7); state.startRound();
  state.tick(ROUND_SECONDS, player.hp); history.record(3, 'cleared', state, player);
  assert.match(formatRoundPreparation(history.rows[2]), /Damage \+1 \(Lv.3\)/);
  assert.match(formatRoundPreparation(history.rows[2]), /Ability: skipped/);
  assert.equal(formatRoundPreparation(history.rows[1]), tooltip);
});

test('round tooltips distinguish Recalibration reductions, removals and forfeited actions', () => {
  const { state, player, history } = fixture(); state.abilities = ['hull', 'hull']; state.applyStats(player);
  state.tick(ROUND_SECONDS, player.hp);
  for (const round of [2, 3]) {
    state.abilityChoices = ['recalibrate']; state.chooseAbility('recalibrate', player); state.removeAbility('hull', player);
    state.rollDice(() => 5.5 / 7); state.startRound(); state.tick(ROUND_SECONDS, player.hp);
    history.record(round, 'cleared', state, player);
  }
  assert.match(formatRoundPreparation(history.rows[0]), /Recalibration\nReduced: Reinforced Hull Lv.2 → Lv.1/);
  assert.match(formatRoundPreparation(history.rows[1]), /Reinforced Hull Lv.1 → removed/);
  state.abilities = ['turbo']; state.abilityChoices = ['recalibrate']; state.chooseAbility('recalibrate', player);
  state.rollDice(() => 5.5 / 7); state.startRound(); state.tick(ROUND_SECONDS, 0);
  history.record(4, 'lost', state, player);
  assert.match(formatRoundPreparation(history.rows[2]), /Ability: skipped/);
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
  assert.equal(history.rows[0].combat.kills, 3); assert.equal(player.runStats.healing, 5);
  assert.equal(history.rows[0].tank.ammo, 300);
  world.startRound(2); assert.equal(player.ammo, 600);
  assert.equal(history.rows[0].tank.ammo, 300);
});
