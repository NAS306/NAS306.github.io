import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LANGUAGE_CATALOGS, getI18n } from '../src/js/24-i18n.js';
import { acquireGamePause, isGamePaused, subscribeGamePause } from '../src/js/14-game-pause.js';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { abilityName, abilityDescription } from '../src/js/75-localized-game-text.js';
import { renderRogueGuide } from '../src/js/77-rogue-guide.js';

test('all five catalogs have matching keys and named placeholders', () => {
  const english = LANGUAGE_CATALOGS.en.messages;
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const { messages } of Object.values(LANGUAGE_CATALOGS)) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort());
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, 'string'); assert.ok(value.trim(), key);
      assert.deepEqual(placeholders(value), placeholders(english[key]), key);
    }
  }
});

test('all four new languages translate ability names, live numerical effects and the full guide', () => {
  const language = getI18n();
  try {
    for (const locale of ['ko', 'zh', 'ja', 'ru']) {
      language.setLocale(locale);
      assert.notEqual(abilityName('piercing'), 'Piercing Rounds');
      assert.match(abilityDescription('piercing'), /15%/);
      assert.match(abilityDescription('overcharge'), /50%/);
      assert.match(abilityDescription('dividends'), /100/);
      assert.ok(!abilityDescription('dividends', true).includes('5,000'));
      const guide = renderRogueGuide();
      assert.equal([...guide.matchAll(/data-guide-ability=/g)].length, 30);
      assert.ok(guide.includes(abilityName('shield'))); assert.ok(!guide.includes('guide.'));
    }
  } finally { language.setLocale('en'); }
});

test('nested pause leases resume only once after the final modal closes', () => {
  const changes = [], unsubscribe = subscribeGamePause(value => changes.push(value));
  const first = acquireGamePause(), second = acquireGamePause();
  assert.equal(isGamePaused(), true); first(); first(); assert.equal(isGamePaused(), true);
  second(); assert.equal(isGamePaused(), false); assert.deepEqual(changes, [true, false]); unsubscribe();
});

test('both actual frame loops freeze before combat, transitions, dice and ending effects', () => {
  const source = readFileSync(new URL('../src/js/90-game.js', import.meta.url), 'utf8');
  const classSource = source.slice(source.indexOf('export class Game {'), source.indexOf('// main.js'));
  let frames = 0;
  const requestAnimationFrame = () => ++frames;
  const TeamGame = vm.runInNewContext(classSource.replace('export class', 'class') + '; Game;', { isGamePaused, requestAnimationFrame, clampFrameDelta: dt => dt });
  const beforeDocument = globalThis.document, beforeRAF = globalThis.requestAnimationFrame;
  globalThis.document = { hidden: false }; globalThis.requestAnimationFrame = requestAnimationFrame;
  const resume = acquireGamePause();
  try {
    for (const Game of [TeamGame, RogueGame]) {
      const game = { disposed: false, lastTime: 0, accumulator: 10, maxFrameDelta: .25, loop() {}, boundLoop() {}, world: new Proxy({}, { get() { assert.fail('paused loop touched world'); } }) };
      Game.prototype.loop.call(game, 5000);
      assert.equal(game.accumulator, 0); assert.equal(game.lastTime, 5000);
    }
    assert.equal(frames, 2);
  } finally { resume(); globalThis.document = beforeDocument; globalThis.requestAnimationFrame = beforeRAF; }
});
