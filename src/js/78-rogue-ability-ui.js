import { ABILITIES, abilityRarity, abilityIcon, previewAbility } from './41-rogue-abilities.js';

import { t, tx } from './24-i18n.js';
import { abilityName, abilityDescription, rarityName, statValue } from './75-localized-game-text.js';

export function renderRogueAbilityChoices(game, ended) {
  const { state } = game;
  const before = state.abilitiesBeforeChoice ?? state.abilities;
  for (const [index, card] of game.abilityCards.entries()) {
    const id = state.abilityChoices[index], ability = ABILITIES[id];
    card.hidden = ended || !ability;
    if (card.hidden) continue;
    const selected = !state.isSuperMode && state.selectedAbility === id;
    const level = state.abilities.filter(item => item === id).length;
    const rarity = abilityRarity(id);
    card.dataset.ability = id; card.dataset.rarity = rarity;
    card.disabled = state.diceRolled || state.pendingRemoval || !state.canChooseAbility(id);
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    card.querySelector('.rogue-ability-icon').innerHTML = abilityIcon(id);
    card.querySelector('h2').textContent = abilityName(id);
    card.querySelector('p').textContent = abilityDescription(id, state.isSuperMode);
    card.querySelector('.rogue-ability-status').textContent = `${rarityName(rarity)} · ${selected ? t('ability.selected') : level ? `Lv.${level} → ${level + 1}` : t('ability.free')}`;
    const changes = ability.action ? [] : previewAbility(state.levels, before, id).filter(change => !state.isSuperMode || !['points', 'pointsCap', 'roundIncome'].includes(change.key));
    card.title = changes.map(change => `${tx(change.label)}: ${statValue(change.before)} → ${statValue(change.after)}`).join('\n');
    const list = card.querySelector('.rogue-ability-changes');
    list.replaceChildren();
    for (const change of changes.slice(0, 3)) {
      const row = document.createElement('li'), label = document.createElement('span'), value = document.createElement('strong');
      label.textContent = tx(change.label); value.textContent = `${statValue(change.before)} → ${statValue(change.after)}`;
      row.append(label, value); list.append(row);
    }
    if (!list.children.length) {
      const row = document.createElement('li');
      row.textContent = ability.action ? state.removedAbility ? t('ability.removed', { name: abilityName(state.removedAbility) }) : t('ability.pickTarget') : t('ability.limit');
      list.append(row);
    }
  }
  const owned = game.root.querySelector('.rogue-owned');
  owned.replaceChildren();
  owned.setAttribute('aria-label', state.abilities.length ? 'Acquired abilities' : 'No acquired abilities');
  const counts = new Map();
  for (const id of state.abilities) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    const badge = document.createElement('span'); badge.className = 'rogue-owned-ability'; badge.dataset.rarity = abilityRarity(id);
    badge.innerHTML = abilityIcon(id);
    const label = document.createElement('span'); label.className = 'rogue-owned-label'; label.textContent = `Lv.${count}`;
    badge.append(label); badge.title = `${abilityName(id)} Lv.${count}: ${abilityDescription(id, state.isSuperMode)}`;
    badge.setAttribute('aria-label', badge.title); owned.append(badge);
  }
  const panel = game.el?.('recalibration');
  if (!panel) return;
  panel.hidden = ended || !state.pendingRemoval;
  if (panel.hidden) return;
  const targets = panel.querySelector('.rogue-removal-targets'); targets.replaceChildren();
  for (const [id, level] of counts) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.removeAbility = id;
    button.textContent = `${abilityName(id)} · ${level === 1 ? t('ability.remove') : `Lv.${level} → ${level - 1}`}`;
    button.addEventListener('click', () => { if (state.removeAbility(id, game.world.player)) game.renderPanel(); });
    targets.append(button);
  }
}
