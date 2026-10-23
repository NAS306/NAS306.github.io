import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueState } from '../src/js/42-rogue-state.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { getRogueExplosivePayload, getRogueDeathBlast, getRogueExplosionRadiusText } from '../src/js/40-rogue-balance.js';
import { getStatSnapshot, previewAbility } from '../src/js/41-rogue-abilities.js';
import { Tank, Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { resolveWeaponProfile } from '../src/js/10-weapon-config.js';

function fixture(abilities) {
  const world = new RogueWorld({ width: 1000, height: 700, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 20), explosionPool: new Pool(() => new Explosion(), 30), audio: {},
  });
  const state = new RogueState(); state.abilities = abilities; state.applyStats(world.player);
  world.player.x = 20; world.player.y = 20;
  return { world, state, player: world.player };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

test('payload and death-nova radius caps survive extreme repeat picks, and previews use the actual capped radii', () => {
  const { state, player } = fixture(['explosive', 'volatile']);
  assert.equal(getRogueExplosivePayload(player).explosion.radius, 90);
  assert.equal(getRogueDeathBlast(player).radius, 70);
  state.abilities.push(...Array(30).fill('blast'), ...Array(30).fill('warhead'), ...Array(30).fill('siege'));
  state.applyStats(player);
  const shell = getRogueExplosivePayload(player).explosion, nova = getRogueDeathBlast(player);
  assert.equal(shell.radius, 150); assert.equal(shell.visualRadius, 150);
  assert.equal(nova.radius, 110); assert.equal(nova.visualRadius, 110);
  assert.equal(getRogueExplosionRadiusText(player), 'Shell 150px / Nova 110px');
  assert.equal(getStatSnapshot(player).find(row => row.key === 'blast').text, 'Shell 150px / Nova 110px');
  const preview = previewAbility(state.levels, state.abilities, 'blast');
  assert.ok(preview.every(row => row.key !== 'blast'), 'no fictitious radius gain after the cap');
  const novaChange = preview.find(row => row.key === 'deathNova');
  assert.match(novaChange.before, /\/ 110px$/);
  assert.match(novaChange.after, /\/ 110px$/);
});

test('payload damage falls quadratically and enemies at or beyond the capped radius take no damage', () => {
  const { world, player } = fixture(['explosive']);
  const profile = getRogueExplosivePayload(player).explosion;
  assert.equal(profile.minDamage, 15); assert.equal(profile.maxDamage, 80);
  const targets = [0, .5, .9, 1, 1.1].map(distance => new Tank(400 + distance * profile.radius, 400, 'red'));
  world.tanks.push(...targets);
  world.causeWeaponExplosion(400, 400, 'blue', profile, true);
  [80, 31.25, 15.65, 0, 0].forEach((damage, index) => near(125 - targets[index].hp, damage));
  near(player.runStats.damageDealt, 126.9);
  assert.equal(player.runStats.damageTaken, 0);
});

test('death-nova base damage is halved, its edge approaches zero, and distant enemies cannot extend a chain', () => {
  const { world, player } = fixture(['volatile']);
  const nova = getRogueDeathBlast(player);
  assert.equal(nova.minDamage, 0); assert.equal(nova.maxDamage, 40);
  const targets = [0, .5, .9, 1].map(distance => new Tank(400 + distance * nova.radius, 400, 'red'));
  world.tanks.push(...targets);
  world.causeWeaponExplosion(400, 400, 'blue', nova, true);
  [40, 10, .4, 0].forEach((damage, index) => near(125 - targets[index].hp, damage));
  assert.equal(world.pendingDeathBlasts.length, 0);
});

test('an overpowered damage stack cannot bridge enemies beyond the capped nova radius', () => {
  const { world, state, player } = fixture(['volatile', 'blast', 'warhead', ...Array(8).fill('glass')]);
  const first = new Tank(400, 400, 'red'), distant = new Tank(520, 400, 'red');
  first.hp = 1; world.tanks.push(first, distant);
  world.bulletPool.spawn({ x: 400, y: 400, vx: 0, vy: 0, team: 'blue', isPlayerBullet: true, damage: 40, radius: 3, lifetime: 1, penRate: 1 });
  world.handleCollisions();
  assert.equal(world.killcount.player, 1); assert.equal(distant.hp, 125);
  assert.equal(world.pendingDeathBlasts.length, 0);
  state.applyStats(player); assert.equal(getRogueDeathBlast(player).radius, 110);
});

test('severe health and armor tradeoffs can make a previously survivable enemy heavy hit lethal', () => {
  const baseline = fixture([]).player;
  const { player, state } = fixture(['glass', 'ballistics']);
  assert.equal(player.maxHP, 45); assert.equal(player.hp, 45); assert.equal(player.armor, -8);
  const damage = resolveWeaponProfile('heavy').explosion.maxDamage * .5;
  baseline.takeDamage(damage); assert.ok(baseline.hp > 0);
  player.takeDamage(damage); assert.ok(player.hp <= 0);
  assert.equal(player.runStats.damageTaken, 45);
  state.abilities.push('hull'); state.applyStats(player); assert.ok(player.hp <= 0, 'capacity gains never revive');
});

test('team and enemy explosions keep the original radii, damage and linear falloff', () => {
  const { world } = fixture([]);
  const heavy = resolveWeaponProfile('heavy');
  assert.equal(heavy.explosion.radius, 90); assert.equal(heavy.explosion.maxDamage, 75);
  assert.equal(heavy.explosion.falloffExponent, undefined);
  const target = new Tank(445, 400, 'red'); world.tanks.push(target);
  world.causeWeaponExplosion(400, 400, 'blue', heavy.explosion, false);
  assert.equal(target.hp, 75);
});
