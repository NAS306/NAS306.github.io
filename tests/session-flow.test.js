import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setModeSelectionHandler, returnToModeSelection } from '../src/js/12-game-flow.js';
import { RogueGame, getRoguePanelLayout } from '../src/js/81-rogue-game.js';

const gameSource = readFileSync(new URL('../src/js/90-game.js', import.meta.url), 'utf8');

class Element extends EventTarget {
  constructor() {
    super(); this.style = {}; this.dataset = {}; this.focusCount = 0;
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
    };
  }
  focus() { this.focusCount++; }
}

test('all modes return to a ready selector without reloading assets or leaving music timers', async () => {
  const modes = ['frontline', 'siege', 'defense', 'breakthrough', 'roguelike'];
  const buttons = modes.map(mode => { const button = new Element(); button.dataset.scenario = mode; return button; });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const canvas = element('gameCanvas'); canvas.getContext = () => ({ clearRect() {} });
  const bgm = element('bgm'); bgm.play = () => Promise.resolve(); bgm.pause = () => {};
  const intervals = new Map(); let nextTimer = 0, boot;
  const windowMock = new EventTarget();
  const add = windowMock.addEventListener.bind(windowMock);
  windowMock.addEventListener = (name, listener) => name === 'DOMContentLoaded' ? boot = listener : add(name, listener);
  Object.assign(windowMock, { innerWidth: 1366, innerHeight: 768, location: { reload() { assert.fail('must not reload'); } } });
  const documentMock = {
    body: new Element(), getElementById: element,
    querySelectorAll: () => buttons, querySelector: () => buttons[0],
  };
  const resources = {
    bulletPool: { reset() {} }, explosionPool: { reset() {} },
    audio: { shoot: { pool: [{ pause() {}, volume: 1 }] } },
  };
  const sessions = [];
  class Session {
    constructor(canvas, ...args) {
      this.isSpectatorMode = false; this.args = args; this.disposals = 0;
      this.world = { resize() {}, bounds: { minY: 0, maxY: 5000 }, camera: { y: 0 } };
      sessions.push(this);
    }
    dispose() { this.disposals++; }
  }
  let catalogLoads = 0, spriteLoads = 0;
  vm.runInNewContext(gameSource.slice(gameSource.indexOf('window.addEventListener("DOMContentLoaded"')), {
    window: windowMock, document: documentMock, console, isMobileDevice: false,
    Game: Session, RogueGame: Session, InputManager: class {}, gameResources: resources,
    setModeSelectionHandler, returnToModeSelection, resolveScenario: (_, id) => ({ id }),
    loadLevelCatalog: async () => { catalogLoads++; return {}; },
    preloadSprites: async () => { spriteLoads++; },
    setInterval: callback => { intervals.set(++nextTimer, callback); return nextTimer; },
    clearInterval: id => intervals.delete(id),
  });
  await boot();
  assert.equal(intervals.size, 0);
  for (let pass = 0; pass < 2; pass++) {
    for (const button of buttons) {
      const previousCount = sessions.length;
      button.dispatchEvent(new Event('click'));
      assert.equal(sessions.length, previousCount + 1, button.dataset.scenario);
      const session = sessions.at(-1);
      assert.ok(element('loading-screen').classList.contains('hidden'));
      element('overlay-menu').dispatchEvent(new Event('click'));
      assert.equal(session.disposals, 1);
      assert.equal(intervals.size, 0);
      assert.equal(element('loading-screen').classList.contains('hidden'), false);
      assert.equal(element('loading-title').textContent, 'Choose your front.');
      assert.equal(element('bottom-hud').style.display, 'none');
      assert.equal(catalogLoads, 1); assert.equal(spriteLoads, 1);
    }
  }
  assert.equal(sessions.length, 10);
  setModeSelectionHandler(null);
});

