import { createShopState } from './helpers/rogue-shop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, rollAbilityChoices, calculateRogueStats, getStatSnapshot, previewAbility, abilityIcon } from '../src/js/41-rogue-abilities.js';
import { RogueState, ROUND_SECONDS } from '../src/js/42-rogue-state.js';
import { RogueWorld, RoguePlayerTank, getRogueCameraY } from '../src/js/50-rogue-world.js';
import { Tank, Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { ROGUE_PLAYER_BASE, getRogueExplosivePayload } from '../src/js/40-rogue-balance.js';

function worldWith(abilities = []) {
  const resources = { bulletPool: new Pool(() => new Bullet(), 30), explosionPool: new Pool(() => new Explosion(), 20), audio: {} };
  const world = new RogueWorld({ width: 1200, height: 650, getContext: () => ({}) }, resources);
  const state = createShopState();
  state.abilities = [...abilities]; state.applyStats(world.player);
  return { world, state, player: world.player };
}
const input = { keys: {}, mouse: { canvasX: 600, canvasY: 325, down: false } };

test('thirty named abilities have descriptions, local icons and distinct four-card offers', () => {
  assert.equal(Object.keys(ABILITIES).length, 30);
  for (const id of Object.keys(ABILITIES)) {
    assert.ok(ABILITIES[id].description.length > 10);
    assert.match(abilityIcon(id), /<svg/);
    assert.ok(ABILITIES[id].action || Object.keys(ABILITIES[id].effects).length > 0);
  }
  for (const random of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
    const offer = rollAbilityChoices(random);
    assert.equal(offer.length, 4); assert.equal(new Set(offer).size, 4);
    assert.ok(offer.every(id => Object.hasOwn(ABILITIES, id)));
  }
});

test('at most one free ability can be selected per round; repeated picks stack without spending points', () => {
  const state = createShopState(), player = new Tank(0, 0, 'blue', true);
  state.abilityChoices = ['turbo', 'hull', 'piercing'];
  assert.equal(state.startRound(), false);
  assert.equal(state.chooseAbility('blast', player), false);
  assert.equal(state.chooseAbility('turbo', player), true);
  assert.equal(state.points, 0);
  assert.equal(state.chooseAbility('hull', player), false);
  assert.equal(state.startRound(), false);
  state.rollDice(() => 5.5 / 7);
  assert.equal(state.startRound(), true);
  assert.equal(state.chooseAbility('hull', player), false);
  state.tick(ROUND_SECONDS, player.hp);
  assert.equal(state.selectedAbility, null);
  assert.equal(state.abilityChoices.length, 4);
  assert.equal(state.startRound(), false);
  state.abilityChoices = ['turbo', 'hull', 'piercing'];
  state.chooseAbility('turbo', player);
  assert.equal(player.speed, ROGUE_PLAYER_BASE.speed * 2.2);
  assert.ok(Math.abs(player.damageMultiplier - 0.3) < 1e-8);
  assert.deepEqual(state.abilities, ['turbo', 'turbo']);
});

test('every preview shows only changed fields and exactly matches applied stats with and without explosive payloads', () => {
  const state = createShopState();
  Object.assign(state.levels, { speed: 2, damage: 3, attackSpeed: 4, armor: 1 });
  for (const payload of [[], ['explosive']]) {
    state.abilities = ['turbo', 'hull', 'loader', 'plating', ...payload];
    for (const id of Object.keys(ABILITIES)) {
      if (ABILITIES[id].action) continue;
      if (ABILITIES[id].requiresExplosion && payload.length === 0) continue;
      const player = new RoguePlayerTank(0, 0);
      state.selectedAbility = null; state.abilityChoices = [id];
      const owned = [...state.abilities];
      const preview = previewAbility(state.levels, owned, id);
      assert.ok(preview.length > 0, id);
      const before = getStatSnapshot(calculateRogueStats(state.levels, owned));
      state.chooseAbility(id, player);
      const after = getStatSnapshot(player);
      assert.equal(preview.length, after.filter((stat, index) => stat.value !== before[index].value).length);
      for (const change of preview) {
        assert.notEqual(change.before, change.after);
        assert.equal(change.before, before.find(stat => stat.key === change.key).text);
        assert.equal(change.after, after.find(stat => stat.key === change.key).text);
      }
      state.abilities = owned;
    }
  }
});

test('point upgrades compose additively and never erase abilities or heal on maximum-HP gain', () => {
  const { state, player } = worldWith(['hull', 'loader', 'turbo']);
  assert.equal(player.hp, 125); assert.equal(player.maxHP, 225);
  state.points = 100;
  state.buy('speed', player); state.buy('damage', player); state.buy('attackSpeed', player);
  assert.ok(Math.abs(player.speed - ROGUE_PLAYER_BASE.speed * 1.28) < 1e-10);
  assert.ok(Math.abs(player.damageMultiplier - .33) < 1e-10);
  assert.ok(Math.abs(player.attackSpeedMultiplier - 1.83) < 1e-10);
  state.applyStats(player);
  assert.equal(player.hp, 125);
  state.buy('heal', player);
  assert.equal(player.hp, 225);
  state.applyStats(player);
  assert.equal(player.maxHP, 225);
});

test('splitter and ballistics strengthen standard shells while blast strengthens the separate payload', () => {
  const { world, player } = worldWith(['splitter', 'ballistics', 'blast', 'explosive']);
  player.tryShoot(world);
  const bullets = world.bulletPool.pool.filter(bullet => bullet.active);
  const standard = bullets.filter(bullet => !bullet.explosion), payload = bullets.find(bullet => bullet.explosion);
  assert.equal(standard.length, 4); assert.equal(bullets.length, 5);
  assert.ok(Math.abs(Math.hypot(standard[0].vx, standard[0].vy) - 1500) < 1e-8);
  assert.ok(Math.abs(standard[0].damage - 26) < 1e-8);
  assert.ok(Math.abs(Math.hypot(payload.vx, payload.vy) - 2000) < 1e-8);
  assert.ok(Math.abs(payload.explosion.radius - 108) < 1e-8); assert.equal(player.ammo, 286);
});

test('Common piercing hits two enemies but stops before the third; widened payload reaches beyond original radius', () => {
  const { world, player } = worldWith(['piercing', 'blast']);
  player.x = 100; player.y = 400; player.turretAngle = 0;
  const fire = player.fireProjectiles.bind(player);
  player.fireProjectiles = (world, profile) => fire(world, { ...profile, randomSpreadRadians: 0 });
  const targets = Array.from({ length: 5 }, (_, index) => new Tank(200 + index * 100, 400, 'red'));
  world.tanks.push(...targets);
  player.tryShoot(world);
  for (let i = 0; i < 60; i++) { world.bulletPool.updateAll(1 / 60); world.handleCollisions(); }
  for (const target of targets.slice(0, 2)) assert.equal(target.hp, 99);
  for (const target of targets.slice(2)) assert.equal(target.hp, 125);
  const edge = new Tank(600, 500, 'red');
  world.tanks = [player, edge];
  const heavy = getRogueExplosivePayload(player);
  world.causeWeaponExplosion(500, 500, 'blue', heavy.explosion, true);
  assert.ok(edge.hp < 125);
});

test('kill recovery caps at maximum, happens only for credited kills, and never revives player', () => {
  const { world, player } = worldWith(['recycler']);
  const killEnemy = () => {
    const target = new Tank(100, 100, 'red'); target.hp = 25;
    world.tanks.push(target);
    world.bulletPool.spawn({ x: 100, y: 100, vx: 0, vy: 0, damage: 25, team: 'blue', isPlayerBullet: true, radius: 3, lifetime: 1, penRate: 1 });
    world.handleCollisions();
  };
  assert.equal(player.maxHP, 75);
  player.hp = 50; killEnemy(); assert.equal(player.hp, 60);
  player.hp = 74; killEnemy(); assert.equal(player.hp, 75);
  player.hp = 0; killEnemy(); assert.equal(player.hp, 0);
});

test('tradeoff floors keep deeply stacked stats positive and new runs have no abilities', () => {
  const state = createShopState();
  const stats = calculateRogueStats(state.levels, [...Array(30).fill('splitter'), ...Array(30).fill('overcharge'), ...Array(30).fill('plating')]);
  assert.ok(stats.damageMultiplier >= .2); assert.ok(stats.attackSpeedMultiplier >= .25); assert.ok(stats.speed >= ROGUE_PLAYER_BASE.speed * .25);
  assert.deepEqual(new RogueState().abilities, []);
});

test('full-width square map scrolls vertically, keeps aim coordinates correct, and never scales drawing', () => {
  const { world, player } = worldWith();
  assert.equal(world.bounds.maxX, world.canvas.width); assert.equal(world.bounds.maxY, world.canvas.width);
  player.y = 150; world.updateCamera(); const upper = world.camera.y;
  player.y = 1050; world.updateCamera(); assert.ok(world.camera.y > upper);
  assert.equal(world.camera.x, 0);
  const target = { x: player.x + 100, y: player.y - 100 };
  player.handlePlayerInput(0, world, { keys: {}, mouse: { canvasX: target.x, canvasY: target.y - world.camera.y, down: false } });
  assert.ok(Math.abs(player.turretAngle + Math.PI / 4) < 1e-12);
  assert.equal(getRogueCameraY(0, 1200, 650), -96);
  assert.equal(getRogueCameraY(1200, 1200, 650), 1200 - 650 + 84);
  const fills = [];
  const ctx = new Proxy({ fillRect(...args) { fills.push(args); }, scale() { assert.fail('map must not scale'); } }, { get: (target, key) => key in target ? target[key] : () => {} });
  world.drawArena(ctx);
  assert.equal(fills[0][2], 1200); assert.equal(fills[0][3], 1200);
  world.resize(1500);
  assert.equal(world.bounds.maxX, 1500); assert.equal(world.bounds.maxY, 1500);
  world.startRound(1); world.update(1 / 60, input);
  assert.ok(Number.isFinite(world.camera.y));
});
