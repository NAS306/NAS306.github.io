import english from '../locales/en.json' with { type: 'json' };
import korean from '../locales/ko.json' with { type: 'json' };
import chinese from '../locales/zh.json' with { type: 'json' };
import japanese from '../locales/ja.json' with { type: 'json' };
import russian from '../locales/ru.json' with { type: 'json' };

export const LANGUAGE_KEY = 'tank-battle.language.v1';
// Register complete, reviewed translations here. All catalogs are bundled offline.
export const LANGUAGE_CATALOGS = Object.freeze(Object.fromEntries([
  ['en', 'English', english], ['ko', '한국어', korean], ['zh', '简体中文', chinese], ['ja', '日本語', japanese], ['ru', 'Русский', russian],
].map(([code, name, messages]) => [code, Object.freeze({ name, messages: Object.freeze(messages) })])));

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
export const tx = value => t(`text.${value}`, {}, value);

// Text and accessible attributes only: translations are never evaluated as HTML.
const originalText = new WeakMap();
const originalNodes = new WeakMap();
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
  // Legacy static text nodes are translated without replacing nested markup.
  const walker = root.ownerDocument?.createTreeWalker?.(root, 4) ?? root.createTreeWalker?.(root, 4);
  if (!walker) return;
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script, style, option, [data-i18n], [data-no-translate]')) continue;
    const source = originalNodes.get(node) ?? node.nodeValue;
    const key = `text.${source.trim()}`;
    if (!Object.hasOwn(english, key)) continue;
    originalNodes.set(node, source);
    node.nodeValue = source.replace(source.trim(), () => language.t(key, {}, source.trim()));
  }
}
