import { Tank } from './30-entities.js';
import { World } from './31-systems.js';
import { getRoundConfig } from './42-rogue-state.js';
import { clamp } from './00-math.js';
import { RogueCombatEffects } from './43-rogue-effects.js';
import { ROGUE_PLAYER_BASE, ROGUE_ENEMY_RULES as ENEMY_DIFFICULTY, resolveRoguePlayerWeapon, getRoguePlayerWeapon, getRogueExplosivePayload, getRogueDeathBlast } from './40-rogue-balance.js';
import { STARTING_AMMO, planAmmoVolley, supplyRoundAmmo } from './20-rogue-ammo.js';
import { createRogueRunStats, healRoguePlayer } from './22-rogue-stats.js';
import { traceRogueRicochet } from './45-rogue-projectiles.js';

export class RoguePlayerTank extends Tank {
  constructor(x, y) {
    super(x, y, 'blue', true, false, 'standard');
    this.speed = ROGUE_PLAYER_BASE.speed;
    this.maxHP = this.hp = ROGUE_PLAYER_BASE.maxHP;
    this.ammo = STARTING_AMMO;
    this.ammoSuppliedThroughRound = 1;
    this.runStats = createRogueRunStats();
    this.combatElapsed = 0;
    this.setWeapon();
  }
  setWeapon() {
    this.weaponId = 'standard';
    this.weapon = resolveRoguePlayerWeapon();
    this.reloadTime = this.weapon.reloadTime;
  }
  tryShoot(world) {
    if (this.hp <= 0 || this.fireCooldown > 0) return false;
    const regular = getRoguePlayerWeapon(this);
    const plan = planAmmoVolley(this.ammo, regular.pelletCount, this.extraExplosiveProjectiles ?? 0);
    if (plan.cost === 0) return false;
    if (plan.regular > 0) this.fireProjectiles(world, { ...regular, pelletCount: plan.regular });
    if (plan.explosive > 0) this.fireProjectiles(world, { ...getRogueExplosivePayload(this), pelletCount: plan.explosive });
    this.ammo -= plan.cost;
    this.runStats.ammoSpent += plan.cost;
    this.fireCooldown = regular.reloadTime;
    world.playSpatialAudio('shoot', this.y, 0.4);
    world.combatEffects?.shoot(plan.explosive > 0 ? 'heavy' : 'standard');
    return true;
  }
  takeDamage(damage) {
    if (!Number.isFinite(damage) || damage <= 0 || this.isShieldActive()) return;
    const before = Math.max(0, this.hp);
    // Negative armor is a survival tradeoff; team-mode damage rules stay intact.
    const incoming = damage + Math.max(0, -this.armor);
    // Apply the bargain after armor: the actual damage suffered is doubled.
    const armored = this.armor > 0 ? Math.max(1, incoming - this.armor) : incoming;
    const scaled = armored * (this.incomingDamageMultiplier ?? 1);
    super.takeDamage(scaled + Math.max(0, this.armor));
    this.runStats.damageTaken += before - Math.max(0, this.hp);
  }
  isShieldActive() {
    return !!this.pulseShield && this.combatElapsed >= 3 - 1e-9 && (this.combatElapsed + 1e-9) % 3 < 1;
  }
  update(dt, world, input) {
    if (this.hp <= 0) return;
    this.combatElapsed += dt;
    super.update(dt, world, input);
  }
  draw(ctx, camera) {
    super.draw(ctx, camera);
    if (this.hp <= 0 || !this.isShieldActive()) return;
    ctx.save(); ctx.strokeStyle = '#81e8ff'; ctx.lineWidth = 3;
    ctx.shadowBlur = 12; ctx.shadowColor = '#81e8ff';
    ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.radius + 10, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

function trackAngle(current, target, dt) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  // Half the previous instant correction at 60 Hz; consistent across frame rates.
  const response = 1 - Math.pow(1 - ENEMY_DIFFICULTY.trackingResponse, dt * 60);
  return current + difference * response;
}

export function getRogueCameraY(playerY, mapSize, viewportHeight, topReserve = 96, bottomReserve = 84) {
  const targetY = Math.max(32, (topReserve + viewportHeight - bottomReserve) / 2);
  return clamp(playerY - targetY, -topReserve, Math.max(-topReserve, mapSize - viewportHeight + bottomReserve));
}

// Share projectile collisions, damage, pools and sounds; no bases, allies or team spawning.
export class RogueWorld extends World {
  constructor(canvas, resources) {
    super(canvas, false, false, resources, {
      id: 'roguelite', mode: 'roguelite', playerTeam: 'blue',
      mapDefinition: { worldHeight: canvas.width },
    });
    this.strongholds = [];
    this.turrets = [];
    this.point = 0;
    this.combatEffects = new RogueCombatEffects();
    this.pendingDeathBlasts = [];
    this.player = new RoguePlayerTank(canvas.width / 2, canvas.width / 2);
    this.tanks = [this.player];
    this.spawnCountdown = 0;
    this.spawnIndex = 0;
    this.roundConfig = getRoundConfig(1);
    this.topHudReserve = 96;
    this.bottomHudReserve = 84;
    this.updateCamera();
  }
  resize(width) {
    const ratio = width / this.bounds.maxX;
    for (const tank of this.tanks) { tank.x *= ratio; tank.y *= ratio; }
    this.bounds.maxX = width;
    this.bounds.maxY = width;
    // Existing projectile coordinates cannot be rescaled safely mid-flight.
    this.bulletPool.reset();
    this.explosionPool.reset();
    this.updateCamera();
  }
  clearRound() {
    this.combatEffects.reset();
    this.pendingDeathBlasts.length = 0;
    this.tanks = [this.player];
    this.bulletPool.reset();
    this.explosionPool.reset();
    this.player.vx = this.player.vy = 0;
    this.player.hitFlashRemaining = 0;
    this.spawnCountdown = 0;
  }
  startRound(round, enemyDiceBonuses = {}) {
    this.clearRound();
    this.player.x = (this.bounds.minX + this.bounds.maxX) / 2;
    this.player.y = (this.bounds.minY + this.bounds.maxY) / 2;
    this.player.rogueMotionVX = this.player.rogueMotionVY = 0;
    this.player.combatElapsed = 0;
    supplyRoundAmmo(this.player, round);
    this.roundConfig = getRoundConfig(round, enemyDiceBonuses);
    this.spawnedByWeapon = { standard: 0, scatter: 0, heavy: 0 };
    while (this.tanks.length - 1 < this.roundConfig.maxEnemies) this.spawnEnemy();
    this.updateCamera();
  }
  spawnEnemy() {
    // Weighted deficit scheduling keeps small waves close to the configured mix.
    const total = Object.values(this.spawnedByWeapon).reduce((sum, count) => sum + count, 0) + 1;
    const weapon = Object.keys(this.roundConfig.weights).sort((a, b) =>
      (total * this.roundConfig.weights[b] / 100 - this.spawnedByWeapon[b]) -
      (total * this.roundConfig.weights[a] / 100 - this.spawnedByWeapon[a]),
    )[0];
    this.spawnedByWeapon[weapon]++;
    const side = this.bounds.maxX;
    const inset = Math.min(24, side * 0.05);
    const along = inset + Math.random() * (side - inset * 2);
    const edge = this.spawnIndex++ % 4;
    let [x, y] = [[along, inset], [side - inset, along], [along, side - inset], [inset, along]][edge];
    // Choose the opposite edge if a replacement would spawn too close to the player.
    if (Math.hypot(x - this.player.x, y - this.player.y) < Math.min(180, side * 0.25)) {
      x = side - x; y = side - y;
    }
    const tank = new Tank(x, y, 'red', false, false, weapon);
    tank.maxHP = tank.hp = this.roundConfig.enemyMaxHP;
    tank.speed *= this.roundConfig.enemyMovementMultiplier;
    tank.attackSpeedMultiplier = this.roundConfig.enemyAttackSpeedMultiplier;
    tank.damageMultiplier = this.roundConfig.enemyDamageMultiplier;
    tank.projectileSpeedMultiplier = this.roundConfig.enemyProjectileSpeedMultiplier;
    tank.fireCooldown = 0.8 / tank.attackSpeedMultiplier;
    tank.angle = Math.atan2(this.player.y - y, this.player.x - x);
    tank.turretAngle = tank.angle;
    this.addTank(tank);
    tank.setWeapon(weapon);
  }
  updateTankAI(tank, dt) {
    if (this.player.hp <= 0) return;
    const dx = this.player.x - tank.x, dy = this.player.y - tank.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const preferredRange = tank.weaponId === 'scatter' ? 100 : tank.weaponId === 'heavy' ? 230 : 165;
    tank.turretAngle = trackAngle(tank.turretAngle, angle, dt);
    if (distance > preferredRange) {
      tank.angle = trackAngle(tank.angle, angle, dt);
      tank.x += Math.cos(tank.angle) * tank.speed * dt;
      tank.y += Math.sin(tank.angle) * tank.speed * dt;
    }
    if (distance < tank.weapon.fireRange) tank.tryShoot(this);
  }
  chargeTankLoss() {} // No tickets or bases in solo survival.
  onTankDamaged(tank, damage, isPlayerDamage) {
    if (isPlayerDamage && tank.team !== this.player.team) this.player.runStats.damageDealt += damage;
  }
  onPlayerKill(tank) {
    if (this.player.deathBlastDamage > 0) this.pendingDeathBlasts.push({ x: tank.x, y: tank.y });
  }
  triggerShake(damage) { this.combatEffects.damage(damage); }
  handleBulletWallCollision(bullet) {
    if (bullet.isPlayerBullet && bullet.wallBounceLimit > 0) traceRogueRicochet(bullet, this.bounds);
    return false;
  }
  bulletSegmentIntersectsCircle(bullet, target) {
    if (!bullet.rogueSegments) return super.bulletSegmentIntersectsCircle(bullet, target);
    return bullet.rogueSegments.some(segment => super.bulletSegmentIntersectsCircle({ radius: bullet.radius, ...segment }, target));
  }
  settleRicochet(bullet, allowDamage) {
    if (bullet.active && bullet.rogueWallStop) {
      if (allowDamage && bullet.explosion) {
        this.causeWeaponExplosion(bullet.x, bullet.y, bullet.team, bullet.explosion, true);
      }
      bullet.active = false;
    }
    if (bullet.rogueSegments) {
      bullet.previousX = bullet.x; bullet.previousY = bullet.y;
      bullet.rogueSegments = null;
    }
    bullet.rogueWallStop = false;
  }
  handleCollisions() {
    const before = this.killcount.player;
    super.handleCollisions();
    for (const bullet of this.bulletPool.pool) this.settleRicochet(bullet, true);
    const nova = getRogueDeathBlast(this.player);
    // Iteration rather than recursion: each newly killed tank queues one blast.
    // Dead tanks are skipped by the shared damage resolver, bounding a chain
    // to the enemies in this update, with no extra projectiles or timers.
    for (let index = 0; index < this.pendingDeathBlasts.length; index++) {
      const { x, y } = this.pendingDeathBlasts[index];
      if (nova) this.causeWeaponExplosion(x, y, this.player.team, nova, true);
    }
    this.pendingDeathBlasts.length = 0;
    const kills = this.killcount.player - before;
    if (kills > 0) this.combatEffects.kill(kills);
    if (kills > 0 && this.player.hp > 0 && this.player.killHeal > 0) {
      healRoguePlayer(this.player, kills * this.player.killHeal);
    }
  }
  updateCamera() {
    this.camera.x = 0;
    this.camera.y = getRogueCameraY(this.player.y, this.bounds.maxY, this.canvas.height, this.topHudReserve, this.bottomHudReserve);
  }
  update(dt, input) {
    this.spawnCountdown -= dt;
    if (this.spawnCountdown <= 0 && this.getAliveTankCount('red') < this.roundConfig.maxEnemies) {
      this.spawnEnemy();
      this.spawnCountdown = this.roundConfig.replacementInterval;
    }
    for (const tank of this.tanks) {
      const beforeX = tank.x, beforeY = tank.y;
      tank.update(dt, this, input);
      tank.rogueMotionVX = dt > 0 ? (tank.x - beforeX) / dt : 0;
      tank.rogueMotionVY = dt > 0 ? (tank.y - beforeY) / dt : 0;
    }
    this.bulletPool.updateAll(dt);
    this.explosionPool.updateAll(dt);
    this.handleCollisions();
    this.removeDestroyedAITanks();
    for (const tank of this.tanks) {
      tank.x = clamp(tank.x, tank.radius, this.bounds.maxX - tank.radius);
      tank.y = clamp(tank.y, tank.radius, this.bounds.maxY - tank.radius);
    }
    this.updateCamera();
    this.combatEffects.update(dt);
  }
  updateAfterRound(dt) {
    // Outcome, HP and rewards are already settled. Animate only the scene.
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      tank.x = clamp(tank.x + (tank.rogueMotionVX ?? 0) * dt, tank.radius, this.bounds.maxX - tank.radius);
      tank.y = clamp(tank.y + (tank.rogueMotionVY ?? 0) * dt, tank.radius, this.bounds.maxY - tank.radius);
      tank.hitFlashRemaining = Math.max(0, tank.hitFlashRemaining - dt);
    }
    this.bulletPool.updateAll(dt);
    for (const bullet of this.bulletPool.pool) {
      if (!bullet.active) continue;
      this.handleBulletWallCollision(bullet);
      this.settleRicochet(bullet, false);
    }
    this.explosionPool.updateAll(dt);
    this.combatEffects.update(dt);
  }
  drawArena(ctx) {
    const side = this.bounds.maxX;
    // Visual offsets never modify the camera used for movement and mouse aim.
    const cam = this.reducedMotion ? this.camera : {
      x: this.camera.x + this.combatEffects.offsetX,
      y: this.camera.y + this.combatEffects.offsetY,
    };
    ctx.fillStyle = '#101c2a';
    ctx.fillRect(-cam.x, -cam.y, side, side);
    ctx.strokeStyle = '#1e3044';
    ctx.lineWidth = 1;
    for (let p = 0; p <= side; p += 80) {
      ctx.beginPath(); ctx.moveTo(p - cam.x, -cam.y); ctx.lineTo(p - cam.x, side - cam.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-cam.x, p - cam.y); ctx.lineTo(side - cam.x, p - cam.y); ctx.stroke();
    }
    ctx.strokeStyle = '#79b6d5';
    ctx.lineWidth = 3;
    ctx.strokeRect(-cam.x, -cam.y, side, side);
    this.explosionPool.drawAll(ctx, cam);
    this.bulletPool.drawAll(ctx, cam);
    for (const tank of this.tanks) tank.draw(ctx, cam);
  }
}
