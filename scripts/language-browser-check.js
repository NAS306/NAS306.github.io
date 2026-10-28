import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

await mkdir('.qa', { recursive: true });
const source = await readFile('dist/app.html', 'utf8');
const html = source.replace('installLanguageUI();', 'installLanguageUI(); window.__qaLanguage = getI18n(); window.__qaPaused = isGamePaused;')
  .replace('this.history = new RogueRunHistory();', 'this.history = new RogueRunHistory(); window.__qaRogue = this;')
  .replace('this.rewardSession = createRewardSession(this.world.level.id, this.isSuperMode, this.isSpectatorMode);', 'this.rewardSession = createRewardSession(this.world.level.id, this.isSuperMode, this.isSpectatorMode); window.__qaTeam = this;');
await writeFile('.qa/language-browser.html', html);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await context.setOffline(true);
const page = await context.newPage(), errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
await page.clock.install();
const settings = page.locator('#language-dialog'), launcher = page.locator('#translation-button');
const choose = async locale => { await page.locator('#language-select').selectOption(locale); assert.equal(await page.locator('html').getAttribute('lang'), locale); };
const open = async () => { await launcher.click(); await settings.waitFor(); assert.equal(await page.evaluate(() => window.__qaPaused()), true); };
const close = async () => { await page.keyboard.press('Escape'); await settings.waitFor({ state: 'hidden' }); await page.clock.runFor(20); assert.equal(await page.evaluate(() => window.__qaPaused()), false); };
const rogueSnapshot = () => page.evaluate(() => {
  const game=window.__qaRogue;
  return { round:game.state.round, remaining:game.state.remaining, points:game.state.points, phase:game.state.phase,
    hp:game.world.player.hp, ammo:game.world.player.ammo, abilities:[...game.state.abilities], levels:{...game.state.levels},
    dice:game.diceReveal ? JSON.stringify(game.diceReveal) : null,
    transition:game.roundTransition ? JSON.stringify(game.roundTransition) : null,
    tanks:game.world.tanks.map(tank=>[tank.x,tank.y,tank.hp,tank.fireCooldown]), combatTime:game.world.player.combatElapsed };
});
try {
  await page.goto(pathToFileURL(resolve('.qa/language-browser.html')).href);
  await page.locator('#loading-screen.is-ready').waitFor();
  await open(); assert.equal(await page.locator('#language-select option').count(),5);
  for(const [locale,expected] of [['ko','로그라이트'],['zh','轻度肉鸽'],['ja','ローグライト'],['ru','Roguelite'],['en','Roguelite']]) {
    await choose(locale); assert.equal(await page.locator('[data-scenario="roguelite"] .mode-name').innerText(),expected);
  }
  await close();
  await page.locator('.mode-guide-button').click();
  const guide=page.locator('.rogue-guide-dialog');
  await open(); await choose('ko'); await close();
  assert.equal(await guide.isVisible(),true); assert.match(await guide.innerText(),/로그라이트 모드 설명/);
  assert.equal(await guide.locator('[data-guide-ability]').count(),30);
  await open(); await choose('zh'); await close(); assert.match(await guide.innerText(),/轻度肉鸽/);
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844}); await open(); await choose('ru');
  const bounds=await settings.boundingBox(); assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390);
  await page.screenshot({path:'.qa/language-settings-mobile.png'}); await close();
  assert.equal(await page.locator('#loading-screen').evaluate(el=>el.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1280,height:800});
  for(const [mode,locale] of [['frontline','ko'],['siege','zh'],['defense','ja'],['breakthrough','ru']]) {
    await page.locator(`[data-scenario="${mode}"]`).click();
    await page.locator('#loading-screen').waitFor({state:'hidden'});
    await open(); await choose(locale);
    const snapshot=()=>page.evaluate(()=>{const g=window.__qaTeam;return {remaining:g.world.remainingTime,points:g.world.point,respawn:g.playerRespawnTimer,weapon:g.playerTank.weaponId,tanks:g.world.tanks.map(t=>[t.x,t.y,t.hp,t.fireCooldown])};});
    const before=await snapshot(); await page.keyboard.press('q'); await page.keyboard.press('1'); await page.clock.runFor(5000);
    assert.deepEqual(await snapshot(),before,mode);
    await close(); await page.clock.runFor(100); assert.notDeepEqual(await snapshot(),before,`${mode} resumed`);
    await page.evaluate(()=>window.TankGame.returnToModeSelection());
  }
  await open(); await choose('en'); await close();
  await page.locator('[data-scenario="roguelite"]').click(); await page.locator('#rogue-ui').waitFor();
  await open(); const combat=await rogueSnapshot(); await choose('ja');
  await page.keyboard.press('d'); await page.keyboard.press('q'); await page.clock.runFor(10000);
  assert.deepEqual(await rogueSnapshot(),combat); assert.equal(await page.evaluate(()=>document.getElementById('bgm').paused),true);
  await close(); await page.clock.runFor(100);
  assert.ok((await rogueSnapshot()).remaining<combat.remaining);
  await page.evaluate(()=>{const g=window.__qaRogue;g.state.tick(30,g.world.player.hp);g.beginRoundTransition();});
  await open(); const transition=await rogueSnapshot(); await choose('ru'); await page.clock.runFor(5000); assert.deepEqual(await rogueSnapshot(),transition);
  await close(); await page.clock.runFor(1800); assert.equal(await page.evaluate(()=>window.__qaRogue.state.phase),'shop');
  await page.evaluate(()=>{const g=window.__qaRogue;g.state.points=100;g.state.abilityChoices=['overcharge','piercing','blast','heavyAmmo'];g.state.abilities=['explosive'];g.state.applyStats(g.world.player);g.renderPanel();});
  await open(); const prep=await rogueSnapshot(); await choose('ko'); await page.clock.runFor(3000); assert.deepEqual(await rogueSnapshot(),prep); await close();
  assert.match(await page.locator('[data-ability="overcharge"]').innerText(),/과충전 포탄/);
  assert.match(await page.locator('[data-ability="overcharge"]').innerText(),/50%/);
  await page.screenshot({path:'.qa/roguelite-korean.png'});
  await open(); await choose('ru'); await close();
  const cardOverflow=await page.locator('.rogue-ability:visible').evaluateAll(cards=>cards.some(card=>card.scrollWidth>card.clientWidth+1));
  assert.equal(cardOverflow,false); await page.screenshot({path:'.qa/roguelite-russian.png'});
  await page.locator('#rogue-next').click(); await open(); const dice=await rogueSnapshot(); await choose('zh'); await page.clock.runFor(5000); assert.deepEqual(await rogueSnapshot(),dice); await close();
  await page.clock.runFor(700); await page.locator('#rogue-dice-overlay').click(); await page.clock.runFor(500);
  assert.equal(await page.evaluate(()=>window.__qaRogue.state.phase),'combat');
  await page.evaluate(()=>{const g=window.__qaRogue;g.world.player.hp=0;g.state.tick(1,0);g.beginRoundTransition();});
  await page.clock.runFor(1800);
  await open(); const result=await rogueSnapshot(); await choose('ko'); await page.clock.runFor(3000); assert.deepEqual(await rogueSnapshot(),result); await close();
  assert.match(await page.locator('#rogue-title').innerText(),/생존 실패/);
  assert.match(await page.locator('#rogue-run-stats').innerText(),/가한 피해/);
  assert.equal(await page.evaluate(()=>document.getElementById('bgm').paused),true);
  await page.screenshot({path:'.qa/roguelite-korean-results.png'});
  await page.locator('#rogue-next').click(); await page.reload(); await page.locator('#loading-screen.is-ready').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'ko');
  assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
  console.log('Five-language offline browser check passed: guide nesting, mobile layout, persistent locale, all four team loops, Roguelite combat/preparation/dice/transitions/results pause and resume, translated abilities and results.');
} finally { await browser.close(); }
