import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueState, ROUND_COUNT, ROUND_SECONDS, getRoundConfig } from '../src/js/42-rogue-state.js';
import { ABILITIES, abilityRarity, rollAbilityRarity, rollAbilityChoices, canOfferAbility, calculateRogueStats } from '../src/js/41-rogue-abilities.js';
import { RogueWorld } from '../src/js/50-rogue-world.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { Bullet, Explosion } from '../src/js/30-entities.js';
import { Pool } from '../src/js/31-systems.js';
import { getRoguePlayerWeapon } from '../src/js/40-rogue-balance.js';
import { getRogueRunSummary } from '../src/js/22-rogue-stats.js';

function fixture(owned = []) {
  const world = new RogueWorld({ width: 1200, height: 700, getContext: () => ({}) }, {
    bulletPool: new Pool(() => new Bullet(), 30), explosionPool: new Pool(() => new Explosion(), 20), audio: {},
  });
  const state = new RogueState(); state.abilities = [...owned]; state.applyStats(world.player);
  return { world, state, player: world.player };
}
function shop(state) { state.phase = 'shop'; state.selectedAbility = null; state.diceRolled = false; state.abilityChoices = ['recalibrate']; }
const input = { keys: {}, mouse: { canvasX: 500, canvasY: 400, down: false } };

test('all thirty rounds work with every optional ability skipped, and only round thirty wins', () => {
  const { state, player } = fixture();
  assert.equal(ROUND_COUNT, 30);
  for (let round = 1; round <= 30; round++) {
    assert.equal(state.round, round);
    const config = getRoundConfig(round);
    assert.equal(config.maxEnemies, round * 6);
    assert.equal(Object.values(config.weights).reduce((a, b) => a + b), 100);
    if (round > 1) {
      assert.equal(state.selectedAbility, null); assert.equal(state.startRound(), false);
      assert.ok(state.rollDice(() => 5.5 / 7)); assert.equal(state.startRound(), true);
      assert.equal(state.chooseAbility(state.abilityChoices[0], player), false);
    }
    state.tick(ROUND_SECONDS, player.hp);
    assert.equal(state.phase, round === 30 ? 'won' : 'shop');
  }
  assert.deepEqual(state.abilities, []);
  assert.throws(() => getRoundConfig(31), RangeError);
});

test('rarity intervals are exactly 60/30/10 and actual offers retain those probabilities without duplicates', () => {
  const exact = { common: 0, rare: 0, legendary: 0 };
  for (let i = 0; i < 100; i++) exact[rollAbilityRarity((i + .5) / 100)]++;
  assert.deepEqual(exact, { common: 60, rare: 30, legendary: 10 });
  assert.equal(rollAbilityRarity(.6), 'rare'); assert.equal(rollAbilityRarity(.9), 'legendary');
  let seed = 1729;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const counts = { common: 0, rare: 0, legendary: 0 };
  for (let i = 0; i < 10000; i++) {
    const choices = rollAbilityChoices(random, ['explosive']);
    assert.equal(new Set(choices).size, 4);
    for (const id of choices) { assert.ok(ABILITIES[id]); counts[abilityRarity(id)]++; }
  }
  for (const [rarity, probability] of [['common', .6], ['rare', .3], ['legendary', .1]]) {
    assert.ok(Math.abs(counts[rarity] / 40000 - probability) < .015);
  }
});

test('max-level and conditional exclusions preserve four eligible cards in every tier', () => {
  assert.equal(canOfferAbility('recalibrate', []), false);
  const owned = ['oversized', 'oversized', 'oversized', 'shield', 'bargain', 'bargain', 'bargain'];
  assert.equal(canOfferAbility('oversized', owned), false); assert.equal(canOfferAbility('shield', owned), false);
  assert.equal(canOfferAbility('bargain', owned), false);
  for (const sample of [.3, .75, .95]) {
    let calls = 0;
    const choices = rollAbilityChoices(() => calls++ % 2 === 0 ? sample : .99999, owned);
    assert.equal(new Set(choices).size, 4); assert.ok(choices.every(id => canOfferAbility(id, owned)));
  }
});

test('Recalibration removes one level, restores benefits and penalties, and does not heal or permit a second pick', () => {
  const { state, player } = fixture(['hull', 'hull', 'oversized']); player.hp = 80;
  shop(state); assert.equal(state.chooseAbility('recalibrate', player), true);
  assert.equal(state.pendingRemoval, true); assert.equal(state.removeAbility('glass', player), false);
  assert.equal(state.removeAbility('hull', player), true);
  assert.equal(state.abilities.filter(id => id === 'hull').length, 1);
  assert.equal(player.maxHP, 225); assert.equal(player.speed, 130); assert.equal(player.hp, 80);
  assert.equal(state.chooseAbility('hull', player), false); assert.equal(state.removeAbility('hull', player), false);
  shop(state); state.chooseAbility('recalibrate', player); state.removeAbility('oversized', player);
  assert.equal(player.projectileSizeMultiplier, 1); assert.equal(player.projectileSpeedMultiplier, 1);
  assert.equal(state.abilities.includes('oversized'), false);
  shop(state); state.chooseAbility('recalibrate', player);
  assert.ok(state.rollDice(() => 5.5 / 7)); assert.equal(state.pendingRemoval, false);
  assert.equal(state.removeAbility('hull', player), false); assert.equal(state.startRound(), true);
});

