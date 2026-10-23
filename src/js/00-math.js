// Shared, dependency-free math helpers.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getLeadAngle(shooter, target, projectileSpeed) {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const targetVx = target.vx || 0;
  const targetVy = target.vy || 0;
  const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);
  const timeToImpact = dist / projectileSpeed;
  const predictedX = target.x + targetVx * timeToImpact;
  const predictedY = target.y + targetVy * timeToImpact;
  let leadMultiplier = 1;
  if (targetSpeed > 50) {
    leadMultiplier += (targetSpeed - 50) / 200;
  }
  const finalPredictedX =
    shooter.x + (predictedX - shooter.x) * leadMultiplier;
  const finalPredictedY =
    shooter.y + (predictedY - shooter.y) * leadMultiplier;
  return Math.atan2(finalPredictedY - shooter.y, finalPredictedX - shooter.x);
}
