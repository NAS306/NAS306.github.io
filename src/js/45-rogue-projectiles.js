import { clamp } from './00-math.js';

// Trace every leg so fast shells cannot skip a wall or hit along a false chord.
// A corner is one contact, reflecting both velocity components at once.
export function traceRogueRicochet(bullet, bounds) {
  const left = bounds.minX + bullet.radius, right = bounds.maxX - bullet.radius;
  const top = bounds.minY + bullet.radius, bottom = bounds.maxY - bullet.radius;
  bullet.rogueSegments = null;
  bullet.rogueWallStop = false;
  if (left >= right || top >= bottom) {
    bullet.x = (bounds.minX + bounds.maxX) / 2;
    bullet.y = (bounds.minY + bounds.maxY) / 2;
    bullet.rogueWallStop = true;
    bullet.rogueSegments = [];
    return;
  }
  const previousX = bullet.previousX ?? bullet.x, previousY = bullet.previousY ?? bullet.y;
  if (previousX >= left && previousX <= right && previousY >= top && previousY <= bottom &&
      bullet.x > left && bullet.x < right && bullet.y > top && bullet.y < bottom) return;
  bullet.rogueSegments = [];
  let x = clamp(previousX, left, right);
  let y = clamp(previousY, top, bottom);
  let dx = bullet.x - previousX;
  let dy = bullet.y - previousY;
  for (;;) {
    const tx = dx > 0 ? (right - x) / dx : dx < 0 ? (left - x) / dx : Infinity;
    const ty = dy > 0 ? (bottom - y) / dy : dy < 0 ? (top - y) / dy : Infinity;
    const t = Math.min(1, tx, ty);
    const endX = x + dx * t, endY = y + dy * t;
    bullet.rogueSegments.push({ previousX: x, previousY: y, x: endX, y: endY });
    x = endX; y = endY;
    if (tx > 1 && ty > 1) break;
    if (bullet.wallBouncesRemaining <= 0) {
      bullet.rogueWallStop = true;
      break;
    }
    bullet.wallBouncesRemaining--;
    const hitX = Math.abs(tx - t) < 1e-9, hitY = Math.abs(ty - t) < 1e-9;
    if (hitX) bullet.vx = -bullet.vx;
    if (hitY) bullet.vy = -bullet.vy;
    dx *= (1 - t) * (hitX ? -1 : 1);
    dy *= (1 - t) * (hitY ? -1 : 1);
    if (dx === 0 && dy === 0) break;
  }
  bullet.x = x; bullet.y = y;
}
