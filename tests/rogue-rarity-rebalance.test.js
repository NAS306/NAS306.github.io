import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, RARITIES, abilityRarity, calculateRogueStats } from '../src/js/41-rogue-abilities.js';
import { RogueState } from '../src/js/42-rogue-state.js';
import { renderRogueGuide } from '../src/js/77-rogue-guide.js';

test('Common has eleven abilities after four modest trades move from Rare; tier chances remain unchanged', () => {
  const counts = { common: 0, rare: 0, legendary: 0 };
  for (const id of Object.keys(ABILITIES)) counts[abilityRarity(id)]++;
  assert.deepEqual(counts, { common: 11, rare: 10, legendary: 9 });
  assert.deepEqual(Object.values(RARITIES).map(tier => tier.chance), [.6, .3, .1]);
  for (const id of ['overcharge', 'piercing', 'blast', 'heavyAmmo']) assert.equal(abilityRarity(id), 'common');
  const guide = renderRogueGuide();
  assert.match(guide, /11 Common, 10 Rare, and 9 Legendary/);
  assert.match(guide, /Common is white, Rare is blue/);
});

test('moved Common powers use smaller benefits and penalties, stack, and lose exactly one level on Recalibration', () => {
  const expected = {
    overcharge: { damageMultiplier: 1.5, attackSpeedMultiplier: .75 },
    piercing: { penetrationBonus: 1, damageMultiplier: .85 },
    blast: { explosionRadiusMultiplier: 1.2, damageMultiplier: .8 },
    heavyAmmo: { damageMultiplier: 1.4, projectileSpeedMultiplier: .85 },
  };
  for (const [id, stats] of Object.entries(expected)) {
    const state = new RogueState(), player = { hp: 10 };
    state.phase = 'shop'; state.abilities = [id, id]; state.abilityChoices = ['recalibrate']; state.applyStats(player);
    const once = calculateRogueStats(state.levels, [id]);
    for (const [key, value] of Object.entries(stats)) assert.equal(once[key], value, `${id}: ${key}`);
    assert.equal(state.chooseAbility('recalibrate', player), true);
    assert.equal(state.removeAbility(id, player), true);
    for (const [key, value] of Object.entries(stats)) assert.equal(player[key], value, `${id} restored ${key}`);
    assert.deepEqual(state.abilities, [id]); assert.equal(player.hp, 10);
  }
});
