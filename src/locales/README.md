# Localization foundation

English remains the only shipped language. No empty language selector is shown.

- `en.json` is the English message catalog. Use stable semantic keys and named placeholders, such as `rogue.startRound` and `{round}`. Do not store game balance values in translations; pass them as parameters.
- `src/js/24-i18n.js` owns catalog registration, key lookup, English fallback, number formatting, subscriptions and the separate `tank-battle.language.v1` browser preference. It never changes the victory wallet or match state.
- `src/js/83-language-ui.js` applies static text and accessible attributes, updates the document language and automatically shows a language picker when two or more catalogs are registered.
- Initial integration covers mode names/descriptions, the selector, wallet actions, Roguelite preparation/result headings, upgrade descriptions and main navigation/ammo actions. Ability descriptions, full guide paragraphs, older combat HUD text and storage error messages remain English. Convert those remaining surfaces into English keys before promising a fully translated game.

## Add a language

1. Create a UTF-8 JSON catalog beside `en.json`, preserving keys and placeholder names. Translate text only; HTML is not supported.
2. Import the JSON in `24-i18n.js` with `with { type: 'json' }`, then register its code, native display name and messages in `LANGUAGE_CATALOGS`. Keep English registered. The build embeds catalogs into the single offline HTML; no network requests or runtime JSON loading are needed.
3. Use `t(key, parameters, optionalEnglishFallback)` for dynamic strings and `data-i18n`, `data-i18n-title` or `data-i18n-aria-label` on text-only DOM elements. Keep elements with icons or nested markup out of `data-i18n`; mark a leaf span instead. Dynamic views should subscribe to locale changes and unsubscribe when disposed. Missing translations fall back to English.
4. Run `npm run check` and `npm run test:browser`. Review compact cards at 1280×800, mobile mode selection, keyboard focus, accessible labels, guide content and number formatting. Check switching languages during preparation and results does not reset purchases, currency or the active run.

Back up existing source files as `filename_BU.ext` before editing. Modify source/catalogs, then run `node build.js`; never edit the generated HTML directly.
