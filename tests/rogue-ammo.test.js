import { createShopState } from './helpers/rogue-shop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoguePlayerTank, RogueWorld } from '../src/js/50-rogue-world.js';
import { RogueState, ROUND_SECONDS } from '../src/js/42-rogue-state.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { supplyRoundAmmo, getAmmoPerPoint } from '../src/js/20-rogue-ammo.js';
import { rollAbilityChoices } from '../src/js/41-rogue-abilities.js';
import { Tank, Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';

function fixture(owned = []) {
  const player = new RoguePlayerTank(100, 100), state = createShopState();
  state.abilities = [...owned]; state.applyStats(player);
  const projectiles = [], sounds = [], effects = [];
  const world = {
    bulletPool: { spawn: projectile => projectiles.push(projectile) },
    playSpatialAudio: name => sounds.push(name), combatEffects: { shoot: id => effects.push(id) },
  };
  return { player, state, projectiles, sounds, effects, world };
}

test('round one starts at 300, later supplies preserve leftovers and cannot be duplicated by shop refresh or start', () => {
  const world = new RogueWorld({ width: 800, height: 600, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 10), explosionPool: new Pool(() => new Explosion(), 10), audio: {},
  });
  const { player } = world;
  assert.equal(player.ammo, 300);
  assert.equal(supplyRoundAmmo(player, 1), 0);
  world.startRound(1); assert.equal(player.ammo, 300);
  player.ammo = 37;
  assert.equal(supplyRoundAmmo(player, 2), 300);
  assert.equal(player.ammo, 337);
  assert.equal(supplyRoundAmmo(player, 2), 0);
  world.startRound(2); assert.equal(player.ammo, 337);
  world.startRound(3); assert.equal(player.ammo, 637);
  assert.equal(new RoguePlayerTank(0, 0).ammo, 300);
});

test('ammo purchases use the current round rate and leave upgrades, choices and HP unchanged', () => {
  const { player, state } = fixture(['explosive', 'splitter']);
  state.points = 100000; player.hp = 40;
  const levels = { ...state.levels }, choices = [...state.abilityChoices];
  assert.equal(state.buyAmmo(player, 1), true);
  assert.equal(state.buyAmmo(player, 99999), true);
  assert.equal(player.ammo, 1900300); assert.equal(state.points, 0);
  assert.deepEqual(state.levels, levels); assert.deepEqual(state.abilityChoices, choices);
  assert.equal(state.cost('heal'), 5); assert.equal(player.hp, 40);
  state.points = 5; state.buy('damage', player);
  assert.equal(player.ammo, 1900300);
});

