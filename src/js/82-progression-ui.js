import { getProgression, SUPER_UNLOCK_COST, VICTORY_POINTS_PER_KILL } from './23-progression.js';
import { MODE_CARDS } from './80-mode-cards.js';
import { tx, t, getI18n } from './24-i18n.js';

export function installProgressionUI(startSuper) {
  const store = getProgression();
  const status = document.getElementById('progression-status');
  const retry = document.getElementById('progression-save');
  function refresh() {
    store.reload();
    document.getElementById('victory-wallet').textContent = getI18n().number(store.data.points);
    status.textContent = tx(store.error) || t('wallet.rules', { points: VICTORY_POINTS_PER_KILL });
    retry.hidden = !store.dirty;
    for (const card of MODE_CARDS) {
      const button = document.querySelector(`[data-super-mode="${card.id}"]`);
      const unlocked = store.isUnlocked(card.id);
      button.textContent = unlocked ? t('wallet.playSuper') : t('wallet.unlockSuper', { cost: getI18n().number(SUPER_UNLOCK_COST) });
      button.setAttribute('aria-label', t('wallet.modeAction', { mode: t(`mode.${card.id}.name`, {}, card.title), action: button.textContent }));
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
  getI18n().subscribe(refresh);
  refresh();
  return refresh;
}
