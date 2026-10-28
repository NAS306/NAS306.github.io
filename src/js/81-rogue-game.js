import { RogueState, UPGRADES, ROUND_COUNT, ROUND_SECONDS, KILL_POINTS, getRoundConfig } from './42-rogue-state.js';
import { RogueWorld } from './50-rogue-world.js';
import { ROGUE_ENEMY_RULES, getRoguePlayerWeapon } from './40-rogue-balance.js';
import { getAmmoPerPoint, EXPLOSIVE_AMMO_COST, supplyRoundAmmo, planAmmoVolley } from './20-rogue-ammo.js';
import { renderRogueAbilityChoices } from './78-rogue-ability-ui.js';
import { clampFrameDelta } from './01-runtime.js';
import { returnToModeSelection } from './12-game-flow.js';
import { getRogueCountdown } from './43-rogue-effects.js';
import { ENEMY_DICE_FACES, RogueDiceReveal } from './21-rogue-dice.js';
import { RogueRoundTransition } from './44-rogue-transition.js';
import { getRogueRunSummary } from './22-rogue-stats.js';
import { RogueRunHistory } from './51-rogue-history.js';
import { RogueHistoryView } from './79-rogue-charts.js';
import { isRogueGuideOpen } from './77-rogue-guide.js';

const HEALTH_DISPLAY_MARKUP = '<div class="rogue-health-label"><span>HP</span><strong class="rogue-health-value"></strong></div><progress max="125" value="125" aria-label="Player health"></progress>';

export function updateRogueHealthDisplay(display, hp, maxHP) {
  const current = Math.max(0, Math.min(hp, maxHP));
  const bar = display.querySelector('progress');
  bar.max = maxHP;
  bar.value = current;
  bar.setAttribute('aria-valuetext', `${Math.ceil(current)} of ${maxHP} HP`);
  display.querySelector('.rogue-health-value').textContent = `${Math.ceil(current)} / ${maxHP}`;
  display.classList.toggle('danger', current <= maxHP * 0.3);
  display.classList.toggle('warning', current > maxHP * 0.3 && current <= maxHP * 0.6);
}

// Keep the entire preparation layout visible, including on smaller viewports.
export function getRoguePanelLayout(width, height) {
  const scale = Math.min(1.5, Math.max(1, width) / 1280, Math.max(1, height) / 800);
  return { scale, width: Math.max(1, width) / scale, height: Math.max(1, height) / scale };
}

