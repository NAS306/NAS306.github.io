import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateSpatialVolume,
  circlesOverlap,
  clampFrameDelta,
} from "../src/js/01-runtime.js";

test("spatial volume is full at the listener and silent at max distance", () => {
  assert.equal(calculateSpatialVolume(500, 500, 0.8, 1000), 0.8);
  assert.equal(calculateSpatialVolume(1500, 500, 0.8, 1000), 0);
  assert.equal(calculateSpatialVolume(-500, 500, 0.8, 1000), 0);
});

test("spatial volume attenuates linearly and remains bounded", () => {
  assert.equal(calculateSpatialVolume(1000, 500, 0.8, 1000), 0.4);
  assert.equal(calculateSpatialVolume(500, 500, 2, 1000), 1);
  assert.equal(calculateSpatialVolume(500, 500, -1, 1000), 0);
});

test("frame delta rejects invalid values and caps long pauses", () => {
  assert.equal(clampFrameDelta(-1), 0);
  assert.equal(clampFrameDelta(Number.NaN), 0);
  assert.equal(clampFrameDelta(0.016), 0.016);
  assert.equal(clampFrameDelta(3, 0.25), 0.25);
});

test("circle collision includes touching edges", () => {
  assert.equal(circlesOverlap(0, 0, 5, 10, 0, 5), true);
  assert.equal(circlesOverlap(0, 0, 5, 10.01, 0, 5), false);
  assert.equal(circlesOverlap(0, 0, 5, 0, 0, 1), true);
});
