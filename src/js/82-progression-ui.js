import { getProgression, SUPER_UNLOCK_COST } from './23-progression.js';
import { MODE_CARDS } from './80-mode-cards.js';

export function installProgressionUI(startSuper) {
  const store = getProgression();
  const status = document.getElementById('progression-status');
  const retry = document.getElementById('progression-save');
  function refresh() {
    store.reload();
    document.getElementById('victory-wallet').textContent = store.data.points.toLocaleString('en-US');
    status.textContent = store.error || 'Win: +20 per personal kill; Roguelite: bank remaining run points. Super Mode: no rewards.';
    retry.hidden = !store.dirty;
    for (const card of MODE_CARDS) {
      const button = document.querySelector(`[data-super-mode="${card.id}"]`);
      const unlocked = store.isUnlocked(card.id);
      button.textContent = unlocked ? 'Play Super' : `Unlock Super · ${SUPER_UNLOCK_COST.toLocaleString('en-US')} pts`;
      button.setAttribute('aria-label', `${card.title}: ${button.textContent}`);
      button.disabled = store.blocked || (!unlocked && store.data.points < SUPER_UNLOCK_COST);
    }
  }
  for (const card of MODE_CARDS) {
    document.querySelector(`[data-super-mode="${card.id}"]`).addEventListener('click', event => {
      event.stopPropagation();
      store.reload();
      if (store.isUnlocked(card.id)) startSuper(card.id);
      else { store.unlock(card.id); refresh(); }
    });
  }
  retry.addEventListener('click', () => { store.save(); refresh(); });
  window.addEventListener('storage', refresh);
  refresh();
  return refresh;
}
