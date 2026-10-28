import { ABILITIES, RARITIES, abilityRarity, abilityIcon, previewAbility } from './41-rogue-abilities.js';

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
    card.querySelector('h2').textContent = ability.name;
    card.querySelector('p').textContent = state.isSuperMode ? ability.description.replace(/ Maximum level \d+\./g, '').replace('Your points are capped at 5,000.', 'Run points remain unlimited in Super Mode.') : ability.description;
    card.querySelector('.rogue-ability-status').textContent = `${RARITIES[rarity].name} · ${selected ? 'Selected' : level ? `Lv.${level} → ${level + 1}` : 'Free ability'}`;
    const changes = ability.action ? [] : previewAbility(state.levels, before, id).filter(change => !state.isSuperMode || !['points', 'pointsCap', 'roundIncome'].includes(change.key));
    card.title = changes.map(change => `${change.label}: ${change.before} → ${change.after}`).join('\n');
    const list = card.querySelector('.rogue-ability-changes');
    list.replaceChildren();
    for (const change of changes.slice(0, 3)) {
      const row = document.createElement('li'), label = document.createElement('span'), value = document.createElement('strong');
      label.textContent = change.label; value.textContent = `${change.before} → ${change.after}`;
      row.append(label, value); list.append(row);
    }
    if (!list.children.length) {
      const row = document.createElement('li');
      row.textContent = ability.action ? state.removedAbility ? `Removed one level: ${ABILITIES[state.removedAbility].name}` : 'Choose an owned ability after selecting this card.' : 'Stat limit reached.';
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
    badge.append(label); badge.title = `${ABILITIES[id].name} Lv.${count}: ${ABILITIES[id].description}`;
    badge.setAttribute('aria-label', badge.title); owned.append(badge);
  }
  const panel = game.el?.('recalibration');
  if (!panel) return;
  panel.hidden = ended || !state.pendingRemoval;
  if (panel.hidden) return;
  const targets = panel.querySelector('.rogue-removal-targets'); targets.replaceChildren();
  for (const [id, level] of counts) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.removeAbility = id;
    button.textContent = `${ABILITIES[id].name} · ${level === 1 ? 'Remove' : `Lv.${level} → ${level - 1}`}`;
    button.addEventListener('click', () => { if (state.removeAbility(id, game.world.player)) game.renderPanel(); });
    targets.append(button);
  }
}
