import { createShopState } from './helpers/rogue-shop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RogueGame } from '../src/js/81-rogue-game.js';
import { RoguePlayerTank } from '../src/js/50-rogue-world.js';
import { RogueState } from '../src/js/42-rogue-state.js';

function healthDisplay() {
  const classes = new Set(), attributes = new Map();
  const bar = { setAttribute(name, value) { attributes.set(name, value); } };
  const label = {};
  return {
    bar, label, attributes, classes,
    querySelector(selector) { return selector === 'progress' ? bar : label; },
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
  };
}

test('combat and preparation health bars stay synchronized through damage, max-HP abilities, repair and death', () => {
  const player = new RoguePlayerTank(0, 0), state = createShopState();
  const displays = [healthDisplay(), healthDisplay()];
  const fields = new Map();
  const game = {
    root: { classList: { toggle() {} }, style: { setProperty() {} } },
    world: { player }, state, healthDisplays: displays, damageText: () => '',
    el(id) { if (!fields.has(id)) fields.set(id, { classList: { toggle() {} } }); return fields.get(id); },
  };
  const render = () => RogueGame.prototype.renderHUD.call(game);
  const assertHealth = (current, max, color) => {
    render();
    for (const display of displays) {
      assert.equal(display.bar.value, current); assert.equal(display.bar.max, max);
      assert.equal(display.label.textContent, `${Math.ceil(current)} / ${max}`);
      assert.equal(display.attributes.get('aria-valuetext'), `${Math.ceil(current)} of ${max} HP`);
      assert.equal(display.classes.has('warning'), color === 'warning');
      assert.equal(display.classes.has('danger'), color === 'danger');
    }
  };
  assertHealth(125, 125, 'normal');
  player.takeDamage(50.5); assertHealth(74.5, 125, 'warning');
  player.takeDamage(40); assertHealth(34.5, 125, 'danger');
  state.abilityChoices = ['hull']; state.chooseAbility('hull', player);
  assertHealth(34.5, 225, 'danger');
  state.points = 5; assert.equal(state.buy('heal', player), true);
  assertHealth(225, 225, 'normal');
  player.takeDamage(300); assertHealth(0, 225, 'danger');
});
