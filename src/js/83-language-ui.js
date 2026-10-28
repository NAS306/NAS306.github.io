import { getI18n, applyTranslations } from './24-i18n.js';

export function installLanguageUI() {
  const language = getI18n();
  let select;
  if (language.languages.length > 1) {
    const label = document.createElement('label'), text = document.createElement('span');
    label.className = 'language-picker'; text.dataset.i18n = 'language.label';
    select = document.createElement('select'); select.setAttribute('aria-label', language.t('language.label'));
    for (const { code, name } of language.languages) {
      const option = document.createElement('option'); option.value = code; option.textContent = name; select.append(option);
    }
    select.addEventListener('change', () => language.setLocale(select.value));
    label.append(text, select); document.querySelector('.selector-topline').append(label);
  }
  const refresh = () => {
    document.documentElement.lang = language.locale;
    applyTranslations();
    for (const [index, button] of [...document.querySelectorAll('[data-scenario]')].entries()) {
      button.setAttribute('aria-label', `${language.number(index + 1)}. ${button.querySelector('.mode-name').textContent}. ${button.querySelector('.mode-description').textContent}`);
    }
    if (select) { select.value = language.locale; select.setAttribute('aria-label', language.t('language.label')); }
  };
  language.subscribe(refresh); refresh();
}
