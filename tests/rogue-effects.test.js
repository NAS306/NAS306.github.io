import test from 'node:test';
import assert from 'node:assert/strict';
import { getRogueCountdown, RogueCombatEffects } from '../src/js/43-rogue-effects.js';
import { RogueWorld, RoguePlayerTank } from '../src/js/50-rogue-world.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';

function makeWorld() {
  return new RogueWorld({ width: 800, height: 600, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 20),
    explosionPool: new Pool(() => new Explosion(), 10), audio: {},
  });
}

test('last-five-second warning has one smooth pulse per second and progressively larger, redder timer', () => {
  let previousScale = 1, previousHue = 43, previousOpacity = 0;
  for (let second = 5; second >= 1; second--) {
    const boundary = getRogueCountdown(second, true);
    const peak = getRogueCountdown(second - .5, true);
    assert.equal(boundary.active, true);
    assert.ok(boundary.edgeOpacity < 1e-10);
    assert.ok(peak.edgeOpacity > getRogueCountdown(second - .25, true).edgeOpacity);
    assert.ok(peak.edgeOpacity > getRogueCountdown(second - .75, true).edgeOpacity);
    assert.ok(peak.scale > previousScale);
    assert.ok(peak.hue < previousHue);
    assert.ok(peak.edgeOpacity > previousOpacity);
    assert.ok(peak.scale <= 1.5); assert.ok(peak.edgeOpacity <= .7);
    previousScale = peak.scale; previousHue = peak.hue; previousOpacity = peak.edgeOpacity;
    const nearBoundary = getRogueCountdown(second - 1e-5, true);
    assert.ok(Math.abs(nearBoundary.scale - boundary.scale) < .0001);
    assert.ok(nearBoundary.edgeOpacity < .0001);
  }
});

test('warning depends only on remaining round time and clears in shops, results and new rounds', () => {
  const inactive = { active: false, urgency: 0, edgeOpacity: 0, scale: 1, hue: 42 };
  for (const remaining of [40, 5.01, 0, -1]) assert.deepEqual(getRogueCountdown(remaining, true), inactive);
  assert.deepEqual(getRogueCountdown(3.5, false), inactive);
  // Re-rendering a paused round cannot advance the effect independently.
  assert.deepEqual(getRogueCountdown(2.4, true), getRogueCountdown(2.4, true));
});

test('combat shake is bounded, heavy recoil is stronger and repeated shots cannot sustain a damage-sized shake', () => {
  const effects = new RogueCombatEffects();
  effects.shoot('standard'); const standard = effects.strength;
  effects.reset(); effects.shoot('heavy');
  assert.ok(effects.strength > standard);
  effects.damage(10000);
  assert.equal(effects.strength, 8);
  for (let i = 0; i < 30; i++) { effects.shoot('standard'); effects.update(1 / 60); }
  assert.ok(effects.strength < 1);
  assert.ok(Math.abs(effects.offsetX) <= 8); assert.ok(Math.abs(effects.offsetY) <= 8);
  effects.update(.5);
  assert.equal(effects.remaining, 0); assert.equal(effects.damageFlash, 0);
  assert.equal(effects.offsetX, 0); assert.equal(effects.offsetY, 0);
});

test('shake decay is consistent across update rates', () => {
  const simulate = rate => {
    const effects = new RogueCombatEffects(); effects.damage(25);
    for (let i = 0; i < rate / 10; i++) effects.update(1 / rate);
    return effects;
  };
  const slow = simulate(30), fast = simulate(120);
  for (const key of ['strength', 'remaining', 'offsetX', 'offsetY', 'damageFlash']) {
    assert.ok(Math.abs(slow[key] - fast[key]) < 1e-8, key);
  }
});

test('real player firing, credited kills and enemy hits trigger feedback which clears between rounds', () => {
  const world = makeWorld(); world.startRound(1);
  let shots = 0;
  const shoot = world.combatEffects.shoot.bind(world.combatEffects);
  world.combatEffects.shoot = id => { shots++; shoot(id); };
  world.player.tryShoot(world); world.player.tryShoot(world);
  assert.equal(shots, 1);
  assert.ok(world.combatEffects.strength > 0);
  world.bulletPool.reset(); world.combatEffects.reset();
  const enemy = world.tanks[1]; enemy.hp = 40;
  world.bulletPool.spawn({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, team: 'blue', isPlayerBullet: true, damage: 40, radius: 3, lifetime: 1, penRate: 1 });
  world.handleCollisions();
  assert.equal(world.killcount.player, 1);
  assert.ok(world.combatEffects.strength >= 2);
  world.combatEffects.reset();
  world.bulletPool.spawn({ x: world.player.x, y: world.player.y, vx: 0, vy: 0, team: 'red', damage: 25, radius: 3, lifetime: 1, penRate: 1 });
  world.handleCollisions();
  assert.equal(world.player.hp, 100);
  assert.ok(world.combatEffects.damageFlash > 0);
  world.combatEffects.update(1 / 60);
  assert.notEqual(world.combatEffects.offsetX, 0);
  world.startRound(2);
  assert.equal(world.player.hp, 100);
  assert.equal(world.combatEffects.offsetX, 0); assert.equal(world.combatEffects.damageFlash, 0);
});

test('visual shake moves arena and entities together without changing aim; reduced motion suppresses the offset', () => {
  const world = makeWorld();
  world.camera.x = 0; world.camera.y = 50;
  world.combatEffects.offsetX = 3; world.combatEffects.offsetY = -2;
  let drawnCamera;
  world.player.draw = (_, camera) => { drawnCamera = camera; };
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  world.drawArena(ctx);
  assert.deepEqual(drawnCamera, { x: 3, y: 48 });
  assert.deepEqual(world.camera, { x: 0, y: 50 });
  world.player.handlePlayerInput(0, world, { keys: {}, mouse: { canvasX: world.player.x + 100, canvasY: world.player.y - 50, down: false } });
  assert.equal(world.player.turretAngle, 0);
  world.reducedMotion = true; world.drawArena(ctx);
  assert.equal(drawnCamera, world.camera);
});

test('HUD applies countdown feedback during combat and resets it as soon as the round ends', () => {
  const classes = new Set(), styles = new Map(), fields = new Map();
  const game = {
    root: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } }, style: { setProperty(name, value) { styles.set(name, value); } } },
    world: { player: new RoguePlayerTank(0, 0), combatEffects: new RogueCombatEffects() },
    state: { phase: 'combat', round: 1, remaining: 4.5, kills: 2, points: 10 },
    healthDisplays: [], damageText: () => '40',
    el(id) { if (!fields.has(id)) fields.set(id, { classList: { toggle() {} } }); return fields.get(id); },
  };
  RogueGame.prototype.renderHUD.call(game);
  assert.equal(fields.get('time').textContent, '4.5s');
  assert.ok(classes.has('rogue-countdown-active'));
  assert.ok(styles.get('--rogue-edge-opacity') > 0);
  assert.ok(styles.get('--rogue-timer-scale') > 1);
  for (const phase of ['shop', 'won', 'lost']) {
    game.state.phase = phase; RogueGame.prototype.renderHUD.call(game);
    assert.equal(classes.has('rogue-countdown-active'), false);
    assert.equal(styles.get('--rogue-edge-opacity'), 0);
    assert.equal(styles.get('--rogue-timer-scale'), 1);
    assert.equal(styles.get('--rogue-damage-opacity'), 0);
  }
});
