import test from 'node:test';
import assert from 'node:assert/strict';
import { getAmmoPerPoint, STARTING_AMMO, ROUND_AMMO_SUPPLY } from '../src/js/20-rogue-ammo.js';
import { DIVIDEND_RULES, ABILITIES } from '../src/js/41-rogue-abilities.js';
import { RogueState, ROUND_COUNT, UPGRADES } from '../src/js/42-rogue-state.js';
import { renderRogueGuide } from '../src/js/77-rogue-guide.js';
import { renderModeCards } from '../src/js/80-mode-cards.js';

test('ammo prices decrease one shell per round from twenty to one, then stay at one', () => {
  for (const [round, expected] of [[1, 20], [2, 19], [10, 11], [19, 2], [20, 1], [21, 1], [30, 1]]) {
    assert.equal(getAmmoPerPoint(round), expected);
  }
  for (const value of [0, -1, 1.5, NaN, Infinity, '2']) assert.throws(() => getAmmoPerPoint(value), RangeError);
  assert.equal(STARTING_AMMO, 300); assert.equal(ROUND_AMMO_SUPPLY, 200);
});

test('actual ammo purchases use the upcoming round and spend exactly the entered points', () => {
  for (const [round, rate] of [[2, 19], [10, 11], [19, 2], [20, 1], [30, 1]]) {
    const state = new RogueState(); state.phase = 'shop'; state.round = round; state.points = 10;
    const player = { ammo: 300 };
    assert.equal(state.buyAmmo(player, 3), true);
    assert.equal(player.ammo, 300 + rate * 3); assert.equal(state.points, 7);
  }
});

test('Dividend tuning, English help and ability card all share the new 100 / 5000 rules', () => {
  assert.deepEqual(DIVIDEND_RULES, { pointsPerRound: 100, pointsCap: 5000 });
  assert.equal(ABILITIES.dividends.effects.roundIncome, 100);
  assert.match(ABILITIES.dividends.description, /round ×100 points/);
  assert.match(ABILITIES.dividends.description, /5,000/);
  const html = renderRogueGuide();
  assert.equal([...html.matchAll(/data-guide-ability=/g)].length, 30);
  assert.ok(html.includes(`${ROUND_COUNT} rounds of 30 seconds`));
  for (const item of Object.values(UPGRADES)) assert.ok(html.includes(item.name));
  assert.match(html, /200 free ammo/); assert.match(html, /Round 20/);
  assert.match(html, /round ×100 points/); assert.match(html, /5,000/);
  assert.doesNotMatch(html, /10,000|round ×200 points/);
});

test('the selector guide trigger is above and outside the deploy button', () => {
  const html = renderModeCards();
  assert.equal([...html.matchAll(/data-scenario=/g)].length, 5);
  assert.equal([...html.matchAll(/data-rogue-guide/g)].length, 1);
  assert.ok(html.indexOf('data-rogue-guide') < html.indexOf('data-scenario="roguelite"'));
  assert.match(html, /aria-label="Read Roguelite mode guide"[^>]*>.*?<\/button><button class="scenario-button" data-scenario="roguelite"/s);
});