test('invalid, unaffordable and locked purchases never spend points or grant ammo', () => {
  const { player, state } = fixture(); state.points = 20;
  for (const points of [0, -1, .5, 21, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(state.buyAmmo(player, points), false);
    assert.equal(player.ammo, 300); assert.equal(state.points, 20);
  }
  state.selectedAbility = 'piercing'; state.rollDice(() => 5.5 / 7);
  assert.equal(state.buyAmmo(player), false);
  state.startRound(); assert.equal(state.buyAmmo(player), false);
  state.tick(ROUND_SECONDS, player.hp);
  assert.equal(state.buyAmmo(player), true);
  state.phase = 'lost'; assert.equal(state.buyAmmo(player), false);
  state.phase = 'won'; assert.equal(state.buyAmmo(player), false);
});

test('standard multishot consumes actual projectiles, fires a partial volley and stops silently at zero', () => {
  const { player, world, projectiles, sounds, effects } = fixture(['storm', 'splitter']);
  player.ammo = 15;
  assert.equal(player.tryShoot(world), true);
  assert.equal(projectiles.length, 11); assert.equal(player.ammo, 4);
  assert.equal(player.tryShoot(world), false); // Cooldown neither fires nor consumes.
  assert.equal(player.ammo, 4);
  player.fireCooldown = 0; player.tryShoot(world);
  assert.equal(projectiles.length, 15); assert.equal(player.ammo, 0);
  player.fireCooldown = 0;
  assert.equal(player.tryShoot(world), false); assert.equal(player.fireCooldown, 0);
  assert.equal(sounds.length, 2); assert.equal(effects.length, 2);
  assert.ok(projectiles.every(shell => !shell.explosion));
});

test('explosive payload adds to standard fire at ten ammo each, including boundary and repeat-pick cases', () => {
  for (const [owned, ammo, normal, explosive, left] of [
    [['explosive'], 0, 0, 0, 0],
    [['explosive'], 9, 1, 0, 8],
    [['explosive'], 10, 0, 1, 0],
    [['explosive'], 11, 1, 1, 0],
    [['explosive', 'splitter'], 13, 3, 1, 0],
    [['explosive', 'explosive', 'storm'], 28, 8, 2, 0],
    [['explosive', 'explosive', 'storm'], 19, 8, 1, 1],
  ]) {
    const { player, world, projectiles } = fixture(owned); player.ammo = ammo;
    assert.equal(player.tryShoot(world), normal + explosive > 0);
    assert.equal(projectiles.filter(shell => !shell.explosion).length, normal);
    const payloads = projectiles.filter(shell => shell.explosion);
    assert.equal(payloads.length, explosive); assert.equal(player.ammo, left);
    assert.ok(payloads.every(shell => shell.radius === 6 && shell.penRate === 1 && shell.explosion.hitAllies === false));
    if (explosive > 1) assert.notEqual(payloads[0].vy, payloads[1].vy);
    assert.equal(player.weaponId, 'standard');
  }
});

test('survival weapon changes stay standard, while enemies and team players keep their original weapons without ammo', () => {
  const { player, world, projectiles } = fixture();
  for (const id of ['heavy', 'scatter', 'standard']) {
    player.setWeapon(id); player.fireCooldown = 0; player.tryShoot(world);
    assert.equal(player.weaponId, 'standard');
    assert.equal(projectiles.at(-1).explosion, null); assert.equal(projectiles.at(-1).damage, 40);
    const other = new Tank(0, 0, 'red', false, false, id);
    other.ammo = 0;
    const start = projectiles.length; other.tryShoot(world);
    assert.equal(projectiles.length - start, other.weapon.pelletCount);
    assert.equal(other.weaponId, id);
  }
  assert.equal(player.ammo, 297);
});

test('blast-only cards require an explosion source and Death Cascade effects never consume extra ammo', () => {
  const eligible = owned => {
    const offered = new Set();
    for (const tier of [.3, .75, .95]) for (let i = 0; i < 100; i++) {
      let calls = 0;
      rollAbilityChoices(() => calls++ % 2 === 0 ? tier : i / 100, owned).forEach(id => offered.add(id));
    }
    return offered;
  };
  const fresh = eligible([]);
  assert.equal(fresh.has('blast'), false); assert.equal(fresh.has('warhead'), false);
  for (const source of ['explosive', 'volatile']) {
    assert.equal(eligible([source]).has('blast'), true);
    assert.equal(eligible([source]).has('warhead'), true);
  }
  const { player, world } = fixture(['volatile']);
  player.tryShoot(world); assert.equal(player.ammo, 299);
  const effects = { player, pendingDeathBlasts: [], combatEffects: { kill() {} } };
  RogueWorld.prototype.onPlayerKill.call(effects, { x: 200, y: 200 });
  assert.equal(effects.pendingDeathBlasts.length, 1); assert.equal(player.ammo, 299);
});

test('HUD displays ammo and volley cost; the shop reflects round prices, funds and dice locking', () => {
  const { player, state } = fixture(['splitter', 'explosive']);
  const fields = new Map();
  const game = {
    state, world: { player }, healthDisplays: [], damageText: () => '40',
    root: { classList: { toggle() {} }, style: { setProperty() {} } },
    el(id) {
      if (!fields.has(id)) {
        const classes = new Set();
        fields.set(id, { classes, classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } });
      }
      return fields.get(id);
    },
  };
  RogueGame.prototype.renderHUD.call(game);
  assert.equal(game.el('ammo').textContent, 'AMMO 300 · 14 / volley');
  player.ammo = 8; RogueGame.prototype.renderHUD.call(game);
  assert.equal(game.el('ammo').classes.has('warning'), true);
  player.ammo = 0; RogueGame.prototype.renderHUD.call(game);
  assert.match(game.el('ammo').textContent, /EMPTY/); assert.equal(game.el('ammo').classes.has('danger'), true);
  game.el('ammo-spend').value = '2'; state.points = 5;
  RogueGame.prototype.renderAmmoShop.call(game);
  assert.equal(game.el('buy-ammo').textContent, 'Buy 38 ammo (2 pt)');
  assert.equal(game.el('ammo-rate').textContent, 'Round 2: 1 pt = 19 ammo');
  assert.equal(game.el('buy-ammo').disabled, false);
  assert.equal(state.buyAmmo(player, 2), true);
  RogueGame.prototype.renderAmmoShop.call(game);
  assert.equal(game.el('ammo-stock').textContent, '38'); assert.equal(state.points, 3);
  game.el('ammo-spend').value = '4'; RogueGame.prototype.renderAmmoShop.call(game);
  assert.equal(game.el('buy-ammo').disabled, true);
  game.el('ammo-spend').value = '0.5'; RogueGame.prototype.renderAmmoShop.call(game);
  assert.equal(game.el('buy-ammo').textContent, 'Enter points');
  state.diceRolled = true; RogueGame.prototype.renderAmmoShop.call(game);
  assert.equal(game.el('ammo-spend').disabled, true);
});
