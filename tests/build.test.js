import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JS_MODULES, CSS_FILES } from '../build.js';
import { MODE_CARDS, modeArtwork, renderModeCards } from '../src/js/80-mode-cards.js';

test('the standalone HTML contains its body, styles, script, map and media without external resource loads', async () => {
  const html = await readFile(new URL('../dist/app.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="gameCanvas"')); assert.ok(html.includes('#rogue-ui'));
  assert.equal([...html.matchAll(/data-scenario="/g)].length, 5);
  assert.ok(html.includes('data:audio/mpeg;base64,')); assert.ok(html.includes('data:audio/wav;base64,'));
  assert.ok(html.includes('data:image/png;base64,'));
  assert.ok(!/\b(?:src|href)=["'](?:\.\/|https?:)/.test(html));
  assert.ok(!/<script[^>]+src=/.test(html)); assert.ok(!html.includes('await fetch('));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script?.includes('var TankGame ='));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('numbered build inputs are ordered explicitly and every JS dependency precedes its importer', async () => {
  assert.equal(new Set(JS_MODULES).size, JS_MODULES.length);
  assert.ok(JS_MODULES.every(file => /^src\/js\/\d{2}-/.test(file)));
  const basenames = JS_MODULES.map(file => file.split('/').at(-1));
  assert.deepEqual(basenames, [...basenames].sort());
  for (let index = 0; index < JS_MODULES.length; index++) {
    const source = await readFile(new URL(`../${JS_MODULES[index]}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/from\s+['"]\.\/([^'"]+\.js)['"]/g)) {
      const dependency = basenames.indexOf(match[1]);
      assert.ok(dependency >= 0 && dependency < index, `${JS_MODULES[index]} imports ${match[1]}`);
    }
  }
  assert.equal(CSS_FILES.at(-1), 'src/styles/mode-select.css');
});

test('mode cards identify every mission with in-game shapes, objective squares and text below each scene', () => {
  const cards = renderModeCards();
  assert.equal(MODE_CARDS.length, 5);
  for (const card of MODE_CARDS) {
    const artwork = modeArtwork(card.id);
    assert.ok(cards.includes(`data-scenario="${card.id}"`)); assert.ok(cards.includes(card.title));
    assert.ok(cards.includes(card.description)); assert.ok(artwork.includes('data-unit-shape="circle"') || card.id === 'defense');
    assert.ok(artwork.includes('data-unit-shape="triangle"')); assert.ok(artwork.includes('data-unit-shape="square"'));
    assert.ok(artwork.includes('#ff6a6a')); assert.ok(artwork.includes('#ffe600'));
    if (['frontline', 'siege', 'defense'].includes(card.id)) assert.ok(artwork.includes('data-objective='));
  }
});
