import english from '../locales/en.json' with { type: 'json' };

export const LANGUAGE_KEY = 'tank-battle.language.v1';
// Register complete, reviewed translations here. All catalogs are bundled offline.
export const LANGUAGE_CATALOGS = Object.freeze({ en: Object.freeze({ name: 'English', messages: Object.freeze(english) }) });

export function createI18n({ catalogs = LANGUAGE_CATALOGS, storage, locale = 'en' } = {}) {
  const listeners = new Set();
  const resolve = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase().replaceAll('_', '-');
    return Object.keys(catalogs).find(key => key.toLowerCase() === normalized)
      ?? Object.keys(catalogs).find(key => key.toLowerCase() === normalized.split('-')[0]) ?? null;
  };
  let current = resolve(locale) ?? 'en';
  try { current = resolve(storage?.getItem(LANGUAGE_KEY)) ?? current; } catch { /* Storage is optional for language preferences. */ }
  return {
    get locale() { return current; },
    get languages() { return Object.entries(catalogs).map(([code, catalog]) => ({ code, name: catalog.name })); },
    t(key, params = {}, fallback = key) {
      const lookup = code => Object.hasOwn(catalogs[code]?.messages ?? {}, key) ? catalogs[code].messages[key] : undefined;
      const message = lookup(current) ?? lookup('en') ?? fallback;
      return String(message).replace(/\{([\w]+)\}/g, (token, name) => Object.hasOwn(params, name) ? String(params[name]) : token);
    },
    number(value) { return new Intl.NumberFormat(current).format(value); },
    setLocale(value) {
      const next = resolve(value);
      if (!next) return false;
      if (current === next) return true;
      current = next;
      try { storage?.setItem(LANGUAGE_KEY, next); } catch { /* Continue in memory when persistence is unavailable. */ }
      for (const listener of listeners) listener(current);
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

let instance;
export function getI18n() {
  if (!instance) {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Sandboxed/offline browsers can deny access. */ }
    instance = createI18n({ storage });
  }
  return instance;
}
export const t = (key, params, fallback) => getI18n().t(key, params, fallback);

// Text and accessible attributes only: translations are never evaluated as HTML.
const originalText = new WeakMap();
export function applyTranslations(root = document, language = getI18n()) {
  const elements = [...root.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-aria-label]')];
  if (root.matches?.('[data-i18n], [data-i18n-title], [data-i18n-aria-label]')) elements.unshift(root);
  for (const element of elements) {
    for (const [attribute, target] of [['data-i18n', null], ['data-i18n-title', 'title'], ['data-i18n-aria-label', 'aria-label']]) {
      const key = element.getAttribute(attribute);
      if (!key) continue;
      if (!originalText.has(element)) originalText.set(element, {});
      const originals = originalText.get(element);
      originals[attribute] ??= target ? element.getAttribute(target) : element.textContent;
      const fallback = originals[attribute];
      const translated = language.t(key, {}, fallback);
      if (target) element.setAttribute(target, translated); else element.textContent = translated;
    }
  }
}
