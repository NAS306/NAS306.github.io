import { getI18n, applyTranslations, t } from './24-i18n.js';
import { acquireGamePause } from './14-game-pause.js';

export function installLanguageUI() {
  const language = getI18n();
  const button = document.createElement('button');
  button.id = 'translation-button'; button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = '<span aria-hidden="true">文 / A</span><span data-i18n="language.label">Language</span>';
  const dialog = document.createElement('dialog'); dialog.id = 'language-dialog';
  dialog.setAttribute('aria-labelledby', 'language-title');
  dialog.innerHTML = '<h2 id="language-title" data-i18n="language.title"></h2><p data-i18n="language.paused"></p><label><span data-i18n="language.label"></span><select id="language-select"></select></label><button type="button" data-i18n="language.close"></button>';
  const select = dialog.querySelector('select');
  for (const { code, name } of language.languages) {
    const option = document.createElement('option'); option.value = code; option.textContent = name; select.append(option);
  }
  document.body.append(button, dialog);
  // Keep the launcher reachable above a previously opened native guide dialog.
  document.addEventListener('toggle', event => {
    if (event.target instanceof HTMLDialogElement && event.target !== dialog) {
      const active = [...document.querySelectorAll('dialog[open]')].filter(item => item !== dialog).at(-1);
      (active ?? document.body).append(button);
    }
  }, true);
  let releasePause = null, opener = null, resumeMusic = false;
  const bgm = () => document.getElementById('bgm');
  button.addEventListener('click', () => {
    if (dialog.open) return;
    opener = document.activeElement; releasePause = acquireGamePause();
    resumeMusic = !!bgm() && !bgm().paused; bgm()?.pause();
    dialog.showModal(); select.focus();
  });
  select.addEventListener('change', () => language.setLocale(select.value));
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    releasePause?.(); releasePause = null;
    if (resumeMusic) bgm()?.play().catch(() => {});
    resumeMusic = false;
    if (opener?.isConnected) opener.focus();
  });
  const refresh = () => {
    document.documentElement.lang = language.locale; applyTranslations();
    select.value = language.locale; select.setAttribute('aria-label', t('language.label'));
    button.setAttribute('aria-label', t('language.title'));
    for (const [index, card] of [...document.querySelectorAll('[data-scenario]')].entries()) {
      card.setAttribute('aria-label', `${language.number(index + 1)}. ${card.querySelector('.mode-name').textContent}. ${card.querySelector('.mode-description').textContent}`);
    }
  };
  language.subscribe(refresh); refresh();
}
