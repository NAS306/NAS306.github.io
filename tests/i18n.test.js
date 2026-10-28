import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, LANGUAGE_KEY, LANGUAGE_CATALOGS } from '../src/js/24-i18n.js';
import { ROUND_SECONDS, KILL_POINTS, UPGRADES } from '../src/js/42-rogue-state.js';
import { ROUND_AMMO_SUPPLY, STARTING_AMMO } from '../src/js/20-rogue-ammo.js';
import { ABILITY_CHOICE_COUNT, calculateRogueStats } from '../src/js/41-rogue-abilities.js';
import { renderRogueGuide } from '../src/js/77-rogue-guide.js';

const catalogs = {
  en: { name: 'English', messages: { greeting: 'Hello {name}', fallback: 'English fallback', literal: '{value}', 'menu.select': 'Mode Select' } },
  ko: { name: '한국어', messages: { greeting: '안녕하세요 {name}', 'menu.select': '모드 선택' } },
  de: { name: 'Deutsch', messages: {} },
};

test('production keeps English; future catalogs switch without a reload and notify subscribers', () => {
  assert.deepEqual(Object.keys(LANGUAGE_CATALOGS), ['en']);
  const language = createI18n({ catalogs }), changes = [];
  const unsubscribe = language.subscribe(locale => changes.push(locale));
  assert.equal(language.setLocale('ko-KR'), true);
  assert.equal(language.t('greeting', { name: 'Tank' }), '안녕하세요 Tank');
  assert.equal(language.t('fallback'), 'English fallback');
  assert.equal(language.setLocale('unknown'), false); assert.equal(language.locale, 'ko');
  assert.equal(language.setLocale('ko'), true); assert.deepEqual(changes, ['ko']);
  unsubscribe(); language.setLocale('en'); assert.deepEqual(changes, ['ko']);
  assert.equal(language.t('greeting', { name: 'Tank' }), 'Hello Tank');
});

test('language preferences persist independently of progression; unavailable storage falls back safely', () => {
  const values = new Map([['tank-battle.progression.v1', 'keep existing wallet']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const language = createI18n({ catalogs, storage }); language.setLocale('ko');
  assert.equal(values.get(LANGUAGE_KEY), 'ko');
  assert.equal(values.get('tank-battle.progression.v1'), 'keep existing wallet');
  assert.equal(createI18n({ catalogs, storage }).locale, 'ko');
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const temporary = createI18n({ catalogs, storage: denied });
  assert.equal(temporary.locale, 'en'); assert.equal(temporary.setLocale('ko'), true);
  assert.equal(temporary.t('menu.select'), '모드 선택');
});

test('translation interpolation preserves literal values, missing keys and locale number formatting', () => {
  const language = createI18n({ catalogs });
  assert.equal(language.t('literal', { value: '$& <img> {name}' }), '$& <img> {name}');
  assert.equal(language.t('missing'), 'missing');
  assert.equal(language.t('constructor'), 'constructor');
  assert.equal(language.t('missing', {}, 'Original English'), 'Original English');
  assert.equal(language.t('greeting'), 'Hello {name}');
  language.setLocale('de'); assert.equal(language.number(1234.5), '1.234,5');
});

test('current balance is reflected in the guide, rewards and upgrade descriptions', () => {
  assert.equal(STARTING_AMMO, 300); assert.equal(ROUND_AMMO_SUPPLY, 200);
  assert.equal(KILL_POINTS, 5); assert.equal(ROUND_SECONDS, 30); assert.equal(ABILITY_CHOICE_COUNT, 4);
  const levels = { speed: 0, damage: 0, attackSpeed: 0, armor: 3 };
  assert.equal(calculateRogueStats(levels, []).armor, 3);
  assert.match(UPGRADES.armor.description, /−1 damage per hit/);
  const guide = renderRogueGuide();
  for (const pattern of [/30 rounds of 30 seconds/, /200 free ammo/, /5 base points/, /4 different cards/, /−1 damage per hit/]) assert.match(guide, pattern);
});