test('team-mode result scenes remain open indefinitely instead of returning on a timer', () => {
  const source = gameSource.slice(gameSource.indexOf('export class Game {'), gameSource.indexOf('// main.js'));
  let returns = 0, frames = 0;
  const Game = vm.runInNewContext(source.replace('export class', 'class') + '; Game;', {
    requestAnimationFrame() { frames++; return frames; },
    clampFrameDelta: dt => Math.min(.25, dt), returnToModeSelection() { returns++; },
  });
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const canvas = { width: 800, height: 600, getContext: () => ctx };
  const game = {
    disposed: false, lastTime: 0, running: false, accumulator: 0, canvas,
    endingExplosions: { timer: 1, target: { y: 400 }, explosions: [], message: 'VICTORY' },
    world: { canvas, camera: { y: 0 }, draw() {} }, boundLoop() {},
  };
  for (let i = 1; i <= 240; i++) Game.prototype.loop.call(game, i * 1000);
  assert.equal(returns, 0); assert.equal(frames, 240);
  assert.equal(game.accumulator, 0); assert.ok(game.endingExplosions);
});

test('disposing team input removes listeners and cancels long press before another session', () => {
  const windowMock = new EventTarget();
  Object.assign(windowMock, { clearTimeout() {}, visualViewport: { scale: 1 } });
  const documentMock = new EventTarget();
  const source = gameSource.slice(gameSource.indexOf('export class EventManager'), gameSource.indexOf('// core/managers/GameStateManager'));
  const EventManager = vm.runInNewContext(source.replace('export class', 'class') + '; EventManager;', {
    window: windowMock, document: documentMock, AbortController,
    ITEM_BY_KEY: {}, MOBILE_LONG_PRESS_MS: 650, getLayoutDragThreshold: () => 12,
  });
  const canvas = new Element();
  let switches = 0;
  const game = { canvas, isSpectatorMode: true, switchPlayerWeapon() { switches++; } };
  const key = () => { const event = new Event('keydown'); Object.assign(event, { code: 'KeyQ' }); windowMock.dispatchEvent(event); };
  for (let i = 0; i < 3; i++) {
    const manager = new EventManager(game);
    key(); assert.equal(switches, i + 1);
    manager.dispose(); key(); assert.equal(switches, i + 1);
    assert.equal(manager.longPressTimer, null);
    assert.equal(manager.events.signal.aborted, true);
  }
});

test('both game implementations cancel their frame and ignore stale callbacks after disposal', () => {
  let cancelled = 0, removed = 0, reset = 0;
  const previousCancel = globalThis.cancelAnimationFrame, previousDocument = globalThis.document;
  globalThis.cancelAnimationFrame = () => { cancelled++; };
  globalThis.document = { body: { classList: { remove() {} } } };
  try {
    const game = {
      events: new AbortController(), animationFrameId: 42,
      input: { reset() { reset++; }, dispose() {} }, root: { remove() { removed++; } },
    };
    RogueGame.prototype.dispose.call(game); RogueGame.prototype.dispose.call(game);
    RogueGame.prototype.loop.call(game, 0);
    assert.equal(cancelled, 1); assert.equal(removed, 1); assert.equal(reset, 1);
    const source = gameSource.slice(gameSource.indexOf('export class Game {'), gameSource.indexOf('// main.js'));
    const Game = vm.runInNewContext(source.replace('export class', 'class') + '; Game;', {
      cancelAnimationFrame() { cancelled++; },
    });
    const team = { animationFrameId: 99, eventManager: { dispose() {} }, input: game.input, ui: { hideOverlay() {} } };
    Game.prototype.dispose.call(team); Game.prototype.dispose.call(team);
    Game.prototype.loop.call(team, 0);
    assert.equal(team.running, false); assert.equal(team.disposed, true);
    assert.equal(cancelled, 2);
  } finally {
    globalThis.cancelAnimationFrame = previousCancel; globalThis.document = previousDocument;
  }
});

test('desktop preparation content grows with the viewport while remaining fully fitted', () => {
  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440]]) {
    const layout = getRoguePanelLayout(width, height);
    assert.ok(Math.abs(layout.width * layout.scale - width) < 1e-8);
    assert.ok(Math.abs(layout.height * layout.scale - height) < 1e-8);
    assert.ok(layout.height >= 800);
    assert.ok(16 * layout.scale >= 14.4 - 1e-8);
  }
  assert.ok(getRoguePanelLayout(1920, 1080).scale > 1);
});
