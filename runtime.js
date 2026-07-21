import { clamp } from "./math.js";

export function clampFrameDelta(deltaSeconds, maxDeltaSeconds = 0.25) {
  return clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, maxDeltaSeconds);
}

export function calculateSpatialVolume(
  originY,
  listenerY,
  baseVolume = 0.2,
  maxDistance = 1200,
) {
  const safeBaseVolume = clamp(baseVolume, 0, 1);
  if (maxDistance <= 0) return originY === listenerY ? safeBaseVolume : 0;
  const distance = Math.abs(originY - listenerY);
  return clamp(safeBaseVolume * (1 - distance / maxDistance), 0, 1);
}

export function circlesOverlap(ax, ay, aRadius, bx, by, bRadius) {
  const dx = ax - bx;
  const dy = ay - by;
  const combinedRadius = aRadius + bRadius;
  return dx * dx + dy * dy <= combinedRadius * combinedRadius;
}
