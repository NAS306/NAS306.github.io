import { t, getI18n } from './24-i18n.js';
import { SUPER_UNLOCK_COST, VICTORY_POINTS_PER_KILL, EXTRACTION_ROUND } from './23-progression.js';
import { STARTING_AMMO, ROUND_AMMO_SUPPLY, EXPLOSIVE_AMMO_COST } from './20-rogue-ammo.js';
import { ROGUE_PLAYER_BASE, ARMOR_PER_UPGRADE } from './40-rogue-balance.js';
import { ABILITIES, ABILITY_CHOICE_COUNT, abilityRarity } from './41-rogue-abilities.js';
import { ROUND_COUNT, ROUND_SECONDS, KILL_POINTS, UPGRADES } from './42-rogue-state.js';
import { abilityName, abilityDescription, rarityName } from './75-localized-game-text.js';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const section = (title, text) => `<section><h3>${escape(title)}</h3><p>${escape(text)}</p></section>`;
export function renderLocalizedProgressionGuide() {
  return section(t('guide.progression'), t('guide.progressionText', { killPoints: VICTORY_POINTS_PER_KILL }))
    + section(t('wallet.playSuper'), t('guide.unlockText', { cost: getI18n().number(SUPER_UNLOCK_COST), total: getI18n().number(SUPER_UNLOCK_COST * 5) }));
}
export function renderLocalizedRogueGuide() {
  const paragraphs = [
    ['survival', { rounds: ROUND_COUNT, seconds: ROUND_SECONDS, hp: ROGUE_PLAYER_BASE.maxHP, ammo: STARTING_AMMO, extract: EXTRACTION_ROUND }],
    ['economy', { points: KILL_POINTS, rounds: ROUND_COUNT, supply: ROUND_AMMO_SUPPLY, choices: ABILITY_CHOICE_COUNT, payload: EXPLOSIVE_AMMO_COST }],
    ['ability', {}], ['enemy', {}], ['results', {}],
  ];
  const titles = { ability: 'abilities', enemy: 'enemies' };
  const upgrades = `<section><h3>${escape(t('rogue.upgradeHeading'))}</h3><table>${Object.keys(UPGRADES).map(key => `<tr><td>${escape(t(`upgrade.${key}.name`))}</td><td>${escape(t(`upgrade.${key}.description`, { amount: ARMOR_PER_UPGRADE }))}</td></tr>`).join('')}</table></section>`;
  const abilities = `<section><h3>${escape(t('guide.abilities'))}</h3><table class="rogue-guide-abilities">${Object.keys(ABILITIES).map(id => `<tr data-guide-ability="${id}"><td>${escape(abilityName(id))}</td><td data-rarity="${abilityRarity(id)}">${escape(rarityName(abilityRarity(id)))}</td><td>${escape(abilityDescription(id))}</td></tr>`).join('')}</table></section>`;
  return renderLocalizedProgressionGuide() + paragraphs.map(([key, params]) => section(t(`guide.${titles[key] ?? key}`), t(`guide.${key === 'ability' ? 'ability' : key}Text`, params))).join('') + upgrades + abilities;
}
