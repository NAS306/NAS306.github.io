import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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
  const summary = await page.locator('#rogue-run-stats').innerText();
  await page.screenshot({ path: '.qa/rogue-result.png' });
  await page.getByRole('button', { name: 'By Round', exact: true }).click();
  const chart = page.locator('#rogue-result-rounds');
  assert.equal(await chart.isVisible(), true);
  assert.equal(await chart.locator('circle').count(), 1);
  assert.match(await chart.locator('.rogue-chart-values').innerText(), /R1.*Lost/s);
  for (const option of await page.locator('#rogue-chart-metric option').evaluateAll(options => options.map(option => option.value))) {
    await page.locator('#rogue-chart-metric').selectOption(option);
    assert.doesNotMatch(await chart.locator('svg').innerHTML(), /NaN|Infinity|undefined/);
  }
  await page.locator('#rogue-chart-metric').selectOption('damageTaken');
  await page.screenshot({ path: '.qa/rogue-result-chart.png' });
  await page.locator('#rogue-chart-metric').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rogue-next');
  await page.getByRole('button', { name: 'Totals', exact: true }).click();
  assert.equal(await chart.isVisible(), false);
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
    game.state.abilityChoices = ['ricochet', 'oversized', 'hull']; game.renderPanel();
  });
  assert.equal(await runPage.locator('#rogue-title').innerText(), 'Roguelite Upgrades');
  assert.match(await runPage.locator('[data-ability="ricochet"]').innerText(), /Wall bounces.*0.*1/s);
  assert.match(await runPage.locator('[data-ability="oversized"]').innerText(), /100%.*150%/s);
  await runPage.screenshot({ path: '.qa/roguelite-new-abilities.png' });
  await runPage.locator('[data-ability="oversized"]').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.world.player.projectileSizeMultiplier), 1.5);
  await runPage.evaluate(() => {
    const game = window.__qaRogue;
    game.state.rollDice(() => 5.5 / 7); game.state.startRound(); game.world.startRound(2);
    game.state.tick(40, game.world.player.hp);
    game.beginRoundTransition(); game.advanceRoundTransition(1.5);
    game.state.abilityChoices = ['ricochet', 'oversized', 'explosive']; game.renderPanel();
  });
  await runPage.locator('[data-ability="ricochet"]').click();
  assert.equal(await runPage.evaluate(() => window.__qaRogue.statValues.shellSize.textContent), '150.0% / 1');
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
  assert.deepEqual(bounced, { active: true, reflected: true, bounces: 0, radius: 4.5, damage: 20 });
  await runPage.evaluate(() => window.__qaRogue.resetRun());
  const fullRun = await runPage.evaluate(() => {
    const game = window.__qaRogue;
    cancelAnimationFrame(game.animationFrameId);
    const starts = [];
    for (let round = 1; round <= 10; round++) {
      const player = game.world.player;
      if (round > 1) starts.push([player.x, player.y, game.world.bounds.maxX / 2]);
      player.x = 30; player.y = 80;
      player.takeDamage(round + 5);
      player.fireCooldown = 0; player.tryShoot(game.world);
      player.runStats.damageDealt += round * 90;
      game.state.awardKills(round);
      game.state.tick(40, player.hp);
      game.beginRoundTransition(); game.advanceRoundTransition(1.5);
      if (round < 10) {
        game.state.abilityChoices = ['hull', 'hull', 'hull'];
        game.state.chooseAbility('hull', player);
        game.state.buy('heal', player);
        game.renderPanel();
        game.requestRoundStart(); game.advanceDiceReveal(.6);
        game.dismissDiceOverlay(); game.advanceDiceReveal(.4);
      }
    }
    return { starts, phase: game.state.phase, rounds: game.history.rows.length, kills: game.state.kills };
  });
  assert.equal(fullRun.phase, 'won'); assert.equal(fullRun.rounds, 10); assert.equal(fullRun.kills, 55);
  assert.ok(fullRun.starts.every(([x, y, center]) => x === center && y === center));
  await runPage.getByRole('button', { name: 'By Round', exact: true }).click();
  assert.equal(await runPage.locator('.rogue-chart-values > div').count(), 10);
  assert.equal(await runPage.locator('#rogue-result-rounds circle').count(), 10);
  await runPage.screenshot({ path: '.qa/rogue-ten-round-chart.png' });
  const fits = await runPage.locator('.rogue-chart-note').evaluate(element => {
    const panel = element.closest('.rogue-run-summary').getBoundingClientRect();
    return element.getBoundingClientRect().bottom <= panel.bottom;
  });
  assert.equal(fits, true);
  const fresh = await runPage.evaluate(() => {
    window.__qaRogue.resetRun();
    const game = window.__qaRogue;
    return { rounds: game.history.rows.length, metric: game.el('chart-metric').value, totals: !game.el('result-totals').hidden };
  });
  assert.deepEqual(fresh, { rounds: 0, metric: 'kills', totals: true });
  await runPage.close();
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log('Offline Edge check passed: all five modes, Roguelite naming, new ability cards and selection, oversized-shell ricochet, immediate first combat, persistent totals, every round-chart metric, keyboard navigation, manual return, narrow layout, ten-round victory charts, centered starts and fresh-run reset.');
} finally { await browser.close(); }
