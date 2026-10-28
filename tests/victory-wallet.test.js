import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressionStore, PROGRESSION_KEY, PROGRESSION_MODES, SUPER_UNLOCK_COST, getVictoryReward, parseProgression, renderProgressionGuide } from '../src/js/23-progression.js';
import { RogueState } from '../src/js/42-rogue-state.js';
import { ABILITIES } from '../src/js/41-rogue-abilities.js';

function memoryStorage(points = 0) {
  let raw = JSON.stringify({ version: 1, points, unlocked: [], receipts: [] });
  return { getItem: () => raw, setItem(key, value) { assert.equal(key, PROGRESSION_KEY); raw = value; } };
}

test('only normal victories bank personal kills; Roguelite banks held points without kill bonuses', () => {
  for (const mode of PROGRESSION_MODES) {
    assert.equal(getVictoryReward({ mode, won: true, kills: 17, runPoints: 123 }), mode === 'roguelite' ? 123 : 340);
    assert.equal(getVictoryReward({ mode, won: false, kills: 999, runPoints: 999 }), 0);
    assert.equal(getVictoryReward({ mode, won: true, superMode: true, kills: 999, runPoints: Infinity }), 0);
    assert.equal(getVictoryReward({ mode, won: true, spectator: true, kills: 999 }), 0);
  }
  for (const kills of [NaN, Infinity, -1, '10', 0.5]) assert.equal(getVictoryReward({ mode: 'frontline', won: true, kills }), 0);
});

test('victory settlement persists once and all five permanent unlocks spend exactly 500,000', () => {
  const storage = memoryStorage();
  const store = new ProgressionStore(storage);
  assert.equal(store.unlock('frontline'), false);
  assert.equal(store.settle('first', { mode: 'frontline', won: true, kills: 25000 }), 500000);
  assert.equal(store.settle('first', { mode: 'frontline', won: true, kills: 25000 }), 0);
  for (const mode of PROGRESSION_MODES) {
    assert.equal(store.unlock(mode), true);
    assert.equal(store.unlock(mode), false);
    assert.equal(new ProgressionStore(storage).isUnlocked(mode), true);
  }
  assert.equal(store.data.points, 0); assert.equal(SUPER_UNLOCK_COST, 100000);
  assert.equal(store.unlock('unknown'), false);
});

test('damaged saves are protected; failed unlocks do not spend points; failed rewards can be retried', () => {
  const corrupt = { getItem: () => '{invalid', setItem() { assert.fail('must not overwrite'); } };
  const bad = new ProgressionStore(corrupt);
  assert.equal(bad.blocked, true); assert.equal(bad.unlock('roguelite'), false);
  assert.equal(bad.settle('bad', { mode: 'roguelite', won: true, runPoints: 10 }), 0);
  assert.throws(() => parseProgression('{"version":2}'));
  const storage = memoryStorage(100000), write = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  const store = new ProgressionStore(storage);
  assert.equal(store.unlock('roguelite'), false);
  assert.equal(store.data.points, 100000); assert.deepEqual(store.data.unlocked, []);
  store.settle('retry', { mode: 'roguelite', won: true, runPoints: 123 });
  assert.equal(store.data.points, 100123); assert.equal(store.dirty, true);
  storage.setItem = write; assert.equal(store.save(), true);
  assert.equal(new ProgressionStore(storage).data.points, 100123);
});

test('Roguelite extraction starts after clearing 15, is unavailable during dice/combat, and preserves remaining points', () => {
  const state = new RogueState(), player = { hp: 125, maxHP: 125 };
  for (let round = 1; round <= 15; round++) {
    assert.equal(state.canExtract, false);
    state.tick(40, 125);
    if (round < 15) { assert.equal(state.extract(125), false); state.rollDice(() => 0); state.startRound(); }
  }
  assert.equal(state.round, 16); assert.equal(state.canExtract, true);
  state.points = 100; state.buy('damage', player); assert.equal(state.points, 95);
  assert.equal(state.extract(0), false); assert.equal(state.extract(125), true);
  assert.equal(state.phase, 'won'); assert.equal(state.points, 95); assert.equal(state.extracted, true);
  assert.equal(state.extract(125), false);
  const locked = new RogueState(); locked.round = 16; locked.phase = 'shop'; locked.rollDice(() => 0);
  assert.equal(locked.extract(125), false);
});

test('Roguelite Super shows every ability and repeats max-level and prerequisite powers without consuming infinite points', () => {
  const state = new RogueState(true), player = { hp: 125, maxHP: 125, ammo: 300 };
  state.tick(40,125); assert.deepEqual(state.abilityChoices, Object.keys(ABILITIES));
  assert.equal(state.chooseAbility('blast', player), true); // No prerequisite in Super.
  for (let i=0;i<4;i++) assert.equal(state.chooseAbility('oversized', player), true);
  for (let i=0;i<2;i++) assert.equal(state.chooseAbility('shield', player), true);
  assert.equal(player.projectileSizeMultiplier, 16); assert.equal(player.pulseShield, true);
  state.chooseAbility('dividends', player); assert.equal(state.points, Infinity); assert.equal(player.pointsCap, Infinity);
  assert.equal(state.buy('damage', player), true); assert.equal(state.buyAmmo(player, 1000), true);
  assert.equal(state.points, Infinity); assert.equal(player.ammo, 19300);
  assert.equal(state.chooseAbility('recalibrate', player), true);
  assert.equal(state.chooseAbility('hull', player), false);
  assert.equal(state.removeAbility('oversized', player), true); assert.equal(player.projectileSizeMultiplier, 8);
  assert.equal(state.chooseAbility('hull', player), true);
  state.rollDice(() => 0); assert.equal(state.chooseAbility('hull', player), false);
});

test('normal ability limits and death rewards stay separate from the new progression system', () => {
  const normal = new RogueState(), player = { hp: 125, maxHP: 125 };
  normal.tick(40,125); normal.abilityChoices=['hull','ricochet'];
  assert.equal(normal.chooseAbility('hull',player),true); assert.equal(normal.chooseAbility('ricochet',player),false);
  normal.rollDice(()=>0); normal.startRound(); normal.points=9999; normal.tick(1,0);
  assert.equal(normal.phase,'lost');
  assert.equal(getVictoryReward({mode:'roguelite',won:normal.phase==='won',runPoints:normal.points}),0);
  assert.match(renderProgressionGuide(), /100,000/); assert.match(renderProgressionGuide(), /Round 16/);
});