export class RogueGame {
  constructor(canvas, resources, InputManager) {
    this.canvas = canvas;
    this.disposed = false;
    this.events = new AbortController();
    const eventOptions = { signal: this.events.signal };
    this.ctx = canvas.getContext('2d');
    this.input = new InputManager(canvas);
    this.resources = resources;
    this.bgm = document.getElementById('bgm');
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    document.body.classList.add('rogue-mode');
    this.root = document.createElement('section');
    this.root.id = 'rogue-ui';
    this.root.innerHTML = `
      <div id="rogue-countdown-glow" aria-hidden="true"></div>
      <div id="rogue-damage-glow" aria-hidden="true"></div>
      <header class="rogue-hud">
        <div><span class="rogue-eyebrow">SOLO SURVIVAL</span><strong id="rogue-round"></strong></div>
        <div id="rogue-hp" class="rogue-health">${HEALTH_DISPLAY_MARKUP}</div><div id="rogue-time"></div><div id="rogue-points"></div><div id="rogue-ammo"></div>
      </header>
      <footer class="rogue-footer"><span id="rogue-weapon"></span><span>WASD / Arrows: Move · Mouse: Aim · Left click: Fire</span></footer>
      <div id="rogue-round-banner" role="status" aria-live="polite" hidden></div>
      <div class="rogue-shade" id="rogue-shade">
        <article class="rogue-panel" role="dialog" aria-modal="true" aria-labelledby="rogue-title" tabindex="-1">
          <div class="rogue-panel-content">
          <div class="rogue-panel-heading">
            <button type="button" class="rogue-panel-guide-button" data-rogue-guide aria-haspopup="dialog">ⓘ Mode guide</button>
            <span class="rogue-eyebrow">SOLO SURVIVAL · ${ROUND_COUNT} ROUNDS</span>
            <h1 id="rogue-title"></h1><p id="rogue-summary"></p>
          </div>
          <div id="rogue-layout" class="rogue-layout">
            <section class="rogue-stats-panel" aria-labelledby="rogue-stats-title">
              <h2 id="rogue-stats-title">Stats</h2>
              <div id="rogue-panel-hp" class="rogue-health">${HEALTH_DISPLAY_MARKUP}</div>
              <dl id="rogue-stats" class="rogue-stats"></dl>
              <p class="rogue-stat-note" id="rogue-economy-note"></p>
              <h3>Acquired abilities</h3><div class="rogue-owned" aria-label="No acquired abilities"></div>
            </section>
            <section id="rogue-run-summary" class="rogue-run-summary" aria-labelledby="rogue-run-summary-title" hidden>
              <div class="rogue-result-heading"><h2 id="rogue-run-summary-title">Run Results</h2><span>Totals &amp; round trends</span></div>
              <dl id="rogue-run-stats" aria-label="Combat totals"></dl>
              <div id="rogue-result-rounds" class="rogue-round-charts">
                <div class="rogue-chart-legend" role="group" aria-label="Toggle chart lines"></div>
                <svg id="rogue-combined-chart" viewBox="0 0 900 300" role="img"></svg>
                <div class="rogue-chart-values" role="region" tabindex="0" aria-label="Actual combat values by round"></div>
                <p class="rogue-chart-note"></p>
              </div>
            </section>
            <section id="rogue-abilities" class="rogue-ability-grid" aria-label="Optional free ability: choose one or continue without choosing">
              <div id="rogue-recalibration" class="rogue-recalibration" role="group" aria-label="Choose an ability to reduce" hidden><h2>Recalibration</h2><p>Lose one level. Both its benefit and penalty are removed.</p><div class="rogue-removal-targets"></div><button id="rogue-cancel-removal" type="button">Back to choices</button></div>
            </section>
            <section id="rogue-shop" aria-labelledby="rogue-shop-title">
              <h2 id="rogue-shop-title">Upgrades <small>Each item: 5 → 7 → 9… points</small></h2><div id="rogue-upgrades"></div>
            </section>
            <button id="rogue-next" type="button"><span class="rogue-next-icon" aria-hidden="true">→</span><span id="rogue-next-label"></span></button>
          </div>
          <div class="rogue-panel-tools">
            <div id="rogue-ammo-shop"><span>Ammo <strong id="rogue-ammo-stock"></strong></span><label>Points <input id="rogue-ammo-spend" type="number" min="1" step="1" value="1" inputmode="numeric"></label><button id="rogue-buy-ammo" type="button">Buy ammo</button><small id="rogue-ammo-rate"></small></div>
            <button id="rogue-menu" type="button">Mode Select</button>
          </div>
          </div>
        </article>
      </div>
      <div id="rogue-dice-overlay" role="dialog" aria-modal="true" aria-labelledby="rogue-dice-title" tabindex="-1" hidden>
        <article id="rogue-dice-card">
          <div class="rogue-dice-front">
            <span class="rogue-eyebrow" id="rogue-dice-round"></span>
            <span id="rogue-dice-symbol" aria-hidden="true"></span>
            <h2 id="rogue-dice-title">Enemy Dice</h2>
            <p id="rogue-dice-result" role="status"></p>
            <h3>Enemy stats this round</h3>
            <dl class="rogue-dice-stats">${ENEMY_DICE_FACES.filter(face => face.key).map(face => `<div><dt>${face.name}</dt><dd id="rogue-dice-stat-${face.key}"></dd></div>`).join('')}</dl>
            <p class="rogue-dice-note">Percentages use Round 1 before dice buffs.<br>Dice upgrades persist for the rest of this run.</p>
            <p id="rogue-dice-hint"></p>
          </div>
        </article>
      </div>`;
    document.body.append(this.root);
    this.el = id => this.root.querySelector(`#rogue-${id}`);
    this.panelContent = this.root.querySelector('.rogue-panel-content');
    this.historyView = new RogueHistoryView(this.el('run-summary'), this.events.signal);
    this.runStatValues = {};
    for (const { key, label, color } of getRogueRunSummary({ kills: 0 }, { damageTaken: 0, damageDealt: 0, healing: 0, ammoSpent: 0 })) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const value = document.createElement('dd');
      term.textContent = label;
      row.style.setProperty('--series-color', color);
      row.append(term, value);
      this.el('run-stats').append(row);
      this.runStatValues[key] = value;
    }
    this.healthDisplays = [this.el('hp'), this.el('panel-hp')];
    window.addEventListener('resize', () => this.fitPanel(), eventOptions);
    this.statValues = {};
    for (const [key, label] of Object.entries({
      points: 'Points', speed: 'Move speed', damage: 'Damage',
      attackSpeed: 'Shots / second', armor: 'Armor', ammoCost: 'Ammo / volley',
      projectileSpeed: 'Shell speed', shellSize: 'Shell size / bounces',
    })) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const value = document.createElement('dd');
      term.textContent = label;
      row.append(term, value);
      this.el('stats').append(row);
      this.statValues[key] = value;
      if (['deathNova', 'payload', 'blast'].includes(key)) row.hidden = true;
    }
    this.abilityCards = [];
    for (let index = 0; index < 3; index++) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'rogue-ability';
      card.innerHTML = '<span class="rogue-ability-icon"></span><h2></h2><span class="rogue-ability-status"></span><p></p><small class="rogue-preview-label">Current → After selection</small><ul class="rogue-ability-changes"></ul>';
      card.addEventListener('click', () => {
        if (!this.roundTransition && !this.diceReveal && this.state.chooseAbility(card.dataset.ability, this.world.player)) this.renderPanel();
      });
      this.el('abilities').append(card);
      this.abilityCards.push(card);
    }
    for (const [key, upgrade] of Object.entries(UPGRADES)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.upgrade = key;
      button.innerHTML = `<span><strong>${upgrade.name}</strong><small>${upgrade.description}</small></span><span class="rogue-price"></span>`;
      button.addEventListener('click', () => {
        if (!this.roundTransition && !this.diceReveal && this.state.buy(key, this.world.player)) this.renderPanel();
      });
      this.el('upgrades').append(button);
    }
    this.el('next').addEventListener('click', () => {
      if (this.roundTransition || this.diceReveal) return;
      if (this.state.phase === 'won' || this.state.phase === 'lost') { returnToModeSelection(); return; }
      this.requestRoundStart();
    });
    this.el('dice-overlay').addEventListener('click', e => {
      e.stopPropagation();
      this.dismissDiceOverlay();
    });
    this.el('ammo-spend').addEventListener('input', () => this.renderAmmoShop());
    this.el('cancel-removal').addEventListener('click', () => {
      if (this.state.diceRolled || !this.state.pendingRemoval) return;
      this.state.pendingRemoval = false; this.state.selectedAbility = null; this.state.abilitiesBeforeChoice = null;
      this.renderPanel();
    });
    this.el('buy-ammo').addEventListener('click', () => {
      if (this.roundTransition || this.diceReveal) return;
      if (this.state.buyAmmo(this.world.player, Number(this.el('ammo-spend').value))) this.renderPanel();
    });
    this.el('menu').addEventListener('click', returnToModeSelection);
    window.addEventListener('keydown', e => {
      if (isRogueGuideOpen()) return;
      if (this.diceReveal) {
        if (e.key === 'Tab' || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
        if (!e.repeat && (e.code === 'Space' || e.code === 'Enter')) this.dismissDiceOverlay();
        return;
      }
      if (this.roundTransition) { if (e.key === 'Tab') e.preventDefault(); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.state.phase === 'combat') e.preventDefault();
      // Keep keyboard focus within the round panel while it is open.
      if (e.key === 'Tab' && !this.el('shade').hidden) {
        const buttons = [...this.el('shade').querySelectorAll('button:not(:disabled):not([hidden]), select:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(button => button.getClientRects().length > 0);
        const first = buttons[0], last = buttons.at(-1);
        if (e.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !buttons.includes(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
    }, eventOptions);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), eventOptions);
    window.addEventListener('blur', () => { this.input.reset(); this.accumulator = 0; }, eventOptions);
    document.addEventListener('visibilitychange', () => {
      this.input.reset(); this.accumulator = 0; this.lastTime = performance.now();
    }, eventOptions);
    this.resetRun();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrameId);
    this.events.abort();
    this.input.reset();
    this.input.dispose();
    this.root.remove();
    this.diceReveal = null;
    document.body.classList.remove('rogue-mode');
  }
  resetRun() {
    this.resources.bulletPool.reset();
    this.resources.explosionPool.reset();
    this.state = new RogueState();
    this.history = new RogueRunHistory();
    this.historyView.reset(this.history);
    this.world = new RogueWorld(this.canvas, this.resources);
    this.accumulator = 0;
    this.roundTransition = null;
    this.diceReveal = null;
    this.root.classList.remove('rogue-transitioning');
    this.el('round-banner').hidden = true;
    this.el('dice-overlay').hidden = true;
    this.el('shade').hidden = true;
    this.el('shade').inert = false;
    this.input.reset();
    this.state.applyStats(this.world.player);
    this.world.startRound(1, this.state.enemyDiceBonuses);
    this.renderHUD();
    this.fitPanel();
    this.canvas.focus();
  }
  renderPanel({ focus = true } = {}) {
    const { state, world } = this;
    const player = world.player;
    const ended = state.phase === 'won' || state.phase === 'lost';
    if (state.phase === 'shop') supplyRoundAmmo(player, state.round);
    const weapon = getRoguePlayerWeapon(player);
    this.el('shade').hidden = false;
    this.el('title').textContent = state.phase === 'won' ? `All ${ROUND_COUNT} Rounds Survived!` : state.phase === 'lost' ? 'Run Over' : 'Roguelite Upgrades';
    this.el('summary').textContent = ended
      ? `${state.kills} kills · ${state.points} points left · HP ${Math.max(0, Math.ceil(player.hp))} / ${player.maxHP}`
      : `Round ${state.round} / ${ROUND_COUNT} · Survive ${ROUND_SECONDS}s · Pick one free ability or continue without choosing · Common 60% / Rare 30% / Legendary 10%`;
    const stats = {
      points: `${state.points}`,
      speed: `${Math.round(player.speed)}`,
      damage: `${Number(weapon.damage.toFixed(1))}`,
      attackSpeed: `${Number((1 / weapon.reloadTime).toFixed(1))}`,
      armor: player.armor < 0 ? `${player.armor} (+${-player.armor} taken)` : `${player.armor}`,
      ammoCost: `${weapon.pelletCount + player.extraExplosiveProjectiles * EXPLOSIVE_AMMO_COST}`,
      projectileSpeed: `${Math.round(weapon.projectileSpeed)}`,
      shellSize: `×${player.projectileSizeMultiplier} / ${player.wallBounces}`,
    };
    for (const [key, value] of Object.entries(stats)) this.statValues[key].textContent = value;
    this.el('economy-note').textContent = `${KILL_POINTS * player.pointMultiplier} pts / kill · Damage taken ×${player.incomingDamageMultiplier}${Number.isFinite(player.pointsCap) ? ` · Max ${player.pointsCap.toLocaleString('en-US')} pts` : ''}${player.pulseShield ? ' · Shield 1s / 3s' : ''}`;
    this.renderAmmoShop();
    this.renderRunSummary();
    if (ended) this.historyView.render();
    this.el('layout').classList.toggle('is-result', ended);
    this.el('shop').hidden = ended;
    this.renderAbilities(ended);
    for (const button of this.el('upgrades').querySelectorAll('button')) {
      const key = button.dataset.upgrade;
      button.disabled = ended || state.diceRolled || state.points < state.cost(key) || (key === 'heal' && player.hp >= player.maxHP);
      button.querySelector('.rogue-price').textContent = `${state.cost(key)} pts · Lv.${state.levels[key]}`;
    }
    const nextLabel = ended ? 'Mode Select' : `Start Round ${state.round}`;
    this.el('next-label').textContent = nextLabel;
    this.el('next').disabled = false;
    this.el('next').setAttribute('aria-label', nextLabel);
    this.el('next').title = ended ? nextLabel : 'Continue with or without a free ability';
    this.el('menu').hidden = ended;
    if (focus) {
      if (state.pendingRemoval) this.el('recalibration').querySelector('button')?.focus();
      else if (!ended && state.selectedAbility === null) this.abilityCards[0].focus();
      else this.el('next').focus();
    }
    this.renderHUD();
    this.fitPanel();
  }
  renderRunSummary() {
    const ended = this.state.phase === 'won' || this.state.phase === 'lost';
    this.el('run-summary').hidden = !ended;
    if (!ended) return;
    for (const { key, value } of getRogueRunSummary(this.state, this.world.player.runStats)) {
      this.runStatValues[key].textContent = value;
    }
  }
  renderAmmoShop() {
    const { state, world } = this;
    const ended = state.phase === 'won' || state.phase === 'lost';
    const points = Number(this.el('ammo-spend').value);
    const valid = Number.isSafeInteger(points) && points > 0;
    const rate = getAmmoPerPoint(state.round);
    this.el('ammo-rate').textContent = `Round ${state.round}: 1 pt = ${rate} ammo`;
    this.el('ammo-shop').hidden = ended;
    this.el('ammo-stock').textContent = `${world.player.ammo}`;
    this.el('ammo-spend').disabled = ended || state.diceRolled;
    this.el('buy-ammo').disabled = ended || state.diceRolled || !valid || points > state.points;
    this.el('buy-ammo').textContent = valid ? `Buy ${points * rate} ammo (${points} pt)` : 'Enter points';
  }
  requestRoundStart() {
    if (this.disposed || this.roundTransition || this.diceReveal || this.state.phase !== 'shop') return false;
    if (!this.state.rollDice()) return false;
    this.diceReveal = new RogueDiceReveal();
    this.input.reset();
    this.el('shade').inert = true;
    this.el('dice-overlay').hidden = false;
    this.renderDiceOverlay();
    this.advanceDiceReveal(0);
    this.el('dice-overlay').focus();
    return true;
  }
  renderDiceOverlay() {
    const { state } = this;
    const result = state.diceResult;
    const config = getRoundConfig(state.round, state.enemyDiceBonuses);
    const percent = value => `${Math.round(value * 100)}%`;
    const values = {
      speed: percent(config.enemyMovementMultiplier / ROGUE_ENEMY_RULES.movementMultiplier),
      attackSpeed: percent(config.enemyAttackSpeedMultiplier / ROGUE_ENEMY_RULES.attackSpeedMultiplier),
      damage: percent(config.enemyDamageMultiplier / ROGUE_ENEMY_RULES.damageMultiplier),
      maxHP: `${Number(config.enemyMaxHP.toFixed(1))} HP`,
      projectileSpeed: percent(config.enemyProjectileSpeedMultiplier),
    };
    this.el('dice-round').textContent = `ROUND ${state.round} / ${ROUND_COUNT}`;
    this.el('dice-symbol').textContent = result.symbol;
    this.el('dice-title').textContent = result.bomb ? 'BOMB · All Enemy Stats' : result.key ? `Enemy ${result.name}` : 'Pass';
    this.el('dice-result').textContent = result.bomb ? `All 5 stats +${result.bonus}% of base · Permanent this run` : result.key ? `+${result.bonus}% of base · Added this round` : 'No enemy buff this round';
    for (const face of ENEMY_DICE_FACES.filter(face => face.key)) {
      const bonus = state.enemyDiceBonuses[face.key];
      this.el(`dice-stat-${face.key}`).textContent = `${values[face.key]} · Dice +${bonus}%`;
    }
  }
  dismissDiceOverlay() {
    if (this.disposed || !this.diceReveal?.close()) return false;
    this.input.reset();
    this.advanceDiceReveal(0);
    return true;
  }
  advanceDiceReveal(dt) {
    const frame = this.diceReveal.advance(dt);
    this.root.style.setProperty('--rogue-dice-angle', `${frame.angle}deg`);
    this.root.style.setProperty('--rogue-dice-tilt', `${frame.tilt}deg`);
    this.root.style.setProperty('--rogue-dice-scale', frame.scale);
    this.root.style.setProperty('--rogue-dice-opacity', frame.opacity);
    this.el('dice-overlay').classList.toggle('is-ready', frame.ready);
    this.el('dice-hint').textContent = frame.ready ? 'Click anywhere or press Enter to start' : this.diceReveal.phase === 'entering' ? 'Rolling…' : 'Deploying…';
    if (frame.done) this.startRevealedRound();
  }
  startRevealedRound() {
    if (this.disposed || this.diceReveal?.phase !== 'done' || !this.state.startRound()) return;
    this.world.startRound(this.state.round, this.state.enemyDiceBonuses);
    this.diceReveal = null;
    this.el('dice-overlay').hidden = true;
    this.el('shade').hidden = true;
    this.el('shade').inert = false;
    this.input.reset();
    this.accumulator = 0;
    this.canvas.focus();
  }
  beginRoundTransition() {
    if (this.state.phase === 'won' || this.state.phase === 'lost') this.bgm?.pause();
    const round = this.state.phase === 'shop' ? this.state.round - 1 : this.state.round;
    this.history.record(round, this.state.phase === 'lost' ? 'lost' : 'cleared', this.state, this.world.player);
    this.roundTransition = new RogueRoundTransition(this.state.phase, round);
    this.root.classList.add('rogue-transitioning');
    const banner = this.el('round-banner');
    banner.textContent = this.state.phase === 'won' ? 'VICTORY' : this.state.phase === 'lost' ? 'LOST' : '';
    banner.classList.toggle('is-loss', this.state.phase === 'lost');
    banner.hidden = !banner.textContent;
    this.el('shade').inert = true;
    this.advanceRoundTransition(0);
  }
  advanceRoundTransition(dt) {
    const transition = this.roundTransition;
    const frame = transition.advance(dt);
    this.world.updateAfterRound(frame.simulationDelta);
    this.root.style.setProperty('--rogue-banner-x', `${frame.bannerX}vw`);
    this.root.style.setProperty('--rogue-banner-opacity', frame.bannerOpacity);
    this.root.style.setProperty('--rogue-panel-x', `${frame.panelX}%`);
    this.root.style.setProperty('--rogue-panel-opacity', frame.panelOpacity);
    if (frame.panelVisible && !transition.panelShown) {
      transition.panelShown = true;
      this.renderPanel({ focus: false });
    }
    if (frame.done) {
      this.world.clearRound();
      this.roundTransition = null;
      this.root.classList.remove('rogue-transitioning');
      this.el('round-banner').hidden = true;
      this.el('shade').inert = false;
      this.renderPanel();
    }
  }
  fitPanel() {
    const layout = getRoguePanelLayout(this.canvas.width, this.canvas.height);
    this.panelContent.style.width = `${layout.width}px`;
    this.panelContent.style.height = `${layout.height}px`;
    this.panelContent.style.transform = `scale(${layout.scale})`;
  }
  renderAbilities(ended) { renderRogueAbilityChoices(this, ended); }
  damageText() {
    const p = this.world.player;
    const weapon = getRoguePlayerWeapon(p);
    const pellets = weapon.pelletCount > 1 ? ` × ${weapon.pelletCount}` : '';
    return `${weapon.damage.toFixed(2)}${pellets}`;
  }
  renderHUD() {
    const p = this.world.player;
    const weapon = getRoguePlayerWeapon(p);
    const ammo = planAmmoVolley(p.ammo, weapon.pelletCount, p.extraExplosiveProjectiles ?? 0);
    this.el('ammo').textContent = `AMMO ${p.ammo} · ${ammo.fullCost} / volley${p.ammo === 0 ? ' · EMPTY' : ''}`;
    this.el('ammo').classList.toggle('danger', p.ammo === 0);
    this.el('ammo').classList.toggle('warning', p.ammo > 0 && p.ammo <= ammo.fullCost * 10);
    this.el('round').textContent = `ROUND ${this.roundTransition?.round ?? this.state.round} / ${ROUND_COUNT}`;
    for (const display of this.healthDisplays) updateRogueHealthDisplay(display, p.hp, p.maxHP);
    this.el('time').textContent = `${this.state.remaining.toFixed(1)}s`;
    this.el('points').textContent = `${this.state.points} points · ${this.state.kills} kills`;
    this.el('weapon').textContent = `${p.weapon.title} · Damage ${this.damageText()} · Reload ${(p.reloadTime / p.attackSpeedMultiplier).toFixed(2)}s`;
    const countdown = getRogueCountdown(this.state.remaining, this.state.phase === 'combat');
    this.root.classList.toggle('rogue-countdown-active', countdown.active);
    this.root.style.setProperty('--rogue-edge-opacity', countdown.edgeOpacity);
    this.root.style.setProperty('--rogue-warning-urgency', countdown.urgency);
    this.root.style.setProperty('--rogue-warning-hue', countdown.hue);
    this.root.style.setProperty('--rogue-timer-scale', countdown.scale);
    this.root.style.setProperty('--rogue-damage-opacity', this.state.phase === 'combat' ? this.world.combatEffects.damageFlash : 0);
  }
  loop(now) {
    this.animationFrameId = null;
    if (this.disposed) return;
    const dt = document.hidden ? 0 : clampFrameDelta((now - this.lastTime) / 1000);
    this.lastTime = now;
    const wasDiceReveal = !!this.diceReveal;
    if (this.diceReveal) {
      this.advanceDiceReveal(dt);
    } else if (this.roundTransition) {
      this.advanceRoundTransition(dt);
    }
    this.world.topHudReserve = this.root.querySelector('header').getBoundingClientRect().bottom + 20;
    this.world.bottomHudReserve = this.canvas.height - this.root.querySelector('footer').getBoundingClientRect().top + 20;
    if (this.state.phase === 'combat' && !wasDiceReveal) {
      this.accumulator += dt;
      const input = this.input;
      const step = 1 / 60;
      let updates = 0;
      while (this.accumulator >= step && updates++ < 8 && this.state.phase === 'combat') {
        const before = this.world.killcount.player;
        this.world.update(step, input);
        this.state.awardKills(this.world.killcount.player - before);
        this.state.tick(step, this.world.player.hp);
        this.accumulator -= step;
      }
      if (updates >= 8) this.accumulator %= step;
      if (this.state.phase !== 'combat') {
        this.input.reset();
        this.accumulator = 0;
        this.beginRoundTransition();
      }
    }
    this.world.updateCamera();
    this.world.reducedMotion = !!this.motionQuery?.matches;
    this.ctx.fillStyle = '#070d16';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.beginPath(); this.ctx.rect(0, 0, this.canvas.width, this.canvas.height); this.ctx.clip();
    this.world.drawArena(this.ctx);
    this.ctx.restore();
    this.renderHUD();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }
}
