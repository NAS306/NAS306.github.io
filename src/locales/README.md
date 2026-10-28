# Localization foundation

The offline build ships English (`en`), Korean (`ko`), Simplified Chinese (`zh`), Japanese (`ja`) and Russian (`ru`). The translucent top-right translation launcher is available in the selector, combat, preparation, results and above the native guide dialog.

- `en.json` is the English message catalog. Use stable semantic keys and named placeholders, such as `rogue.startRound` and `{round}`. Do not store game balance values in translations; pass them as parameters.
- `src/js/24-i18n.js` owns catalog registration, key lookup, English fallback, number formatting, subscriptions and the separate `tank-battle.language.v1` browser preference. It never changes the victory wallet or match state.
- `src/js/83-language-ui.js` owns the native language dialog and floating launcher, applies text and accessible attributes, and restores focus when settings close. Opening settings acquires a shared pause lease from `14-game-pause.js`, pauses music, and closing releases the lease. Music resumes only if it was playing before settings opened.
- Both game loops check the shared pause before simulation, dice, transitions or ending effects. Pause/resume clears held inputs, long-press timers and accumulated elapsed time. Locale changes only redraw UI; they do not start rounds, grant supplies early, buy upgrades or reset run history.
- `75-localized-game-text.js` derives translated ability effects from actual balance data, so numerical effects cannot drift between languages. `76-localized-guide.js` composes translated survival, economy, progression, abilities, enemies and result instructions with the same game constants. English retains its detailed original manual.
- Semantic message keys cover dynamic UI. `text.*` keys cover legacy static text nodes while preserving their original English text and nested elements. Translations are applied at initialization, locale changes and panel render, never through an always-running DOM observer. Standard game abbreviations such as HP, Lv., px and key names remain recognizable across languages.

## Add a language

1. Create a UTF-8 JSON catalog beside `en.json`, preserving keys and placeholder names. Translate text only; HTML is not supported.
2. Import the JSON in `24-i18n.js` with `with { type: 'json' }`, then register its code, native display name and messages in `LANGUAGE_CATALOGS`. Keep English registered. The build embeds catalogs into the single offline HTML; no network requests or runtime JSON loading are needed.
3. Use `t(key, parameters, optionalEnglishFallback)` for dynamic strings and `data-i18n`, `data-i18n-title` or `data-i18n-aria-label` on text-only DOM elements. Keep elements with icons or nested markup out of `data-i18n`; mark a leaf span instead. Dynamic views should subscribe to locale changes and unsubscribe when disposed. Missing translations fall back to English.
4. Run `npm run check`, `npm run test:browser` and `node scripts/language-browser-check.js`. Catalogs must share all keys and named placeholders. Review compact cards at 1280×800, mobile selection, focus, nested guide/settings dialogs, number formatting and localized result tooltips. Check combat, preparation, dice, transitions and results pause without changing purchases, currency, HP, ammo or the active run.

Back up existing source files as `filename_BU.ext` before editing. Modify source/catalogs, then run `node build.js`; never edit the generated HTML directly.
