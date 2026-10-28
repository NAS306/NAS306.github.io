import { createShopState } from './helpers/rogue-shop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_DICE_FACES, rollEnemyDice, RogueDiceReveal, DICE_ENTER_SECONDS, DICE_EXIT_SECONDS } from '../src/js/21-rogue-dice.js';
import { RogueState, ROUND_SECONDS, getRoundConfig } from '../src/js/42-rogue-state.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { RogueRunHistory } from '../src/js/51-rogue-history.js';
import { RogueRoundTransition, getRoundTransitionFrame, ROUND_END_SECONDS } from '../src/js/44-rogue-transition.js';
import { Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { setModeSelectionHandler } from '../src/js/12-game-flow.js';

const input = { keys: {}, mouse: { canvasX: 800, canvasY: 350, down: false } };
function fixture() {
  const canvas = { width: 1600, height: 700, getContext: () => ({}) };
  const world = new RogueWorld(canvas, {
    bulletPool: new Pool(() => new Bullet(), 50), explosionPool: new Pool(() => new Explosion(), 50), audio: {},
  });
  return { canvas, world, state: createShopState(), player: world.player };
}
function choose(state, player) {
  state.abilityChoices = ['ballistics', 'piercing', 'blast'];
  assert.equal(state.chooseAbility('ballistics', player), true);
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
function fixedRoll(face, bonus = 20) {
  const samples = [(face + .5) / 7, (bonus - 20 + .5) / 41];
  return () => samples.shift();
}

test('the die has seven equal probability intervals, including one Pass and one Bomb', () => {
  assert.equal(ENEMY_DICE_FACES.length, 7);
  for (let face = 0; face < 7; face++) {
    assert.equal(rollEnemyDice(() => (face + .01) / 7).name, ENEMY_DICE_FACES[face].name);
    assert.equal(rollEnemyDice(() => (face + .99) / 7).name, ENEMY_DICE_FACES[face].name);
  }
  assert.equal(rollEnemyDice(() => 5 / 7).name, 'Pass');
  assert.equal(rollEnemyDice(() => 6 / 7).name, 'Bomb');
  assert.equal(rollEnemyDice(() => 0).key, 'speed');
});

test('the bonus independently samples all 41 integer amounts from 20 to 60; Pass grants zero without sampling an amount', () => {
  const amounts = new Set();
  for (let bonus = 20; bonus <= 60; bonus++) {
    const result = rollEnemyDice(fixedRoll(2, bonus));
    assert.equal(result.key, 'damage'); assert.equal(result.bonus, bonus); amounts.add(result.bonus);
  }
  assert.equal(amounts.size, 41);
  assert.equal(rollEnemyDice(() => 0).bonus, 20);
  let calls = 0;
  const maximum = rollEnemyDice(() => calls++ === 0 ? 0 : .999999);
  assert.equal(maximum.bonus, 60); assert.equal(calls, 2);
  calls = 0;
  const pass = rollEnemyDice(() => { calls++; return 5.5 / 7; });
  assert.equal(pass.bonus, 0); assert.equal(calls, 1);
});

test('every round requires one roll with optional ability selection, rolling locks upgrades and Pass still unlocks starting', () => {
  const { state, player } = fixture();
  assert.equal(state.startRound(), false);
  choose(state, player); assert.equal(state.startRound(), false);
  state.points = 100; assert.equal(state.buy('speed', player), true);
  assert.equal(state.rollDice(() => 0).key, 'speed');
  assert.equal(state.enemyDiceBonuses.speed, 20);
  assert.equal(state.rollDice(() => 0), null);
  assert.equal(state.buy('damage', player), false);
  player.hp = 50; assert.equal(state.buy('heal', player), false);
  assert.equal(state.startRound(), true);
  assert.equal(state.rollDice(() => 5.5 / 7), null);
  state.tick(ROUND_SECONDS, player.hp);
  assert.equal(state.round, 3); assert.equal(state.diceRolled, false); assert.equal(state.diceResult, null);
  assert.equal(state.enemyDiceBonuses.speed, 20);
  choose(state, player); assert.equal(state.startRound(), false);
  assert.equal(state.rollDice(() => 5.5 / 7).name, 'Pass');
  assert.equal(state.enemyDiceBonuses.speed, 20);
  assert.equal(state.startRound(), true);
  assert.deepEqual(new RogueState().enemyDiceBonuses, { speed: 0, attackSpeed: 0, damage: 0, maxHP: 0, projectileSpeed: 0 });
});

test('stat rolls and Bomb apply their sampled amounts to actual enemies and fire from all three weapons', () => {
  for (const bonus of [20, 37, 60]) {
    for (let face = 0; face < 7; face++) {
      const { state, world, player } = fixture(); choose(state, player); state.rollDice(fixedRoll(face, bonus));
      const increase = bonus / 100;
      world.startRound(10, state.enemyDiceBonuses);
      const enemies = world.tanks.filter(tank => !tank.isPlayer);
      assert.equal(new Set(enemies.map(tank => tank.weaponId)).size, 3);
      for (const enemy of enemies) {
        near(enemy.speed, 50 * (1 + (face === 0 || face === 6 ? increase : 0)));
        near(enemy.attackSpeedMultiplier, .5 * (1 + (face === 1 || face === 6 ? increase : 0)));
        near(enemy.damageMultiplier, .59 + (face === 2 || face === 6 ? increase * .5 : 0));
        near(enemy.maxHP, 117 + (face === 3 || face === 6 ? increase * 90 : 0));
        assert.equal(enemy.hp, enemy.maxHP);
        near(enemy.projectileSpeedMultiplier, 1 + (face === 4 || face === 6 ? increase : 0));
        world.bulletPool.reset(); enemy.fireCooldown = 0; enemy.tryShoot(world);
        near(enemy.fireCooldown, enemy.weapon.reloadTime / enemy.attackSpeedMultiplier);
        for (const shell of world.bulletPool.pool.filter(shell => shell.active)) {
          near(shell.damage, enemy.weapon.damage * enemy.damageMultiplier);
          near(Math.hypot(shell.vx, shell.vy), enemy.weapon.projectileSpeed * enemy.projectileSpeedMultiplier);
          if (shell.explosion) near(shell.explosion.maxDamage, enemy.weapon.explosion.maxDamage * enemy.damageMultiplier);
        }
      }
      assert.equal(player.speed, 200);
    }
  }
});

test('repeated die buffs add to the same base rather than compounding, survive rounds, and reach replacement enemies', () => {
  const { state, world, player } = fixture();
  for (let round = 1; round <= 3; round++) {
    choose(state, player); state.rollDice(fixedRoll(0, round * 10 + 10)); assert.equal(state.startRound(), true);
    world.startRound(state.round, state.enemyDiceBonuses);
    const total = [20, 50, 90][round - 1];
    assert.equal(state.enemyDiceBonuses.speed, total);
    near(world.tanks[1].speed, 50 * (1 + total / 100));
    world.spawnEnemy(); near(world.tanks.at(-1).speed, 50 * (1 + total / 100));
    state.tick(ROUND_SECONDS, player.hp);
  }
  const config = getRoundConfig(5, { maxHP: 40, damage: 40, attackSpeed: 40, speed: 40, projectileSpeed: 40 });
  near(config.enemyMaxHP, 138); near(config.enemyDamageMultiplier, .74);
  near(config.enemyMovementMultiplier, .7); near(config.enemyAttackSpeedMultiplier, .7);
  near(config.enemyProjectileSpeedMultiplier, 1.4);
});

test('round transition slows continuously for 1.5 seconds and synchronizes accelerating banner exit with panel entry', () => {
  assert.equal(ROUND_END_SECONDS, 1.5);
  const start = getRoundTransitionFrame(0), center = getRoundTransitionFrame(.4), departing = getRoundTransitionFrame(1);
  assert.equal(start.timeScale, 1); assert.equal(start.bannerX, 120); assert.equal(start.panelVisible, false);
  near(center.bannerX, 0); assert.equal(center.bannerOpacity, 1); assert.equal(center.panelVisible, false);
  assert.ok(departing.bannerX < 0); assert.ok(departing.panelX < 100); assert.equal(departing.panelVisible, true);
  const earlySpeed = Math.abs(getRoundTransitionFrame(1.1).bannerX - departing.bannerX);
  const lateSpeed = Math.abs(getRoundTransitionFrame(1.3).bannerX - getRoundTransitionFrame(1.2).bannerX);
  assert.ok(lateSpeed > earlySpeed);
  let previousScale = 1;
  for (let i = 1; i <= 30; i++) {
    const frame = getRoundTransitionFrame(i / 20);
    assert.ok(frame.timeScale <= previousScale); previousScale = frame.timeScale;
  }
  const end = getRoundTransitionFrame(1.5);
  near(end.timeScale, .04); assert.equal(end.done, true); assert.equal(end.panelX, 0); assert.equal(end.bannerX, -120);
});

test('slow-motion distance is consistent across frame rates and advancing a paused transition changes nothing', () => {
  const simulate = rate => {
    const transition = new RogueRoundTransition('won', 10); let movement = 0;
    for (let i = 0; i < rate * 1.5; i++) movement += transition.advance(1 / rate).simulationDelta;
    assert.equal(transition.advance(0).done, true);
    return movement;
  };
  near(simulate(30), simulate(120)); near(simulate(60), .54);
  const paused = new RogueRoundTransition('lost', 3); paused.advance(.6);
  const before = paused.elapsed; const frame = paused.advance(0);
  assert.equal(paused.elapsed, before); assert.equal(frame.simulationDelta, 0);
});

test('ending-scene updates move tanks and projectiles but cannot change settled HP, rewards or enemy counts', () => {
  const { state, world, player } = fixture(); choose(state, player); state.rollDice(() => 5.5 / 7); state.startRound();
  world.startRound(1); player.hp = 65;
  world.update(1 / 60, { keys: { d: true }, mouse: input.mouse });
  state.tick(ROUND_SECONDS, player.hp);
  const x = player.x, enemy = world.tanks[1], enemyHP = enemy.hp, count = world.tanks.length;
  world.bulletPool.spawn({ x: player.x, y: player.y, vx: 0, vy: 0, team: 'red', damage: 9999, radius: 3, lifetime: 10, penRate: 1 });
  world.bulletPool.spawn({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, team: 'blue', isPlayerBullet: true, damage: 9999, radius: 3, lifetime: 10, penRate: 1 });
  world.updateAfterRound(.1);
  assert.ok(player.x > x); assert.equal(player.hp, 65); assert.equal(enemy.hp, enemyHP);
  assert.equal(world.killcount.player, 0); assert.equal(state.points, 0); assert.equal(world.tanks.length, count);
  assert.equal(state.round, 3); assert.equal(state.phase, 'shop');
});

function transitionGame(outcome) {
  const { world, state, canvas } = fixture(); world.startRound(1);
  state.phase = outcome; state.round = outcome === 'shop' ? 2 : 10;
  const fields = new Map(), classes = new Set(), styles = new Map(), panels = [];
  const game = {
    world, state, canvas, panels, roundTransition: null, rewardSession: { settle() { return 0; } },
    history: new RogueRunHistory(), historyView: { reset() {} },
    root: {
      classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
      style: { setProperty(name, value) { styles.set(name, value); } },
    },
    el(id) {
      if (!fields.has(id)) fields.set(id, { hidden: id === 'shade', classList: { toggle() {} } });
      return fields.get(id);
    },
    renderPanel({ focus = true } = {}) {
      panels.push({ focus }); game.el('shade').hidden = false;
      
    },
  };
  game.advanceRoundTransition = dt => RogueGame.prototype.advanceRoundTransition.call(game, dt);
  return { game, classes, styles };
}

test('round clears have no banner; only full-run victory or defeat shows a banner while the panel enters', () => {
  for (const outcome of ['shop', 'won', 'lost']) {
    const { game, classes, styles } = transitionGame(outcome);
    RogueGame.prototype.beginRoundTransition.call(game);
    assert.equal(game.el('round-banner').textContent, { shop: '', won: 'VICTORY', lost: 'LOST' }[outcome]);
    assert.equal(game.el('round-banner').hidden, outcome === 'shop'); assert.equal(game.el('shade').inert, true);
    assert.equal(game.roundTransition.round, outcome === 'shop' ? 1 : 10);
    game.advanceRoundTransition(.5);
    assert.equal(game.panels.length, 0); assert.ok(game.world.tanks.length > 1);
    game.advanceRoundTransition(.46);
    assert.deepEqual(game.panels, [{ focus: false }]); assert.ok(game.world.tanks.length > 1);
    assert.equal(game.el('shade').inert, true); assert.ok(Number.parseFloat(styles.get('--rogue-panel-x')) < 100);
    game.advanceRoundTransition(.53); assert.notEqual(game.roundTransition, null);
    game.advanceRoundTransition(.02);
    assert.equal(game.roundTransition, null); assert.equal(game.world.tanks.length, 1);
    assert.equal(game.el('shade').inert, false); assert.equal(game.el('round-banner').hidden, true);
    assert.equal(classes.has('rogue-transitioning'), false);
    assert.deepEqual(game.panels, [{ focus: false }, { focus: true }]);
    
  }
});


test('the actual frame loop pauses during a hidden transition and keeps the result open after the full panel arrives', () => {
  const previousDocument = globalThis.document, previousRAF = globalThis.requestAnimationFrame;
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = () => 42;
  let automaticReturns = 0;
  setModeSelectionHandler(() => { automaticReturns++; });
  try {
    const { game } = transitionGame('won');
    game.root.querySelector = selector => ({ getBoundingClientRect: () => selector === 'header' ? { bottom: 80 } : { top: 620 } });
    game.ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    game.input = input; game.renderHUD = () => {}; game.cooldown = 0; game.accumulator = 0; game.lastTime = 0;
    game.world.drawArena = () => {};
    let combatUpdates = 0;
    game.world.update = () => { combatUpdates++; };
    RogueGame.prototype.beginRoundTransition.call(game);
    RogueGame.prototype.loop.call(game, 100);
    near(game.roundTransition.elapsed, .1);
    globalThis.document.hidden = true;
    RogueGame.prototype.loop.call(game, 10000);
    near(game.roundTransition.elapsed, .1);
    assert.equal(game.panels.length, 0);
    globalThis.document.hidden = false;
    for (let frame = 1; frame <= 14; frame++) RogueGame.prototype.loop.call(game, 10000 + frame * 100);
    assert.equal(game.roundTransition, null);
    assert.equal(combatUpdates, 0);
    RogueGame.prototype.loop.call(game, 11500);
    assert.equal(game.state.phase, 'won'); assert.equal(game.el('shade').hidden, false);
    for (let frame = 1; frame <= 240; frame++) RogueGame.prototype.loop.call(game, 11500 + frame * 1000);
    assert.equal(automaticReturns, 0); assert.equal(game.el('shade').hidden, false);
    game.disposed = true;
    const before = game.state.phase;
    RogueGame.prototype.loop.call(game, 12000);
    assert.equal(game.state.phase, before);
  } finally {
    setModeSelectionHandler(null);
    globalThis.document = previousDocument; globalThis.requestAnimationFrame = previousRAF;
  }
});

test('resetting a run starts unmodified first-round combat with six enemies and opens no preparation panel', () => {
  const { game, classes } = transitionGame('shop');
  game.resources = { bulletPool: game.world.bulletPool, explosionPool: game.world.explosionPool, audio: {} };
  let resets = 0, focuses = 0;
  game.input = { reset() { resets++; } }; game.canvas.focus = () => { focuses++; };
  game.renderHUD = () => {}; game.fitPanel = () => {};
  RogueGame.prototype.resetRun.call(game);
  assert.equal(game.state.phase, 'combat'); assert.equal(game.state.round, 1);
  assert.equal(game.state.remaining, 30); assert.equal(game.roundTransition, null);
  assert.equal(game.state.diceRolled, false); assert.deepEqual(game.state.abilities, []);
  assert.deepEqual(game.state.abilityChoices, []); assert.equal(game.panels.length, 0);
  assert.equal(game.el('shade').hidden, true); assert.equal(game.el('dice-overlay').hidden, true);
  assert.equal(classes.has('rogue-transitioning'), false);
  assert.equal(game.world.getAliveTankCount('red'), 6);
  assert.equal(game.world.player.hp, 125); assert.equal(game.world.player.ammo, 300);
  assert.equal(resets, 1); assert.equal(focuses, 1);
});

test('losing the unmodified first round renders an empty acquired-ability list without reading nonexistent offer cards', () => {
  const state = new RogueState(); state.tick(1, 0);
  const owned = { replaceChildren() {}, setAttribute(name, value) { this[name] = value; } };
  const game = {
    state, root: { querySelector: () => owned },
    abilityCards: Array.from({ length: 3 }, () => ({ querySelector() { assert.fail('no offer exists in round one'); } })),
  };
  RogueGame.prototype.renderAbilities.call(game, true);
  assert.ok(game.abilityCards.every(card => card.hidden));
  assert.equal(owned['aria-label'], 'No acquired abilities');
});

function diceGame(random = () => 0) {
  const { state, player, world, canvas } = fixture();
  const fields = new Map(); let rolls = 0;
  const roll = state.rollDice.bind(state);
  state.rollDice = () => { rolls++; return roll(random); };
  canvas.focus = () => { canvas.focused = true; };
  const game = {
    state, world, canvas, roundTransition: null, diceReveal: null,
    input: { mouse: { down: true }, keys: { d: true }, reset() { this.mouse.down = false; this.keys = {}; } },
    root: { style: { setProperty() {} } },
    el(id) {
      if (!fields.has(id)) fields.set(id, {
        hidden: id === 'dice-overlay', classList: { toggle() {} }, focus() { this.focused = true; },
      });
      return fields.get(id);
    },
  };
  for (const method of ['requestRoundStart', 'renderDiceOverlay', 'advanceDiceReveal', 'dismissDiceOverlay', 'startRevealedRound']) {
    game[method] = (...args) => RogueGame.prototype[method].apply(game, args);
  }
  return { game, player, getRolls: () => rolls };
}

test('dice card spins in, waits for acknowledgment and spins out without advancing automatically', () => {
  const reveal = new RogueDiceReveal();
  assert.equal(reveal.advance(0).angle, -720);
  assert.equal(reveal.close(), false);
  const halfway = reveal.advance(DICE_ENTER_SECONDS / 2);
  assert.ok(halfway.angle > -720 && halfway.angle < 0); assert.equal(halfway.ready, false);
  assert.equal(reveal.advance(DICE_ENTER_SECONDS / 2).ready, true);
  assert.equal(reveal.advance(10).ready, true); assert.equal(reveal.phase, 'ready');
  assert.equal(reveal.close(), true); assert.equal(reveal.close(), false);
  const leaving = reveal.advance(DICE_EXIT_SECONDS / 2);
  assert.ok(leaving.angle > 0); assert.equal(leaving.done, false);
  assert.equal(reveal.advance(DICE_EXIT_SECONDS / 2).done, true);
});

test('next-round action rolls once automatically, blocks early clicks, and starts combat only after the exit flip', () => {
  const { game, player, getRolls } = diceGame();
  choose(game.state, player);
  game.state.points = 100; assert.equal(game.state.buy('speed', player), true);
  assert.equal(game.requestRoundStart(), true);
  assert.equal(getRolls(), 1);
  assert.equal(game.state.enemyDiceBonuses.speed, 20);
  assert.equal(game.requestRoundStart(), false); assert.equal(getRolls(), 1);
  assert.equal(game.el('dice-overlay').hidden, false); assert.equal(game.el('dice-overlay').focused, true);
  assert.equal(game.el('shade').inert, true); assert.equal(game.state.phase, 'shop');
  assert.equal(game.state.buy('damage', player), false);
  assert.equal(game.dismissDiceOverlay(), false);
  game.startRevealedRound(); assert.equal(game.state.phase, 'shop');
  game.advanceDiceReveal(DICE_ENTER_SECONDS);
  assert.equal(game.state.remaining, 0); assert.equal(game.world.tanks.length, 1);
  assert.equal(game.dismissDiceOverlay(), true); assert.equal(game.dismissDiceOverlay(), false);
  game.advanceDiceReveal(DICE_EXIT_SECONDS - .01);
  assert.equal(game.state.phase, 'shop'); assert.equal(game.world.tanks.length, 1);
  game.input.mouse.down = true;
  game.advanceDiceReveal(.01);
  assert.equal(game.state.phase, 'combat'); assert.equal(game.state.remaining, 30);
  assert.equal(game.diceReveal, null); assert.equal(game.el('dice-overlay').hidden, true);
  assert.equal(game.el('shade').hidden, true); assert.equal(game.el('shade').inert, false);
  assert.equal(game.input.mouse.down, false); assert.deepEqual(game.input.keys, {}); assert.equal(game.canvas.focused, true);
  assert.equal(game.world.tanks[1].speed, 60);
  assert.equal(game.requestRoundStart(), false);
  game.state.tick(ROUND_SECONDS, player.hp); choose(game.state, player);
  assert.equal(game.requestRoundStart(), true); assert.equal(game.state.enemyDiceBonuses.speed, 40);
});

test('Pass card retains all five cumulative stats and includes the current round growth', () => {
  const { game, player } = diceGame(() => 5.5 / 7);
  game.state.round = 5; game.state.enemyDiceBonuses.speed = 23; game.state.enemyDiceBonuses.damage = 37;
  choose(game.state, player); game.requestRoundStart();
  assert.equal(game.el('dice-title').textContent, 'Pass');
  assert.match(game.el('dice-result').textContent, /No enemy buff/);
  assert.equal(game.el('dice-stat-speed').textContent, '123% · Dice +23%');
  assert.equal(game.el('dice-stat-damage').textContent, '145% · Dice +37%');
  assert.equal(game.el('dice-stat-attackSpeed').textContent, '100% · Dice +0%');
  assert.equal(game.el('dice-stat-maxHP').textContent, '102 HP · Dice +0%');
  assert.equal(game.el('dice-stat-projectileSpeed').textContent, '100% · Dice +0%');
  game.advanceDiceReveal(DICE_ENTER_SECONDS);
  assert.equal(game.state.phase, 'shop'); assert.equal(game.state.diceResult.name, 'Pass');
});

test('the result card shows the sampled bonus and the accumulated percentage instead of a fixed increment', () => {
  const { game, player } = diceGame(fixedRoll(0, 37));
  game.state.enemyDiceBonuses.speed = 23;
  choose(game.state, player); game.requestRoundStart();
  assert.equal(game.el('dice-result').textContent, '+37% of base · Added this round');
  assert.equal(game.el('dice-stat-speed').textContent, '160% · Dice +60%');
});

test('Bomb strengthens all five enemy stats, persists across rounds and replacements, and can only apply once per roll', () => {
  const { game, player } = diceGame(fixedRoll(6, 60));
  game.state.enemyDiceBonuses.speed = 23;
  choose(game.state, player); assert.equal(game.requestRoundStart(), true);
  assert.match(game.el('dice-title').textContent, /BOMB/);
  assert.match(game.el('dice-result').textContent, /All 5 stats \+60%/);
  assert.deepEqual(game.state.enemyDiceBonuses, { speed: 83, attackSpeed: 60, damage: 60, maxHP: 60, projectileSpeed: 60 });
  assert.equal(game.requestRoundStart(), false);
  game.advanceDiceReveal(DICE_ENTER_SECONDS); game.dismissDiceOverlay(); game.advanceDiceReveal(DICE_EXIT_SECONDS);
  for (const enemy of game.world.tanks.slice(1)) {
    near(enemy.speed, 91.5); near(enemy.attackSpeedMultiplier, .8); near(enemy.damageMultiplier, .81);
    near(enemy.maxHP, 147); near(enemy.projectileSpeedMultiplier, 1.6);
  }
  game.state.tick(ROUND_SECONDS, player.hp);
  game.world.startRound(3, game.state.enemyDiceBonuses); game.world.spawnEnemy();
  const replacement = game.world.tanks.at(-1);
  near(replacement.speed, 91.5); near(replacement.maxHP, 150); near(replacement.damageMultiplier, .82);
  assert.equal(new RogueState().enemyDiceBonuses.speed, 0);
});

test('hidden dice overlay pauses in the frame loop, and its exit cannot consume time or fire a stray shot', () => {
  const previousDocument = globalThis.document, previousRAF = globalThis.requestAnimationFrame;
  globalThis.document = { hidden: false }; globalThis.requestAnimationFrame = () => 42;
  try {
    const { game, player } = diceGame(); choose(game.state, player);
    game.root.querySelector = selector => ({ getBoundingClientRect: () => selector === 'header' ? { bottom: 80 } : { top: 620 } });
    game.ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    game.renderHUD = () => {}; game.cooldown = 0; game.accumulator = 0; game.lastTime = 0;
    game.world.drawArena = () => {};
    let combatUpdates = 0; game.world.update = () => { combatUpdates++; };
    game.requestRoundStart(); RogueGame.prototype.loop.call(game, 100);
    near(game.diceReveal.elapsed, .1);
    globalThis.document.hidden = true; RogueGame.prototype.loop.call(game, 10000);
    near(game.diceReveal.elapsed, .1); assert.equal(game.state.remaining, 0);
    globalThis.document.hidden = false;
    for (let i = 1; i <= 5; i++) RogueGame.prototype.loop.call(game, 10000 + i * 100);
    assert.equal(game.diceReveal.phase, 'ready'); assert.equal(combatUpdates, 0);
    game.dismissDiceOverlay();
    for (let i = 1; i <= 4; i++) RogueGame.prototype.loop.call(game, 10500 + i * 100);
    assert.equal(game.diceReveal, null); assert.equal(game.state.phase, 'combat');
    assert.equal(game.state.remaining, 30); assert.equal(combatUpdates, 0); assert.equal(game.input.mouse.down, false);
    RogueGame.prototype.loop.call(game, 11000);
    assert.ok(combatUpdates > 0); assert.ok(game.state.remaining < 40);
    game.disposed = true; const updatesBefore = combatUpdates;
    RogueGame.prototype.loop.call(game, 11500); assert.equal(combatUpdates, updatesBefore);
  } finally {
    globalThis.document = previousDocument; globalThis.requestAnimationFrame = previousRAF;
  }
});
