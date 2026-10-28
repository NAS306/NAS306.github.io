import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

await mkdir('.qa', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await context.setOffline(true);
const page = await context.newPage();
await page.clock.install();
const errors = [], externalRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
try {
  await page.goto(pathToFileURL(resolve('dist/app.html')).href);
  await page.locator('#loading-screen.is-ready').waitFor();
  assert.equal(await page.locator('[data-scenario]').count(), 5);
  assert.equal(await page.locator('[data-scenario="roguelite"] .mode-name').innerText(), 'Roguelite');
  await page.screenshot({ path: '.qa/mode-select-desktop.png', fullPage: true });
  await page.locator('.mode-guide-button').click();
  const guide = page.locator('.rogue-guide-dialog');
  assert.equal(await guide.isVisible(), true);
  assert.equal(await guide.locator('[data-guide-ability]').count(), 30);
  assert.match(await guide.locator('.rogue-guide-content').innerText(), /30 rounds of 30 seconds/);
  assert.match(await guide.locator('.rogue-guide-content').innerText(), /200 free ammo/);
  assert.match(await guide.locator('.rogue-guide-content').innerText(), /4 different cards/);
  assert.equal(await page.locator('.language-picker').count(), 0);
  assert.match(await guide.locator('[data-guide-ability="dividends"]').innerText(), /round ×100 points.*5,000/s);
  assert.equal(await page.locator('[data-scenario] [data-rogue-guide]').count(), 0);
  await page.keyboard.press('5');
  assert.equal(await page.locator('#rogue-ui').count(), 0);
  await page.screenshot({ path: '.qa/roguelite-guide-selector.png' });
  await guide.getByRole('button', { name: 'Close mode guide' }).click();
  assert.equal(await page.locator('.mode-guide-button').evaluate(button => button === document.activeElement), true);
  // Future language selectors must retain keyboard control instead of starting a match.
  await page.evaluate(() => {
    const select = document.createElement('select'); select.id = 'qa-language-select';
    select.innerHTML = '<option>English</option>'; document.querySelector('.selector-topline').append(select); select.focus();
  });
  await page.keyboard.press('1');
  assert.equal(await page.locator('#loading-screen').isVisible(), true);
  await page.evaluate(() => document.getElementById('qa-language-select').remove());
  await page.locator('.mode-guide-button').click(); await page.keyboard.press('Escape');
  assert.equal(await guide.isVisible(), false);
  for (const mode of ['frontline', 'siege', 'defense', 'breakthrough']) {
    await page.locator(`[data-scenario="${mode}"]`).click();
    await page.locator('#loading-screen').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.TankGame.returnToModeSelection());
    await page.locator('#loading-screen.is-ready:not(.hidden)').waitFor();
  }
  await page.locator('[data-scenario="roguelite"]').click();
  await page.locator('#rogue-ui').waitFor();
  assert.equal(await page.locator('#rogue-shade').evaluate(element => element.hidden), true);
  assert.equal(await page.locator('#rogue-dice-overlay').evaluate(element => element.hidden), true);
  assert.match(await page.locator('#rogue-round').innerText(), /1/);
  await page.screenshot({ path: '.qa/rogue-first-round.png' });
  await page.clock.runFor(45000);
  await page.locator('#rogue-run-summary').waitFor();
  assert.equal(await page.locator('#rogue-run-stats > div').count(), 6);
  assert.equal(await page.evaluate(() => document.getElementById('bgm').paused), true);
  const summary = await page.locator('#rogue-run-stats').innerText();
  await page.screenshot({ path: '.qa/rogue-result.png' });
  const chart = page.locator('#rogue-result-rounds');
  assert.equal(await chart.isVisible(), true);
  assert.equal(await chart.locator('[data-series]').count(), 6);
  assert.equal(await chart.locator('circle').count(), 5);
  assert.match(await chart.locator('[data-metric="ammoPerKill"]').getAttribute('title'), /no value recorded/);
  assert.match(await chart.locator('.rogue-chart-values').innerText(), /R1.*Lost/s);
  assert.match(await chart.locator('tbody tr').getAttribute('title'), /Ability: none \(starting round\)/);
  const metricKeys = await chart.locator('[data-metric]').evaluateAll(buttons => buttons.map(button => button.dataset.metric));
  for (const key of metricKeys) {
    await chart.locator(`[data-metric="${key}"]`).click();
    assert.equal(await chart.locator(`[data-series="${key}"]`).count(), 0);
  }
  assert.match(await chart.locator('.rogue-chart-note').innerText(), /Use the legend/);
  assert.equal(await chart.locator('tbody tr').count(), 1);
  for (const key of metricKeys) await chart.locator(`[data-metric="${key}"]`).click();
  assert.equal(await chart.locator('[data-series]').count(), 6);
  assert.doesNotMatch(await chart.locator('svg').innerHTML(), /NaN|Infinity|undefined/);
  await page.screenshot({ path: '.qa/rogue-result-chart.png' });
  await chart.locator('[data-metric="ammoPerKill"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'rogue-chart-values');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rogue-next');
  await page.clock.runFor(12000);
  assert.equal(await page.locator('#rogue-run-stats').innerText(), summary);
  assert.equal(await page.locator('#loading-screen').isVisible(), false);
  await page.locator('#rogue-next').click();
  await page.locator('#loading-screen:not(.hidden)').waitFor();
  await page.evaluate(() => window.TankGame.returnToModeSelection());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.qa/mode-select-mobile.png', fullPage: true });
  await page.locator('[data-scenario="roguelite"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.qa/mode-select-mobile-bottom.png' });
  const horizontalOverflow = await page.evaluate(() => document.querySelector('#loading-screen').scrollWidth > innerWidth);
  assert.equal(horizontalOverflow, false);
  await page.locator('.mode-guide-button').scrollIntoViewIfNeeded(); await page.locator('.mode-guide-button').click();
  const mobileGuide = await guide.boundingBox();
  assert.ok(mobileGuide.x >= 0 && mobileGuide.x + mobileGuide.width <= 390);
  await page.screenshot({ path: '.qa/roguelite-guide-mobile.png' });
  await page.keyboard.press('Escape');
  // Instrument only an in-memory QA copy, keeping the shipped global API private.
  const html = await readFile(new URL('../dist/app.html', import.meta.url), 'utf8');
  const hook = 'this.history = new RogueRunHistory();';
  assert.equal(html.split(hook).length, 2);
  const runPage = await context.newPage();
  runPage.on('pageerror', error => errors.push(error.message));
  await runPage.setViewportSize({ width: 1440, height: 900 });
  await runPage.setContent(html.replace(hook, `${hook}\nwindow.__qaRogue = this;`));
  await runPage.locator('#loading-screen.is-ready').waitFor();
  await runPage.locator('[data-scenario="roguelite"]').click();
  await runPage.evaluate(() => {
    const game = window.__qaRogue;
    cancelAnimationFrame(game.animationFrameId);
    game.state.tick(40, game.world.player.hp);
    game.beginRoundTransition(); game.advanceRoundTransition(1.5);
    if (game.state.abilityChoices.length !== 4 || new Set(game.state.abilityChoices).size !== 4) throw Error('Expected four distinct offers');
    game.state.abilityChoices = ['ricochet', 'oversized', 'hull', 'lightHull']; game.renderPanel();
  });
  assert.equal(await runPage.locator('.rogue-ability:visible').count(), 4);
  assert.equal(await runPage.evaluate(() => window.__qaRogue.world.player.ammo), 500);
  assert.match(await runPage.locator('#rogue-summary').innerText(), /Survive 30s.*one of 4/);
  await runPage.screenshot({ path: '.qa/rogue-four-choices.png' });
  assert.equal(await runPage.locator('#rogue-title').innerText(), 'Roguelite Upgrades');
  assert.match(await runPage.locator('#rogue-ammo-rate').innerText(), /Round 2: 1 pt = 19 ammo/);
  await runPage.locator('.rogue-panel-guide-button').click();
  assert.equal(await runPage.locator('.rogue-guide-dialog').isVisible(), true);
  await runPage.keyboard.press('Tab');
  assert.equal(await runPage.evaluate(() => document.activeElement.className), 'rogue-guide-content');
  await runPage.keyboard.press('5');
  assert.equal(await runPage.evaluate(() => window.__qaRogue.state.phase), 'shop');
  await runPage.screenshot({ path: '.qa/roguelite-guide-upgrades.png' });
  await runPage.keyboard.press('Escape');
  await runPage.evaluate(() => { const game = window.__qaRogue; game.state.points = 5; game.renderPanel(); });
  const beforeAmmo = await runPage.evaluate(() => window.__qaRogue.world.player.ammo);
  await runPage.locator('#rogue-ammo-spend').fill('2');
  assert.equal(await runPage.locator('#rogue-buy-ammo').innerText(), 'Buy 38 ammo (2 pt)');
  await runPage.locator('#rogue-buy-ammo').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.world.player.ammo), beforeAmmo + 38);
  const lateQuotes = await runPage.evaluate(() => {
    const game = window.__qaRogue, quotes = [];
    for (const round of [20, 30]) { game.state.round = round; game.renderAmmoShop(); quotes.push(game.el('ammo-rate').textContent); }
    game.state.round = 2; game.renderAmmoShop(); return quotes;
  });
  assert.deepEqual(lateQuotes, ['Round 20: 1 pt = 1 ammo', 'Round 30: 1 pt = 1 ammo']);
  assert.match(await runPage.locator('[data-ability="ricochet"]').innerText(), /Wall bounces.*0.*1/s);
  assert.match(await runPage.locator('[data-ability="oversized"]').innerText(), /100%.*200%/s);
  await runPage.screenshot({ path: '.qa/roguelite-new-abilities.png' });
  await runPage.locator('[data-ability="oversized"]').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.world.player.projectileSizeMultiplier), 2);
  await runPage.evaluate(() => {
    const game = window.__qaRogue;
    game.state.rollDice(() => 5.5 / 7); game.state.startRound(); game.world.startRound(2);
    game.state.tick(40, game.world.player.hp);
    game.beginRoundTransition(); game.advanceRoundTransition(1.5);
    game.state.abilityChoices = ['ricochet', 'oversized', 'explosive']; game.renderPanel();
  });
  await runPage.locator('[data-ability="ricochet"]').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.statValues.shellSize.textContent), '×2 / 1');
  await runPage.screenshot({ path: '.qa/roguelite-stacked-abilities.png' });
  const bounced = await runPage.evaluate(() => {
    const game = window.__qaRogue, player = game.world.player;
    game.world.tanks = [player]; game.world.bulletPool.reset();
    player.x = game.world.bounds.maxX - 25; player.y = 400;
    player.turretAngle = 0; player.fireCooldown = 0; player.tryShoot(game.world);
    const bullet = game.world.bulletPool.pool.find(item => item.active);
    game.world.bulletPool.updateAll(.05); game.world.handleCollisions();
    return { active: bullet.active, reflected: bullet.vx < 0, bounces: bullet.wallBouncesRemaining, radius: bullet.radius, damage: bullet.damage };
  });
  assert.deepEqual(bounced, { active: true, reflected: true, bounces: 0, radius: 6, damage: 40 });
  await runPage.evaluate(() => {
    const game = window.__qaRogue;
    game.state.rollDice(() => 5.5 / 7); game.state.startRound(); game.world.startRound(3);
    game.state.tick(40, game.world.player.hp); game.beginRoundTransition(); game.advanceRoundTransition(1.5);
    game.state.abilityChoices = ['recalibrate', 'bargain', 'shield']; game.renderPanel();
  });
  assert.match(await runPage.locator('[data-ability="recalibrate"]').innerText(), /Common/);
  assert.match(await runPage.locator('[data-ability="bargain"]').innerText(), /Rare/);
  assert.match(await runPage.locator('[data-ability="shield"]').innerText(), /Legendary/);
  await runPage.locator('[data-ability="recalibrate"]').click();
  await runPage.screenshot({ path: '.qa/roguelite-recalibration.png' });
  await runPage.locator('[data-remove-ability="oversized"]').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.world.player.projectileSizeMultiplier), 1);
  assert.equal(await runPage.evaluate(() => window.__qaRogue.world.player.projectileSpeedMultiplier), 1);
  // Exercise the actual next-round button with no ability picked.
  await runPage.evaluate(() => {
    const game = window.__qaRogue; game.resetRun();
    game.state.tick(40, game.world.player.hp); game.beginRoundTransition(); game.advanceRoundTransition(1.5);
  });
  assert.equal(await runPage.locator('#rogue-next').isEnabled(), true);
  await runPage.locator('#rogue-next').click();
  await runPage.evaluate(() => {
    const game = window.__qaRogue; game.advanceDiceReveal(.6); game.dismissDiceOverlay(); game.advanceDiceReveal(.4);
  });
  assert.deepEqual(await runPage.evaluate(() => ({ phase: window.__qaRogue.state.phase, abilities: window.__qaRogue.state.abilities })), { phase: 'combat', abilities: [] });
  await runPage.evaluate(() => window.__qaRogue.resetRun());
  const fullRun = await runPage.evaluate(() => {
    const game = window.__qaRogue;
    cancelAnimationFrame(game.animationFrameId);
    const starts = [];
    for (let round = 1; round <= 30; round++) {
      const player = game.world.player;
      if (round > 1) starts.push([player.x, player.y, game.world.bounds.maxX / 2]);
      player.x = 30; player.y = 80;
      player.takeDamage(round + 5);
      player.fireCooldown = 0; player.tryShoot(game.world);
      player.runStats.damageDealt += round * 90;
      game.state.awardKills(round);
      game.state.tick(40, player.hp);
      game.beginRoundTransition(); game.advanceRoundTransition(1.5);
      if (round < 30) {
        game.state.abilityChoices = ['hull', 'turbo', 'plating', 'lightHull'];
        game.state.chooseAbility('hull', player);
        game.state.buy('heal', player);
        game.renderPanel();
        game.requestRoundStart(); game.advanceDiceReveal(.6);
        game.dismissDiceOverlay(); game.advanceDiceReveal(.4);
      }
    }
    return { starts, phase: game.state.phase, rounds: game.history.rows.length, kills: game.state.kills };
  });
  assert.equal(fullRun.phase, 'won'); assert.equal(fullRun.rounds, 30); assert.equal(fullRun.kills, 465);
  assert.equal(await runPage.evaluate(() => document.getElementById('bgm').paused), true);
  assert.ok(fullRun.starts.every(([x, y, center]) => x === center && y === center));
  assert.equal(await runPage.locator('.rogue-chart-values tbody tr').count(), 30);
  assert.equal(await runPage.locator('#rogue-result-rounds circle').count(), 180);
  assert.equal(await runPage.locator('.rogue-chart-legend button[aria-pressed="true"]').count(), 6);
  assert.match(await runPage.locator('tr[data-round="2"]').getAttribute('title'), /Reinforced Hull \(Lv.1\)/);
  assert.match(await runPage.locator('tr[data-round="3"]').getAttribute('title'), /Repair \+1 \(Lv.2\)/);
  assert.match(await runPage.locator('tr[data-round="30"]').getAttribute('title'), /Reinforced Hull \(Lv.29\)/);
  assert.match(await runPage.locator('[data-series="kills"] circle title').nth(1).textContent(), /Reinforced Hull \(Lv.1\)/);
  assert.equal(await runPage.locator('#rogue-result-rounds').innerText().then(text => text.includes('Remaining HP')), false);
  const statsRatio = await runPage.locator('.rogue-layout.is-result').evaluate(layout => {
    const stats = layout.querySelector('.rogue-stats-panel').getBoundingClientRect().width;
    const results = layout.querySelector('.rogue-run-summary').getBoundingClientRect().width;
    return stats / (stats + results);
  });
  assert.ok(Math.abs(statsRatio - .2) < .005);
  await runPage.screenshot({ path: '.qa/rogue-thirty-round-chart.png' });
  const fits = await runPage.locator('.rogue-chart-note').evaluate(element => {
    const panel = element.closest('.rogue-run-summary').getBoundingClientRect();
    return element.getBoundingClientRect().bottom <= panel.bottom;
  });
  assert.equal(fits, true);
  await runPage.setViewportSize({ width: 1280, height: 800 });
  await runPage.waitForFunction(() => document.getElementById('gameCanvas').width === 1280);
  const resultBounds = await runPage.locator('.rogue-run-summary').evaluate(panel => ({
    noteFits: panel.querySelector('.rogue-chart-note').getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom,
    chartHeight: panel.querySelector('svg').getBoundingClientRect().height,
    horizontalOverflow: panel.scrollWidth > panel.clientWidth,
  }));
  assert.equal(resultBounds.noteFits, true); assert.equal(resultBounds.horizontalOverflow, false);
  assert.ok(resultBounds.chartHeight >= 160, JSON.stringify(resultBounds));
  await runPage.locator('tr[data-round="30"]').scrollIntoViewIfNeeded();
  await runPage.screenshot({ path: '.qa/rogue-combined-results-1280.png' });
  await runPage.locator('[data-metric="healing"]').click();
  const fresh = await runPage.evaluate(() => {
    window.__qaRogue.resetRun();
    const game = window.__qaRogue;
    return { rounds: game.history.rows.length, hidden: game.historyView.hiddenMetrics.size, tableRows: game.el('result-rounds').querySelectorAll('tbody tr').length };
  });
  assert.deepEqual(fresh, { rounds: 0, hidden: 0, tableRows: 0 });
  // A late run must remain readable at the minimum panel size.
  await runPage.setViewportSize({ width: 1280, height: 800 });
  await runPage.evaluate(() => {
    const game = window.__qaRogue; cancelAnimationFrame(game.animationFrameId);
    game.state.phase = 'shop'; game.state.round = 30;
    game.state.abilities = ['explosive', 'volatile', 'storm', 'rail', 'blood', 'oversized', 'bargain', 'dividends', 'shield', 'hull', 'plating', 'turbo', 'loader', 'splitter', 'recycler', 'ballistics', 'slowOrb', 'lightHull', 'heavyAmmo', ...Array(8).fill('glass')];
    game.state.abilityChoices = ['warhead', 'siege', 'overdrive', 'hull'];
    game.state.applyStats(game.world.player); game.renderPanel();
  });
  const previewBounds = await runPage.locator('.rogue-ability').evaluateAll(cards => cards.map(card => ({
    id: card.dataset.ability,
    overflow: card.querySelector('.rogue-ability-changes').getBoundingClientRect().bottom - card.getBoundingClientRect().bottom,
    rows: card.querySelectorAll('.rogue-ability-changes li').length,
  })));
  assert.ok(previewBounds.every(card => card.rows <= 3 && card.overflow <= 1), JSON.stringify(previewBounds));
  await runPage.screenshot({ path: '.qa/roguelite30-prep-1280.png' });
  await runPage.evaluate(() => {
    const game = window.__qaRogue; game.state.abilityChoices = ['recalibrate', 'bargain', 'shield']; game.renderPanel();
  });
  await runPage.locator('[data-ability="recalibrate"]').click();
  await runPage.locator('[data-remove-ability="heavyAmmo"]').scrollIntoViewIfNeeded();
  await runPage.screenshot({ path: '.qa/roguelite30-removal-1280.png' });
  await runPage.locator('[data-remove-ability="heavyAmmo"]').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.state.abilities.includes('heavyAmmo')), false);
  await runPage.close();
  // Exercise progression using a disposable local HTML origin and private QA hooks.
  const qaHTML = html.replace('installLanguageUI();', 'installLanguageUI(); window.__qaCreateI18n = createI18n; window.__qaApplyTranslations = applyTranslations; window.__qaLanguage = getI18n();').replace(hook, `${hook}\nwindow.__qaRogue = this;`).replace(
    'this.rewardSession = createRewardSession(this.world.level.id, this.isSuperMode, this.isSpectatorMode);',
    'this.rewardSession = createRewardSession(this.world.level.id, this.isSuperMode, this.isSpectatorMode); window.__qaTeam = this;',
  );
  await writeFile('.qa/progression-qa.html', qaHTML);
  const walletPage = await context.newPage();
  walletPage.on('pageerror', error => errors.push(error.message));
  await walletPage.goto(pathToFileURL(resolve('.qa/progression-qa.html')).href);
  await walletPage.locator('#loading-screen.is-ready').waitFor();
  const translationResult = await walletPage.evaluate(() => {
    const language = window.__qaCreateI18n({ catalogs: {
      en: { name: 'English', messages: { greeting: 'Hello', close: 'Close' } },
      ko: { name: '한국어', messages: { greeting: '<em>번역</em>', close: '닫기' } },
    } });
    const fixture = document.createElement('section');
    fixture.innerHTML = '<span data-i18n="greeting">Hello</span><button data-i18n-aria-label="close" aria-label="Close">×</button><p data-i18n="missing">Original English</p>';
    document.body.append(fixture);
    language.subscribe(() => window.__qaApplyTranslations(fixture, language));
    language.setLocale('ko');
    const translated = { text: fixture.querySelector('span').textContent, injectedHTML: fixture.querySelector('em') !== null, label: fixture.querySelector('button').getAttribute('aria-label'), fallback: fixture.querySelector('p').textContent };
    language.setLocale('en'); translated.restored = fixture.querySelector('span').textContent;
    fixture.remove(); return translated;
  });
  assert.deepEqual(translationResult, { text: '<em>번역</em>', injectedHTML: false, label: '닫기', fallback: 'Original English', restored: 'Hello' });
  assert.equal(await walletPage.locator('[data-super-mode]:disabled').count(), 5);
  await walletPage.evaluate(() => document.activeElement.blur()); await walletPage.keyboard.press('Enter');
  assert.equal(await walletPage.locator('#loading-screen').isVisible(), true);
  await walletPage.locator('[data-progression-guide]').click();
  assert.match(await walletPage.locator('.rogue-guide-content').innerText(), /500,000 total/);
  await walletPage.keyboard.press('Escape');
  await walletPage.locator('[data-scenario="frontline"]').click();
  await walletPage.evaluate(() => {
    const game = window.__qaTeam; game.world.killcount.player = 5000;
    game.world.finishGame('blue', 'QA victory'); game.stateManager.handleGameOver();
    game.stateManager.handleGameOver(); // Rendering twice must not double-pay.
    window.TankGame.returnToModeSelection();
  });
  assert.equal(await walletPage.locator('#victory-wallet').innerText(), '100,000');
  await walletPage.locator('[data-super-mode="roguelite"]').click();
  assert.equal(await walletPage.locator('#victory-wallet').innerText(), '0');
  assert.equal(await walletPage.locator('#rogue-ui').count(), 0); // Purchase only.
  await walletPage.reload(); await walletPage.locator('#loading-screen.is-ready').waitFor();
  assert.equal(await walletPage.locator('[data-super-mode="roguelite"]').innerText(), 'Play Super');
  await walletPage.screenshot({path: '.qa/permanent-super-unlock.png'});
  await walletPage.locator('[data-super-mode="roguelite"]').click();
  await walletPage.evaluate(() => {
    const game=window.__qaRogue; cancelAnimationFrame(game.animationFrameId);
    game.state.tick(40,game.world.player.hp); game.beginRoundTransition(); game.advanceRoundTransition(1.5);
  });
  assert.equal(await walletPage.locator('.rogue-ability:visible').count(), 30);
  for(let i=0;i<4;i++) await walletPage.locator('[data-ability="oversized"]').click();
  for(let i=0;i<2;i++) await walletPage.locator('[data-ability="shield"]').click();
  await walletPage.locator('[data-ability="dividends"]').click();
  assert.equal(await walletPage.evaluate(() => window.__qaRogue.state.points === Infinity), true);
  await walletPage.locator('[data-upgrade="damage"]').click();
  await walletPage.screenshot({path: '.qa/roguelite-super-all-abilities.png'});
  await walletPage.evaluate(() => { const game=window.__qaRogue; game.state.round=16; game.renderPanel(); });
  await walletPage.locator('#rogue-extract').click();
  assert.match(await walletPage.locator('#rogue-title').innerText(), /Extracted after Round 15/);
  assert.equal(await walletPage.evaluate(() => document.getElementById('bgm').paused),true);
  await walletPage.locator('#rogue-next').click();
  assert.equal(await walletPage.locator('#victory-wallet').innerText(),'0');
  await walletPage.locator('[data-scenario="roguelite"]').click();
  await walletPage.evaluate(() => {
    const game=window.__qaRogue; cancelAnimationFrame(game.animationFrameId);
    game.state.tick(40,game.world.player.hp); game.beginRoundTransition(); game.advanceRoundTransition(1.5);
    game.state.round=16; game.state.points=2345; game.renderPanel();
  });
  await walletPage.locator('#rogue-extract').click();
  assert.match(await walletPage.locator('#rogue-summary').innerText(),/Victory points \+2,345/);
  await walletPage.screenshot({path: '.qa/roguelite-extraction-reward.png'});
  await walletPage.locator('#rogue-next').click();
  assert.equal(await walletPage.locator('#victory-wallet').innerText(),'2,345');
  // A team defeat, Roguelite death, and early return all leave the wallet intact.
  await walletPage.locator('[data-scenario="siege"]').click();
  await walletPage.evaluate(() => {
    const game=window.__qaTeam; game.world.killcount.player=9999;
    game.world.finishGame('red','QA defeat'); game.stateManager.handleGameOver(); window.TankGame.returnToModeSelection();
  });
  await walletPage.locator('[data-scenario="roguelite"]').click();
  await walletPage.evaluate(() => {
    const game=window.__qaRogue; cancelAnimationFrame(game.animationFrameId);
    game.state.points=9999; game.state.tick(1,0); game.beginRoundTransition(); game.advanceRoundTransition(1.5);
  });
  await walletPage.locator('#rogue-next').click();
  await walletPage.locator('[data-scenario="defense"]').click();
  await walletPage.evaluate(() => window.TankGame.returnToModeSelection());
  assert.equal(await walletPage.locator('#victory-wallet').innerText(),'2,345');
  await walletPage.reload(); await walletPage.locator('#loading-screen.is-ready').waitFor();
  assert.equal(await walletPage.locator('#victory-wallet').innerText(),'2,345');
  await walletPage.close();
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log('Offline Edge check passed: five modes, rarity and Recalibration, optional picks, oversized ricochet, six normalized series and totals, 20/80 results layout, raw values and round preparation tooltips, legend toggles, keyboard scrolling, music stop, thirty-round victory and fresh reset.');
} finally { await browser.close(); }
