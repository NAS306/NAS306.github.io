import { createShopState } from './helpers/rogue-shop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, calculateRogueStats, previewAbility, rollAbilityChoices, abilityRarity } from '../src/js/41-rogue-abilities.js';
import { getRogueDeathBlast } from '../src/js/40-rogue-balance.js';
import { RogueState } from '../src/js/42-rogue-state.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { Tank, Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { getModifiedWeaponProfile, resolveWeaponProfile } from '../src/js/10-weapon-config.js';

const NEW_ABILITIES = ['glass', 'storm', 'siege', 'blood', 'rail', 'reactor', 'slowOrb', 'warhead', 'juggernaut', 'volatile'];
function fixture(abilities = []) {
  const world = new RogueWorld({ width: 1600, height: 700, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 30), explosionPool: new Pool(() => new Explosion(), 200), audio: {},
  });
  const state = createShopState(); state.abilities = [...abilities]; state.applyStats(world.player);
  return { world, state, player: world.player };
}
function projectile(world, target, extra = {}) {
  world.bulletPool.spawn({ x: target.x, y: target.y, vx: 0, vy: 0, team: 'blue', isPlayerBullet: true, damage: 40, radius: 3, lifetime: 1, penRate: 1, ...extra });
}

test('all cards have benefits, tradeoffs where specified, and can appear with an explosion source', () => {
  for (const id of Object.keys(ABILITIES)) {
    if (ABILITIES[id].action) continue;
    const effects = Object.values(ABILITIES[id].effects);
    assert.ok(effects.some(value => value > 0), `${id} benefit`);
    if (!['ricochet', 'shield', 'bargain'].includes(id)) assert.ok(effects.some(value => value < 0), `${id} drawback`);
  }
  const offered = new Set();
  for (const [rarity, sample] of [['common', .3], ['rare', .75], ['legendary', .95]]) {
    const count = Object.keys(ABILITIES).filter(id => abilityRarity(id) === rarity).length;
    for (let i = 0; i < count; i++) {
      let calls = 0; offered.add(rollAbilityChoices(() => calls++ % 2 === 0 ? sample : (i + .5) / count, ['explosive'])[0]);
    }
  }
  assert.deepEqual(offered, new Set(Object.keys(ABILITIES)));
});

test('max-HP tradeoffs clamp current HP safely and a later hull upgrade adds capacity without healing', () => {
  const { state, player } = fixture(['glass']);
  assert.equal(player.maxHP, 45); assert.equal(player.hp, 45);
  player.hp = 30; state.abilities.push('hull'); state.applyStats(player);
  assert.equal(player.maxHP, 145); assert.equal(player.hp, 30);
  state.abilities = [...Array(10).fill('glass'), ...Array(10).fill('blood')]; state.applyStats(player);
  assert.equal(player.maxHP, 25); assert.equal(player.hp, 25);
  player.hp = 10; state.points = 5; assert.equal(state.buy('heal', player), true);
  assert.equal(player.hp, 25);
});

test('negative armor adds incoming damage, armor upgrades offset it, and team-mode damage stays unchanged', () => {
  const { state, player } = fixture(['reactor']);
  assert.equal(player.armor, -8);
  player.takeDamage(10); assert.equal(player.hp, 107);
  state.points = 5; state.buy('armor', player);
  player.takeDamage(10); assert.equal(player.hp, 90);
  const armored = fixture(['reactor', 'plating']).player;
  assert.equal(armored.armor, 2); armored.takeDamage(10); assert.equal(armored.hp, 117);
  for (const damage of [0, -1, NaN, Infinity]) player.takeDamage(damage);
  assert.equal(player.hp, 90);
  const team = new Tank(0, 0, 'blue', true); team.armor = -4; team.takeDamage(10);
  assert.equal(team.hp, 115);
});

test('multi-shell, long-lived rapid fire composes with a separate explosive payload and clears pooled bonuses', () => {
  const { world, state, player } = fixture(['storm', 'splitter', 'slowOrb', 'rail', 'reactor', 'overcharge', 'explosive']);
  player.tryShoot(world);
  const volley = world.bulletPool.pool.filter(bullet => bullet.active);
  assert.equal(volley.filter(shell => !shell.explosion).length, 13);
  assert.equal(volley.filter(shell => shell.explosion).length, 1);
  assert.equal(player.ammo, 277);
  for (const shell of volley) {
    assert.ok(Math.abs(shell.damage - 16) < 1e-8);
    assert.ok(Math.abs(Math.hypot(shell.vx, shell.vy) - (shell.explosion ? 1800 : 1350)) < 1e-8);
    assert.ok(Math.abs(shell.lifetime - 4.5) < 1e-8);
    assert.equal(shell.penRate, shell.explosion ? 1 : 9);
    if (shell.explosion) assert.ok(Math.abs(shell.explosion.maxDamage - 32) < 1e-8);
  }
  assert.ok(Math.abs(player.fireCooldown - .125) < 1e-8);
  // Reusing the same pooled objects for an unmodified run must clear every bonus.
  world.bulletPool.reset(); state.abilities = []; state.applyStats(player);
  player.setWeapon('standard'); player.fireCooldown = 0; player.tryShoot(world);
  const shells = world.bulletPool.pool.filter(bullet => bullet.active);
  assert.equal(shells.length, 1); assert.equal(shells[0].lifetime, 1.5);
  assert.equal(shells[0].damage, 40); assert.equal(shells[0].penRate, 1);
});

