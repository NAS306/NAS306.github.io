import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  detectMobileDevice,
  getLayoutDragThreshold,
  MOBILE_DRAG_TOLERANCE_PX,
} from "../src/js/02-mobile-support.js";

const indexSource = (await Promise.all(['index.template.html', 'html/body.html', 'styles/main.css', 'styles/mode-select.css'].map(path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')))).join('\n');
const gameSource = await readFile(new URL("../src/js/90-game.js", import.meta.url), "utf8");

test("desktop-class iPadOS user agents still enter mobile mode", () => {
  assert.equal(detectMobileDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    platform: "MacIntel",
    maxTouchPoints: 5,
  }), true);
  assert.equal(detectMobileDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    platform: "MacIntel",
    maxTouchPoints: 0,
  }), false);
});

test("small coarse-pointer devices are detected even with a desktop user agent", () => {
  assert.equal(detectMobileDevice({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
    coarsePointer: true,
    screenWidth: 390,
    screenHeight: 844,
  }), true);
});

test("long-press drag tolerance stays constant in visual pixels", () => {
  assert.equal(getLayoutDragThreshold(1), MOBILE_DRAG_TOLERANCE_PX);
  assert.equal(getLayoutDragThreshold(undefined), MOBILE_DRAG_TOLERANCE_PX);
  assert.ok(Math.abs(getLayoutDragThreshold(0.4) - 30) < 1e-12);
});

test("mobile selector scrolls without a fixed card height and uses two readable columns", () => {
  const screenRule = indexSource.match(/#loading-screen \{([^}]+)\}/)?.[1] ?? '';
  assert.match(screenRule, /overflow-y:\s*auto/);
  assert.match(indexSource, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(indexSource, /max-height:\s*none/);
  assert.match(indexSource, /height:\s*auto/);
});

test("canvas resize tolerates an initializing game and clamps vertical camera", () => {
  assert.match(gameSource, /const world = game\?\.world;/);
  assert.match(gameSource, /world\.camera\.y = Math\.max/);
});

test("scenario buttons use standard click activation without stealing keyboard input", () => {
  assert.match(gameSource, /focusedScenarioButton/);
  assert.match(gameSource, /button\.addEventListener\("click"/);
  assert.match(
    gameSource,
    /startGame\(button\.dataset\.scenario\)/,
  );
});

test("mobile spectator mode hides the bottom item HUD without disabling long press", () => {
  const bottomHudRule = indexSource.match(
    /body\.mobile-mode #bottom-hud \{([\s\S]*?)\}/,
  )?.[1] ?? "";
  assert.match(bottomHudRule, /display:\s*none\s*!important/);
  assert.doesNotMatch(indexSource, /mobile-orbital-label|mobile-orbital-hint/);
  assert.match(
    gameSource,
    /itemToolbarEl\.style\.display = game\.isSpectatorMode \? "none" : "block"/,
  );
  assert.match(gameSource, /this\.longPressTimer = window\.setTimeout/);
});