test('Oversized Rounds doubles size, reduces current shell speed by thirty percent and preserves damage', () => {
  const { state, player } = fixture(['ballistics']);
  const before = getRoguePlayerWeapon(player);
  for (let level = 1; level <= 3; level++) {
    state.abilities.push('oversized'); state.applyStats(player);
    const weapon = getRoguePlayerWeapon(player);
    assert.equal(weapon.projectileRadius, before.projectileRadius * 2 ** level);
    assert.ok(Math.abs(weapon.projectileSpeed - before.projectileSpeed * .7 ** level) < 1e-8);
    assert.equal(weapon.damage, before.damage);
  }
});

test('Devil’s Bargain doubles all earned points and damage after armor, and removing it restores both', () => {
  const { state, player } = fixture(['bargain']);
  state.levels.armor = 5; state.applyStats(player);
  state.awardKills(3); assert.equal(state.points, 30); assert.equal(state.pointsEarned, 30);
  player.takeDamage(25); assert.equal(player.hp, 85); assert.equal(player.runStats.damageTaken, 40);
  player.takeDamage(1); assert.equal(player.hp, 83);
  shop(state); state.chooseAbility('recalibrate', player); state.removeAbility('bargain', player);
  assert.equal(player.incomingDamageMultiplier, 1); assert.equal(player.pointMultiplier, 1);
  state.phase = 'combat'; state.awardKills(1); assert.equal(state.points, 35);
});

test('Round Dividend grants round times 100 once, multiplies income and caps every source at 5000', () => {
  const { state, player } = fixture(['dividends', 'bargain']);
  state.points = 4900; state.awardKills(100);
  assert.equal(state.points, 5000); assert.equal(state.pointsEarned, 100);
  state.points = 0; state.round = 5; state.tick(ROUND_SECONDS, player.hp);
  assert.equal(state.points, 1000); assert.equal(state.pointsEarned, 1100);
  state.tick(ROUND_SECONDS, player.hp); assert.equal(state.pointsEarned, 1100);
  state.phase = 'combat'; state.round = 30; state.tick(ROUND_SECONDS, player.hp);
  assert.equal(state.phase, 'won'); assert.equal(state.points, 5000); assert.equal(state.pointsEarned, 5100);
  const summary = getRogueRunSummary(state, player.runStats);
  assert.equal(summary.length, 6); assert.equal(state.pointsEarned, 5100);
});

test('removing Dividend removes the cap and lethal round endings never grant a clear reward', () => {
  const { state, player } = fixture(['dividends']);
  shop(state); state.chooseAbility('recalibrate', player); state.removeAbility('dividends', player);
  state.phase = 'combat'; state.awardKills(3000); assert.equal(state.points, 15000);
  state.abilities = ['dividends']; state.applyStats(player); assert.equal(state.points, 5000);
  state.points = 0; state.tick(ROUND_SECONDS, 0); assert.equal(state.phase, 'lost'); assert.equal(state.points, 0);
});

test('Pulse Shield follows combat time, blocks direct and explosive damage, resets per round, and disappears when removed', () => {
  const { world, state, player } = fixture(['shield', 'bargain']);
  player.update(2.99, world, input); player.takeDamage(10); assert.equal(player.hp, 105);
  player.update(.01, world, input); assert.equal(player.isShieldActive(), true);
  player.takeDamage(10000); assert.equal(player.hp, 105);
  world.causeWeaponExplosion(player.x, player.y, 'red', { radius: 100, minDamage: 100, maxDamage: 100, pushForce: 0 }, false);
  assert.equal(player.hp, 105);
  player.update(1, world, input); assert.equal(player.isShieldActive(), false);
  player.takeDamage(10); assert.equal(player.hp, 85);
  player.update(2, world, input); assert.equal(player.isShieldActive(), true);
  world.startRound(2); assert.equal(player.isShieldActive(), false); assert.equal(player.combatElapsed, 0);
  player.combatElapsed = 3; shop(state); state.chooseAbility('recalibrate', player); state.removeAbility('shield', player);
  assert.equal(player.isShieldActive(), false);
});

test('victory and loss pause music immediately; intermediate rounds leave it playing', () => {
  for (const phase of ['won', 'lost', 'shop']) {
    let paused = 0;
    const game = { state: { phase, round: phase === 'shop' ? 2 : 30 }, world: { player: {} },
      rewardSession: { settle() { return 0; } },
      bgm: { pause() { paused++; } }, history: { record() {} }, root: { classList: { add() {} } },
      el: () => ({ classList: { toggle() {} } }), advanceRoundTransition() {},
    };
    RogueGame.prototype.beginRoundTransition.call(game);
    assert.equal(paused, phase === 'shop' ? 0 : 1);
  }
});