test('Rail Accelerator plus Piercing Rounds hits twelve enemies with one shell and stops before the thirteenth', () => {
  const { world, player } = fixture(['rail', 'piercing']);
  player.x = 50; player.y = 400; player.turretAngle = 0;
  const fire = player.fireProjectiles.bind(player);
  player.fireProjectiles = (world, profile) => fire(world, { ...profile, randomSpreadRadians: 0 });
  const targets = Array.from({ length: 13 }, (_, i) => new Tank(150 + i * 60, 400, 'red'));
  world.tanks.push(...targets); player.tryShoot(world);
  for (let i = 0; i < 100; i++) { world.bulletPool.updateAll(1 / 120); world.handleCollisions(); }
  for (const target of targets.slice(0, 12)) assert.equal(target.hp, 97);
  assert.equal(targets[12].hp, 125);
});

test('death novas chain through enemies, scale with old cards, award points and healing, and never hit the player', () => {
  const { world, state, player } = fixture(['volatile', 'glass', 'blast', 'blood', 'recycler']);
  const nova = getRogueDeathBlast(player);
  assert.equal(nova.minDamage, 0); assert.equal(nova.maxDamage, 106); assert.equal(nova.radius, 94.5);
  player.x = 400; player.y = 400; player.hp = 5;
  const enemies = Array.from({ length: 4 }, (_, i) => new Tank(400 + i * 40, 400, 'red'));
  enemies.forEach(enemy => { enemy.hp = 30; }); world.tanks.push(...enemies);
  state.phase = 'combat'; projectile(world, enemies[0]);
  world.handleCollisions(); state.awardKills(world.killcount.player);
  assert.ok(enemies.every(enemy => enemy.hp <= 0));
  assert.equal(world.killcount.player, 4); assert.equal(state.points, 20);
  assert.equal(player.hp, 25); assert.equal(world.pendingDeathBlasts.length, 0);
  world.handleCollisions();
  assert.equal(world.killcount.player, 4);
  assert.equal(player.hp, 25);
  world.startRound(2); assert.equal(world.pendingDeathBlasts.length, 0);
});

test('enemy friendly-fire deaths never trigger player novas or recovery, and normal heavy shells retain friendly fire', () => {
  const { world, player } = fixture(['volatile', 'blood']); player.hp = 10;
  const enemies = [new Tank(200, 200, 'red'), new Tank(240, 200, 'red')];
  enemies.forEach(enemy => { enemy.hp = 10; }); world.tanks.push(...enemies);
  world.causeWeaponExplosion(200, 200, 'red', { radius: 135, minDamage: 50, maxDamage: 50, visualRadius: 100, pushForce: 0 }, false);
  world.handleCollisions();
  assert.ok(enemies.every(enemy => enemy.hp <= 0));
  assert.equal(world.killcount.player, 0); assert.equal(world.pendingDeathBlasts.length, 0); assert.equal(player.hp, 10);
  const normal = fixture().world;
  normal.causeWeaponExplosion(normal.player.x, normal.player.y, 'blue', normal.player.weapon.explosion ?? getModifiedWeaponProfile(resolveWeaponProfile('heavy')).explosion, true);
  assert.equal(normal.player.hp, 50);
});

test('a dense final-round-sized chain terminates, gives each kill once and never revives a dead player', () => {
  const { world, player } = fixture(['volatile', 'glass', 'recycler']);
  player.hp = 0;
  const enemies = Array.from({ length: 60 }, (_, i) => new Tank(400 + i, 300, 'red'));
  enemies.forEach(enemy => { enemy.hp = 20; }); world.tanks.push(...enemies);
  projectile(world, enemies[0]); world.handleCollisions();
  assert.equal(world.killcount.player, 60); assert.equal(world.pendingDeathBlasts.length, 0); assert.equal(player.hp, 0);
  world.handleCollisions(); assert.equal(world.killcount.player, 60);
});

test('nova previews reflect both radius bonuses and damage penalties, with numeric negative-armor costs', () => {
  const levels = new RogueState().levels;
  const changes = previewAbility(levels, ['volatile'], 'warhead');
  const nova = changes.find(change => change.key === 'deathNova');
  assert.equal(nova.before, '0–40 / 70px'); assert.equal(nova.after, '0–20 / 110px');
  const armor = previewAbility(levels, [], 'reactor').find(change => change.key === 'armor');
  assert.equal(armor.after, '-8 (+8 damage taken)');
  for (const id of NEW_ABILITIES) {
    for (const payload of [[], ['explosive']]) {
      const preview = previewAbility(levels, ['volatile', 'slowOrb', 'glass', ...payload], id);
      assert.ok(preview.length > 0); assert.ok(preview.length <= 6, `${id}: keep cards readable`);
      assert.ok(preview.every(change => change.before !== change.after));
    }
  }
});

test('extreme tradeoff stacks stay finite with safe HP and shell-speed floors and default team lifetimes', () => {
  const stats = calculateRogueStats(new RogueState().levels, [...Array(30).fill('slowOrb'), ...Array(30).fill('glass'), ...Array(30).fill('siege')]);
  assert.equal(stats.maxHP, 25); assert.equal(stats.projectileSpeedMultiplier, .2);
  assert.ok(stats.attackSpeedMultiplier >= .25);
  assert.ok(Object.entries(stats).every(([key, value]) => key === 'pointsCap' ? value === Infinity : typeof value === 'boolean' || Number.isFinite(value)));
  const team = new Tank(0, 0, 'blue', true);
  assert.equal(getModifiedWeaponProfile(team.weapon, team).projectileLifetime, 1.5);
  assert.equal(getRogueDeathBlast(team), null);
});
