// systems.js
import { Bullet, Explosion, Tank, Turret } from './entities.js';
import { bulletPool, explosionPool } from './game.js';

// utils/math.js
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

// ai/AIController.js
// AI Constants
const AI_CONSTANTS = {
  STRAFE_MIN_TIME: 0.5,
  STRAFE_MAX_TIME: 2.0,
  ORBIT_MIN_TIME: 1,
  ORBIT_MAX_TIME: 3,
  TARGET_SELECTION_TIME: 10,
  ENGAGE_RANGE: 450,
  DESIRED_MIN_DISTANCE: 250,
  DESIRED_MAX_DISTANCE: 350,
  ORBIT_FACTOR: 0.75,
  RADIAL_GAIN: 0.45,
  RADIAL_CAP_FACTOR: 0.6,
  STRAFE_FACTOR: 0.3,
  AWARENESS_RANGE: 2000,
  FIRE_RANGE: 500,
  PROJECTILE_SPEED: 400
};

function initializeAIState(tank) {
  // Initialize strafe direction if not set
  if (tank.strafeDir === undefined || tank.strafeDir === null) {
    tank.strafeDir = Math.random() < 0.5 ? -1 : 1;
  }
  
  // Initialize strafe timer if not set
  if (tank.strafeTimer === undefined || tank.strafeTimer === null) {
    tank.strafeTimer = AI_CONSTANTS.STRAFE_MIN_TIME + Math.random() * (AI_CONSTANTS.STRAFE_MAX_TIME - AI_CONSTANTS.STRAFE_MIN_TIME);
  }
  
  // Initialize orbit direction if not set
  if (tank.orbitDir === undefined || tank.orbitDir === null) {
    tank.orbitDir = Math.random() < 0.5 ? 1 : -1;
  }
  
  // Initialize orbit switch timer if not set
  if (tank.orbitSwitchTimer === undefined || tank.orbitSwitchTimer === null) {
    tank.orbitSwitchTimer = AI_CONSTANTS.ORBIT_MIN_TIME + Math.random() * (AI_CONSTANTS.ORBIT_MAX_TIME - AI_CONSTANTS.ORBIT_MIN_TIME);
  }
  
  // Initialize target selection timer if not set
  if (tank.targetSelectionTimer === undefined || tank.targetSelectionTimer === null) {
    tank.targetSelectionTimer = AI_CONSTANTS.TARGET_SELECTION_TIME;
  }
}

function updateAIState(tank, dt) {
  tank.strafeTimer -= dt;
  if (tank.strafeTimer <= 0) {
    tank.strafeDir = Math.random() < 0.5 ? -1 : 1;
    tank.strafeTimer = AI_CONSTANTS.STRAFE_MIN_TIME + Math.random() * (AI_CONSTANTS.STRAFE_MAX_TIME - AI_CONSTANTS.STRAFE_MIN_TIME);
  }
  
  tank.orbitSwitchTimer -= dt;
  if (tank.orbitSwitchTimer <= 0) {
    tank.orbitDir *= -1;
    tank.orbitSwitchTimer = AI_CONSTANTS.ORBIT_MIN_TIME + Math.random() * (AI_CONSTANTS.ORBIT_MAX_TIME - AI_CONSTANTS.ORBIT_MIN_TIME);
  }
  
  tank.targetSelectionTimer -= dt;
}

function selectTarget(tank, targetsInRange) {
  let nearest = null;
  let distToTarget = Infinity;
  
  const shouldSelectNewTarget = tank.targetSelectionTimer <= 0 || !tank.currentTarget || tank.currentTarget.hp <= 0;
  
  if (shouldSelectNewTarget) {
    // Select random target from those in range
    if (targetsInRange.length > 0) {
      const randomIndex = Math.floor(Math.random() * targetsInRange.length);
      tank.currentTarget = targetsInRange[randomIndex];
      tank.targetSelectionTimer = AI_CONSTANTS.TARGET_SELECTION_TIME;
    } else {
      tank.currentTarget = null;
      tank.targetSelectionTimer = 1;
    }
  }
  
  // Use current target if valid
  if (tank.currentTarget) {
    const targetAlive = tank.currentTarget.hp === undefined || tank.currentTarget.hp > 0;
    const targetInRange = distance(tank.currentTarget, tank) <= AI_CONSTANTS.ENGAGE_RANGE;
    
    // Check if stronghold is still enemy-owned
    let targetValid = true;
    if (tank.currentTarget.isStronghold === true) {
      const stillEnemyOwned = tank.currentTarget.owner !== tank.team;
      targetValid = stillEnemyOwned;
    }
    
    if (targetAlive && targetInRange && targetValid) {
      nearest = tank.currentTarget;
      distToTarget = distance(nearest, tank);
    } else {
      tank.currentTarget = null;
      tank.targetSelectionTimer = 0;
    }
  }
  
  // Fallback to random target from range if no valid current target
  if (!nearest && targetsInRange.length > 0) {
    const randomIndex = Math.floor(Math.random() * targetsInRange.length);
    nearest = targetsInRange[randomIndex];
    distToTarget = distance(nearest, tank);
  }
  
  return { nearest, distToTarget };
}

function buildTargetsInRange(tank, world) {
  const targetsInRange = [];
  
  for (const t of world.tanks) {
    const isEnemy = t.team !== tank.team;
    const isAlive = t.hp > 0;
    const distToTank = distance(t, tank);
    const inRange = distToTank <= AI_CONSTANTS.ENGAGE_RANGE;
    if (isEnemy && isAlive && inRange) {
      targetsInRange.push(t);
    }
  }
  
  for (const s of world.strongholds) {
    const isAlive = s.hp > 0 && s.isCapturing !== true;
    const isNotOwned = s.owner !== tank.team;
    const distToStronghold = distance(s, tank);
    const inRange = distToStronghold <= AI_CONSTANTS.ENGAGE_RANGE;
    if (isAlive && isNotOwned && inRange) {
      targetsInRange.push(s);
    }
  }
  
  let enemyBaseTeam = "blue";
  if (tank.team === "blue") {
    enemyBaseTeam = "red";
  }
  const enemyBase = world.basePos[enemyBaseTeam];
  const distToBase = distance(enemyBase, tank);
  const baseInRange = distToBase <= AI_CONSTANTS.ENGAGE_RANGE;
  if (baseInRange) {
    const baseTarget = {
      x: enemyBase.x,
      y: enemyBase.y,
      isBase: true,
      vx: 0,
      vy: 0
    };
    targetsInRange.push(baseTarget);
  }
  
  return targetsInRange;
}

export function handleTankAI(tank, dt, world) {
  // Determine forward direction based on team
  let forwardDir = 1;
  if (tank.team === "blue") {
    forwardDir = -1;
  }
  
  const moveSpeed = tank.speed;
  
  initializeAIState(tank);
  updateAIState(tank, dt);
  
  // Build target list: find all targets within engage range
  const targetsInRange = buildTargetsInRange(tank, world);
  
  // Select or update target randomly
  const { nearest, distToTarget } = selectTarget(tank, targetsInRange);
  
  // Initialize movement
  let moveX = 0;
  let moveY = 0;
  
  // Engagement parameters
  const DESIRED_MIN = AI_CONSTANTS.DESIRED_MIN_DISTANCE;
  const DESIRED_MAX = AI_CONSTANTS.DESIRED_MAX_DISTANCE;
  const ENGAGE_MAX = AI_CONSTANTS.ENGAGE_RANGE;
  const ORBIT_FACTOR = AI_CONSTANTS.ORBIT_FACTOR;
  const RADIAL_GAIN = AI_CONSTANTS.RADIAL_GAIN;
  const RADIAL_CAP = moveSpeed * AI_CONSTANTS.RADIAL_CAP_FACTOR;
  
  // Determine movement based on distance to nearest target
  const inEngageRange = nearest && distToTarget <= ENGAGE_MAX;
  if (inEngageRange) {
    // Calculate direction vector from tank to target
    const dx = nearest.x - tank.x;
    const dy = nearest.y - tank.y;
    const distToNearest = Math.max(Math.hypot(dx, dy), 1e-4);
    
    // Normalize direction vector
    const rx = dx / distToNearest;
    const ry = dy / distToNearest;
    
    // Calculate tangent vector for orbit (perpendicular to radial direction)
    const tx = tank.orbitDir * -ry;
    const ty = tank.orbitDir * rx;
    
    // Orbital movement component
    moveX = tx * moveSpeed * ORBIT_FACTOR;
    moveY = ty * moveSpeed * ORBIT_FACTOR;
    
    // Radial adjustment to maintain distance
    let radial = 0;
    const tooClose = distToNearest < DESIRED_MIN;
    const tooFar = distToNearest > DESIRED_MAX;
    
    if (tooClose) {
      const errorAmount = (DESIRED_MIN - distToNearest) / DESIRED_MIN;
      const pullAwayForce = moveSpeed * RADIAL_GAIN * errorAmount;
      radial = -Math.min(RADIAL_CAP, pullAwayForce);
    } else if (tooFar) {
      const errorAmount = (distToNearest - DESIRED_MAX) / DESIRED_MAX;
      const chaseForce = moveSpeed * RADIAL_GAIN * errorAmount;
      radial = Math.min(RADIAL_CAP, chaseForce);
    }
    
    // Add radial component
    moveX = moveX + rx * radial;
    moveY = moveY + ry * radial;
    
    // Update tank angle if moving
    const hasMovement = moveX !== 0 || moveY !== 0;
    if (hasMovement) {
      tank.angle = Math.atan2(moveY, moveX);
    }
  } else {
    // Check if target is within general awareness range
    const inAwarenessRange = nearest && distToTarget <= AI_CONSTANTS.AWARENESS_RANGE;
    if (inAwarenessRange) {
      // Chase mode: move toward target
      const dx = nearest.x - tank.x;
      const dy = nearest.y - tank.y;
      const chaseAngle = Math.atan2(dy, dx);
      tank.angle = chaseAngle;
      
      const cosChaseAngle = Math.cos(chaseAngle);
      const sinChaseAngle = Math.sin(chaseAngle);
      
      moveX = cosChaseAngle * moveSpeed + tank.strafeDir * moveSpeed * AI_CONSTANTS.STRAFE_FACTOR;
      moveY = sinChaseAngle * moveSpeed;
    } else {
      // Default movement: move forward in team direction
      const isBlueTeam = tank.team === "blue";
      if (isBlueTeam) {
        tank.angle = -Math.PI / 2;
      } else {
        tank.angle = Math.PI / 2;
      }
      moveY = forwardDir * moveSpeed;
      moveX = (tank.strafeDir || 1) * moveSpeed * 0.4;
    }
  }
  
  // Apply movement
  tank.x = tank.x + moveX * dt;
  tank.y = tank.y + moveY * dt;
  
  // Handle targeting and firing
  if (nearest) {
    const hasStronghold = nearest.isStronghold === true;
    const hasBase = nearest.isBase === true;
    
    if (!hasStronghold && !hasBase) {
      // It's a tank, use lead targeting
      tank.turretAngle = getLeadAngle(tank, nearest, 400);
    } else {
      // It's a structure, aim directly
      tank.turretAngle = Math.atan2(nearest.y - tank.y, nearest.x - tank.x);
    }
    
    const fireRange = AI_CONSTANTS.FIRE_RANGE;
    const canFire = distance(nearest, tank) < fireRange;
    if (canFire) {
      tank.tryShoot(world);
    }
  }
}

// core/World.js
export class World {
  constructor(canvas, isSuperMode, isSpectatorMode) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bounds = {
      minX: 0,
      maxX: canvas.width,
      minY: 0,
      maxY: 5e3,
    };
    this.camera = { x: 0, y: 0 };
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.tanks = [];
    this.ready = false;
    this.bulletPool = bulletPool;
    this.explosionPool = explosionPool;
    for (const bullet of this.bulletPool.pool) {
      if (Bullet.spriteCache.red) bullet.sprite = Bullet.spriteCache.red;
    }
    for (const explosion of this.explosionPool.pool) {
      if (Explosion.sprite) explosion.sprite = Explosion.sprite;
    }
    this.spawnTimer = 0;
    this.spawnInterval = 2;
    this.maxTanksPerTeam = 36;
    this.isSuperMode = isSuperMode;
    this.isSpectatorMode = isSpectatorMode;
    this.point = this.isSuperMode || this.isSpectatorMode ? 999999 : 10;
    this.pointDisplay = null;
    this.killcount = { player: 0, blue: 0, red: 0 };
    this.redTeamKillDisplay = null;
    this.blueTeamKillDisplay = null;
    this.myKillDisplay = null;
    this.defaultBaseHealth = 10e3;
    this.baseHealth = {
      blue: this.defaultBaseHealth,
      red: this.defaultBaseHealth,
    };
    this.basePos = {
      // 파랑 본진: 맵 하단 근처
      blue: { x: canvas.width / 2, y: this.bounds.maxY - 200 },
      // 빨강 본진: 맵 상단 근처
      red: { x: canvas.width / 2, y: this.bounds.minY + 200 },
    };
    this.strongholds = [
      //=========================================
      // 적군 쌍둥이 거점
      //-----------------------------------------
      {
        x: canvas.width / 3 * 1,
        y: this.bounds.maxY * 0.25,
        hp: 4e3,
        owner: "red",
        isTurret: true,
      },
      {
        x: canvas.width / 3 * 2,
        y: this.bounds.maxY * 0.25,
        hp: 4e3,
        owner: "red",
        isTurret: true,
      },
      //=========================================
      // 중앙 거점 (포탑 없음)
      //-----------------------------------------
      {
        x: canvas.width / 2,
        y: this.bounds.maxY * 0.5,
        hp: 4e3,
        owner: null,
        isTurret: false,
      },
      // {
      //   x: canvas.width / 3 * 2,
      //   y: this.bounds.maxY * 0.5,
      //   hp: 4e3,
      //   owner: null,
      //   isTurret: false,
      // },
      //=========================================
      // 아군 쌍둥이 거점
      //-----------------------------------------
      {
        x: canvas.width / 3 * 1,
        y: this.bounds.maxY * 0.75,
        hp: 4e3,
        owner: "blue",
        isTurret: true,
      },
      {
        x: canvas.width / 3 * 2,
        y: this.bounds.maxY * 0.75,
        hp: 4e3,
        owner: "blue",
        isTurret: true,
      },
      //=========================================
    ];
    this.turrets = [];
    this.turrets.push(
      new Turret(this.basePos.blue.x, this.basePos.blue.y, "blue", 75, 0.5),
    );
    this.turrets.push(
      new Turret(this.basePos.red.x, this.basePos.red.y, "red", 75, 0.5),
    );
    // isTurret가 true인 강점은 게임 시작 시에도 포탑 생성
    for (const stronghold of this.strongholds) {
      if (stronghold.isTurret && stronghold.owner) {
        this.turrets.push(
          new Turret(stronghold.x, stronghold.y, stronghold.owner, 75, 1.5),
        );
      }
    }
    this.gameOver = false;
    this.specialCooldown = 0;
    this.specialCoolTime = this.isSuperMode ? 1 :(this.isSpectatorMode ? 5 : 20);
    this.pendingExplosion = null;
    this.specialWeaponText = null;
    this.specialWeaponPoint = 5;
  }
  /**
   * 탱크를 월드에 등록
   */
  addTank(tank) {
    this.tanks.push(tank);
  }
  /**
   * 카메라 흔들림 트리거
   * @param {number} damage - 입은 피해 양
   */
  triggerShake(damage) {
    this.shakeIntensity = Math.min(damage / 5, 20); // 피해에 비례, 최대 20
    this.shakeDuration = 0.5; // 0.5초 동안 흔들림
  }
  /**
   * 월드 틱 업데이트
   * - 웨이브 스폰, 탱크 업데이트, 풀 업데이트(총알/폭발), 충돌 처리
   * - 카메라 추적, 본진 파괴 체크, 포탑 업데이트, 특수 무기 처리
   */
  update(dt, input) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnWave();
    }
    for (const tank of this.tanks) {
      tank.update(dt, this, input);
    }
    this.bulletPool.updateAll(dt);
    this.explosionPool.updateAll(dt);
    this.handleCollisions();
    const player = this.tanks.find((t) => t.isPlayer);
    if (player && !input.keys[" "]) {
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      this.camera.x = clamp(
        player.x - cw / 2,
        this.bounds.minX,
        this.bounds.maxX - cw,
      );
      this.camera.y =
        clamp(player.y - ch / 2, this.bounds.minY, this.bounds.maxY - ch) -
        200;
    }
    if (this.baseHealth.blue <= 0 || this.baseHealth.red <= 0) {
      this.gameOver = true;
    }
    for (const turret of this.turrets) {
      turret.update(dt, this);
    }
    if (this.specialCooldown > 0) this.specialCooldown -= dt;
    if (this.pendingExplosion) {
      this.pendingExplosion.timer -= dt;
      if (
        !this.pendingExplosion.triggered &&
        this.pendingExplosion.timer <= 0
      ) {
        this.causeSpecialExplosion(
          this.pendingExplosion.x,
          this.pendingExplosion.y,
        );
        this.pendingExplosion.triggered = true;
        this.pendingExplosion.fadeTimer = 1;
      }
      if (this.pendingExplosion.triggered) {
        this.pendingExplosion.fadeTimer -= dt;
        if (this.pendingExplosion.fadeTimer <= 0) {
          this.pendingExplosion = null;
        }
      }
    }
    // 카메라 흔들림 처리
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= 0.95; // 감쇠
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }
  /**
   * 충돌 처리
   * - 총알 ↔ 탱크: 데미지 적용, 폭발 생성, 킬 카운트/포인트 반영
   * - 탱크 ↔ 탱크: 서로 밀어내기(중첩 방지)
   */
  handleCollisions() {
    for (const bullet of this.bulletPool.pool) {
      if (!bullet.active) continue;
      for (const tank of this.tanks) {
        if (tank.hp <= 0) continue;
        if (tank.team === bullet.team) continue;
        const dx = bullet.x - tank.x;
        const dy = bullet.y - tank.y;
        const distSq = dx * dx + dy * dy;
        const combinedRadius = bullet.radius + tank.radius;
        if (distSq <= combinedRadius * combinedRadius) {
          // Turret 특수 포탄: 충돌 시 소규모 Orbital Strike 발생
          if (bullet.isTurretSpecial) {
            this.causeTurretOrbitalStrike(bullet.x, bullet.y, bullet.team, bullet.damage);
            bullet.active = false;
          } else {
            // 일반 포탄 처리
            const damage = bullet.damage || 25;
            tank.hp -= damage;
            if (tank.isPlayer) {
              this.triggerShake(damage);
            }
            // 관통 가능한 총알
            if (bullet.penRate <= 1) {
              bullet.active = false;
            } else {
              bullet.penRate --;
            }
            if (tank.isPlayer === true) {
              const hitSounds = document.querySelectorAll("audio.hit");
              const randomIndex = Math.floor(Math.random() * hitSounds.length);
              hitSounds[randomIndex].play();
            }
            if (tank.hp <= 0) {
              this.killcount[bullet.team]++;
              this.baseHealth[tank.team] -= 5;
              if (bullet.isPlayerBullet === true) {
                this.killcount.player++;
                this.point++;
              }
              this.explosionPool.spawn({ x: tank.x, y: tank.y, maxRadius: 36 });
              deathSFXPool.playSpatial(tank.y, this.camera.y);
            }
          }
          break;
        }
      }
      for (const team of ["blue", "red"]) {
        const base = this.basePos[team];
        if (bullet.team !== team) {
          const dx = bullet.x - base.x;
          const dy = bullet.y - base.y;
          const distSq = dx * dx + dy * dy;
          const baseRadius = 40;
          if (
            distSq <=
            (bullet.radius + baseRadius) * (bullet.radius + baseRadius)
          ) {
            this.baseHealth[team] -= bullet.damage;
            bullet.active = false;
          }
        }
      }
      for (const stronghold of this.strongholds) {
        if (stronghold.hp <= 0) continue;
        if (stronghold.owner === bullet.team) continue;
        const dx = bullet.x - stronghold.x;
        const dy = bullet.y - stronghold.y;
        const distSq = dx * dx + dy * dy;
        const strongholdRadius = 36;
        if (
          distSq <=
          (bullet.radius + strongholdRadius) *
            (bullet.radius + strongholdRadius)
        ) {
          stronghold.hp -= bullet.damage;
          bullet.active = false;
          if (stronghold.hp <= 0) {
            // Capture all strongholds at the same Y position
            for (const s of this.strongholds) {
              if (s.y === stronghold.y) {
                s.owner = bullet.team;
                s.isCapturing = true;
                s.hp = -1;
                this.turrets = this.turrets.filter(
                  (t) => !(t.x === s.x && t.y === s.y),
                );
                // isTurret 플래그가 true인 강점만 포탑 생성
                if (s.isTurret) {
                  this.turrets.push(
                    new Turret(s.x, s.y, s.owner, 75),
                  );
                }
                // Restore stronghold after 0.05 seconds
                setTimeout(() => {
                  s.hp = 4e3;
                  s.isCapturing = false;
                }, 50);
              }
            }
          }
        }
      }
    }
    for (let i = 0; i < this.tanks.length; i++) {
      const a = this.tanks[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < this.tanks.length; j++) {
        const b = this.tanks[j];
        if (b.hp <= 0) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius + 4;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.01;
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x += nx * (overlap * 0.5);
          a.y += ny * (overlap * 0.5);
          b.x -= nx * (overlap * 0.5);
          b.y -= ny * (overlap * 0.5);
        }
      }
    }
  }
  /**
   * 팀에 맞는 스폰 지점 계산
   * - 소유한 거점이 없으면 본진으로
   * - 있으면 적 본진과의 거리 기준으로 가장 전방 거점 선택
   */
  getSpawnPoints(team) {
    const enemyBaseY = this.basePos[team === "blue" ? "red" : "blue"].y;
    const owned = this.strongholds.filter((s) => s.owner === team);
    if (owned.length === 0) {
      return [{ x: this.basePos[team].x, y: this.basePos[team].y }];
    }
    owned.sort(
      (a, b) => Math.abs(a.y - enemyBaseY) - Math.abs(b.y - enemyBaseY),
    );
    const frontline = owned[0];
    const baseY = this.basePos[team].y;
    const enemyStrongholds = this.strongholds.filter((s) => s.owner !== team);
    let behind = [];
    if (team === "blue") {
      behind = enemyStrongholds.filter((s) => s.y > baseY && s.y < frontline.y);
    } else {
      behind = enemyStrongholds.filter((s) => s.y < baseY && s.y > frontline.y);
    }
    if (behind.length > 0) {
      // spawn at rearmost owned stronghold (closest to base), split if multiple at same Y
      owned.sort((a, b) => Math.abs(a.y - baseY) - Math.abs(b.y - baseY));
      const rearmost = owned[0];
      // Get all strongholds at the same Y position
      const spawnPoints = owned.filter((s) => s.y === rearmost.y);
      return spawnPoints;
    } else {
      // Get all strongholds at frontline Y position for division
      const frontlinePoints = owned.filter((s) => s.y === frontline.y);
      return frontlinePoints;
    }
  }
  /**
   * 웨이브 스폰
   * - 팀별 생존 수를 확인하고 부족하면 가까운 스폰 지점에 새 탱크 생성
   * - 필요 시 에이스 탱크도 제한 수까지 투입
   */
  spawnWave() {
    const blueAlive = this.tanks.filter(
      (t) => t.team === "blue" && t.hp > 0,
    ).length;
    const redAlive = this.tanks.filter(
      (t) => t.team === "red" && t.hp > 0,
    ).length;
    const spawnCount = 3 + Math.floor(Math.random() * 2);
    if (blueAlive < this.maxTanksPerTeam) {
      const toSpawn = Math.min(spawnCount, this.maxTanksPerTeam - blueAlive);
      const spawnPoints = this.getSpawnPoints("blue");
      for (let i = 0; i < toSpawn; i++) {
        const spawn = spawnPoints[i % spawnPoints.length];
        const x = spawn.x + (Math.random() - 0.5) * 120;
        const y = spawn.y + (Math.random() - 0.5) * 60;
        this.addTank(new Tank(x, y, "blue", false));
        const stronghold = this.strongholds.find(
          (s) => s.owner === "blue" && s.x === spawn.x && s.y === spawn.y,
        );
        if (stronghold) {
          stronghold.hp = clamp(stronghold.hp + 5, 0, 4e3);
        } else {
          this.baseHealth.blue = clamp(
            this.baseHealth.blue + 5,
            0,
            this.defaultBaseHealth,
          );
        }
      }
    }
    if (redAlive < this.maxTanksPerTeam) {
      const toSpawn = Math.min(spawnCount, this.maxTanksPerTeam - redAlive);
      const spawnPoints = this.getSpawnPoints("red");
      for (let i = 0; i < toSpawn; i++) {
        const spawn = spawnPoints[i % spawnPoints.length];
        const x = spawn.x + (Math.random() - 0.5) * 120;
        const y = spawn.y + (Math.random() - 0.5) * 60;
        this.addTank(new Tank(x, y, "red", false));
        const stronghold = this.strongholds.find(
          (s) => s.owner === "red" && s.x === spawn.x && s.y === spawn.y,
        );
        if (stronghold) {
          stronghold.hp = clamp(stronghold.hp + 5, 0, 4e3);
        } else {
          this.baseHealth.red = clamp(
            this.baseHealth.red + 5,
            0,
            this.defaultBaseHealth,
          );
        }
      }
    }
  }
  /**
   * 월드 렌더링
   * - 배경/그리드 → 폭발/총알 → 탱크 → 본진/거점/포탑 → UI용 본진 HP바
   */
  draw() {
    const ctx = this.ctx;
    const cam = {
      x: this.camera.x + this.shakeOffsetX,
      y: this.camera.y + this.shakeOffsetY
    };
    ctx.fillStyle = "#000000ff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 200) {
      const screenX = x - cam.x;
      ctx.beginPath();
      ctx.moveTo(screenX, -cam.y);
      ctx.lineTo(screenX, this.bounds.maxY - cam.y);
      ctx.stroke();
    }
    for (let y = this.bounds.minY; y <= this.bounds.maxY; y += 200) {
      const screenY = y - cam.y;
      ctx.beginPath();
      ctx.moveTo(-cam.x, screenY);
      ctx.lineTo(this.bounds.maxX - cam.x, screenY);
      ctx.stroke();
    }
    this.explosionPool.drawAll(ctx, cam);
    this.bulletPool.drawAll(ctx, cam);
    for (const tank of this.tanks) {
      tank.draw(ctx, cam);
    }
    for (const team of ["blue", "red"]) {
      const base = this.basePos[team];
      const screenX = base.x - cam.x;
      const screenY = base.y - cam.y;
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor =
        team === "blue"
          ? "rgba(92, 179, 255, 0.8)"
          : "rgba(255, 106, 106, 0.8)";
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const baseSize = 80;
      ctx.rect(
        screenX - baseSize / 2,
        screenY - baseSize / 2,
        baseSize,
        baseSize,
      );
      ctx.fillStyle = team === "blue" ? "#5cb3ff" : "#ff6a6a";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("BASE", screenX, screenY - 48);
      ctx.restore();
    }
    for (const stronghold of this.strongholds) {
      const screenX = stronghold.x - cam.x;
      const screenY = stronghold.y - cam.y;
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor =
        stronghold.owner === "blue"
          ? "rgba(92, 179, 255, 0.8)"
          : stronghold.owner === "red"
            ? "rgba(255, 106, 106, 0.8)"
            : "rgba(170, 170, 170, 0.8)";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const strongholdSize = 72;
      ctx.rect(
        screenX - strongholdSize / 2,
        screenY - strongholdSize / 2,
        strongholdSize,
        strongholdSize,
      );
      ctx.fillStyle =
        stronghold.owner === "blue"
          ? "#5cb3ff"
          : stronghold.owner === "red"
            ? "#ff6a6a"
            : "#aaa";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(
        stronghold.owner
          ? `${stronghold.owner.toUpperCase()} Stronghold`
          : "Neutral Stronghold",
        screenX,
        screenY - 44,
      );
      ctx.fillStyle = "#000";
      ctx.fillRect(screenX - 36, screenY + 44, 72, 6);
      ctx.fillStyle =
        stronghold.owner === "blue"
          ? "#5cb3ff"
          : stronghold.owner === "red"
            ? "#ff6a6a"
            : "#aaa";
      ctx.fillRect(
        screenX - 36,
        screenY + 44,
        72 * clamp(stronghold.hp / 4e3, 0, 1),
        6,
      );
      ctx.restore();
    }
    for (const turret of this.turrets) {
      turret.draw(ctx, cam);
    }
    ctx.restore();
    ctx.save();
    const minimapWidth = 100;
    const minimapHeight = 400;
    const margin = 16;
    const mapMinX = this.bounds.minX;
    const mapMaxX = this.bounds.maxX;
    const mapMinY = this.bounds.minY;
    const mapMaxY = this.bounds.maxY;
    const minimapX = ctx.canvas.width - minimapWidth - margin;
    const minimapY = ctx.canvas.height - minimapHeight - margin;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#222";
    ctx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(minimapX, minimapY, minimapWidth, minimapHeight);
    const scaleX = minimapWidth / (mapMaxX - mapMinX);
    const scaleY = minimapHeight / (mapMaxY - mapMinY);
    function toMinimap(x, y) {
      return {
        x: minimapX + (x - mapMinX) * scaleX,
        y: minimapY + (y - mapMinY) * scaleY,
      };
    }
    for (const team of ["blue", "red"]) {
      const base = this.basePos[team];
      const pos = toMinimap(base.x, base.y);
      ctx.beginPath();
      const baseSize = 20;
      ctx.rect(
        pos.x - baseSize / 2,
        pos.y - baseSize / 2,
        baseSize,
        baseSize,
      );
      ctx.fillStyle = team === "blue" ? "#5cb3ff" : "#ff6a6a";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const stronghold of this.strongholds) {
      const pos = toMinimap(stronghold.x, stronghold.y);
      ctx.beginPath();
      const strongholdSize = 16;
      ctx.rect(
        pos.x - strongholdSize / 2,
        pos.y - strongholdSize / 2,
        strongholdSize,
        strongholdSize,
      );
      if (stronghold.owner === "blue") {
        ctx.fillStyle = "#5cb3ff";
      } else if (stronghold.owner === "red") {
        ctx.fillStyle = "#ff6a6a";
      } else {
        ctx.fillStyle = "#aaa";
      }
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      const pos = toMinimap(tank.x, tank.y);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, tank.isPlayer ? 4 : 3, 0, Math.PI * 2);
      if (tank.isPlayer) {
        ctx.fillStyle = "#ffe600";
      } else if (tank.team === "blue") {
        ctx.fillStyle = "#5cb3ff";
      } else {
        ctx.fillStyle = "#ff6a6a";
      }
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (this.pendingExplosion) {
      const screenX = this.pendingExplosion.x - this.camera.x;
      const screenY = this.pendingExplosion.y - this.camera.y;
      ctx.save();
      const totalTime = this.isSuperMode ? 1 : 5;
      const progress = this.pendingExplosion.triggered
        ? 1
        : 1 - this.pendingExplosion.timer / totalTime;
      const fadeOutAlpha = this.pendingExplosion.triggered
        ? Math.max(0, this.pendingExplosion.fadeTimer / 1)
        : 1;
      ctx.globalAlpha = Math.min(progress, fadeOutAlpha);
      ctx.shadowBlur = 25;
      ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
      const rotation = Math.PI * 2 * progress;
      ctx.translate(screenX, screenY);
      ctx.rotate(rotation);
      const startRadius = 260;
      const endRadius = 50;
      const radius = startRadius - (startRadius - endRadius) * progress;
      const lineLength = 40;
      const lineWidth = 10;
      ctx.strokeStyle = "white";
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      const directions = [
        [0, -radius],
        // 위
        [0, radius],
        // 아래
        [-radius, 0],
        // 왼쪽
        [radius, 0],
        // 오른쪽
      ];
      for (const [x, y] of directions) {
        const nx = x === 0 ? 0 : Math.sign(x);
        const ny = y === 0 ? 0 : Math.sign(y);
        const lx = x - (nx * lineLength) / 2;
        const ly = y - (ny * lineLength) / 2;
        const rx = x + (nx * lineLength) / 2;
        const ry = y + (ny * lineLength) / 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }
    ctx.restore();
  }
  /**
   * Turret 포탄 전용 소규모 폭발
   * - 포탄이 탱크에 충돌했을 때 발생
   * - 반경 100~110의 소규모 폭발
   * - 폭발 범위 내 탱크에 피해(25~50) 및 넉백(500~600) 적용
   */
  causeTurretOrbitalStrike(x, y, bulletTeam, baseDamage) {
    const strikeRadius = 105; // 반경 100~110의 중간값
    this.explosionPool.spawn({ x, y, maxRadius: 80 }); // 작은 폭발 이펙트
    deathSFXPool.playSpatial(y, this.camera.y, 0.6); // 사운드 재생
    
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      
      const dx = tank.x - x;
      const dy = tank.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < strikeRadius) {
        // 거리에 따른 피해 계산 (최소 25, 최대 50)
        const damageRatio = 1 - (dist / strikeRadius);
        const damage = 25 + (50 - 25) * damageRatio;
        tank.hp -= damage;
        if (tank.isPlayer) {
          this.triggerShake(damage);
        }
        
        // 넉백 적용 (push force 500~600)
        if (tank.hp > 0 || dist < strikeRadius) {
          const pushForce = 550;
          const angle = Math.atan2(dy, dx);
          tank.vx += Math.cos(angle) * pushForce;
          tank.vy += Math.sin(angle) * pushForce;
        }
        
        // 탱크 파괴 시 처리
        if (tank.hp <= 0) {
          this.explosionPool.spawn({ x: tank.x, y: tank.y, maxRadius: 36 });
          deathSFXPool.playSpatial(tank.y, this.camera.y, 1);
          this.killcount[bulletTeam]++;
          this.baseHealth[tank.team] -= 5;
        }
      }
    }
  }
  /**
   * 대형 특수 폭발 생성
   * - 지정 좌표에 다중 폭발을 일으켜 광역 피해/연출 처리
   */
  causeSpecialExplosion(x, y) {
    this.explosionPool.spawn({ x, y, maxRadius: 250 });
    deathSFXPool.playSpatial(y, this.camera.y, 1);
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      const dx = tank.x - x;
      const dy = tank.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 250) {
        const damage = Math.max(50, 200 * (1 - dist / 250));
        tank.hp -= damage;
        if (tank.isPlayer) {
          this.triggerShake(damage);
        }
        if (tank.hp > 0) {
          const push = 1500;
          const angle = Math.atan2(dy, dx);
          tank.vx += Math.cos(angle) * push;
          tank.vy += Math.sin(angle) * push;
        }
        if (tank.hp <= 0) {
          this.explosionPool.spawn({ x: tank.x, y: tank.y, maxRadius: 36 });
          deathSFXPool.playSpatial(tank.y, this.camera.y, 1, 2500);
          if (tank.team === "red") {
            this.killcount.player++;
            this.killcount.blue++;
            this.point++;
          }
          this.baseHealth[tank.team] -= 5;
        }
      }
    }
  }
}

// utils/AudioPool.js
export class AudioPool {
  /**
   * @param {string[]} srcList 오디오 파일 경로 목록
   * @param {number} [size=50] 풀 크기(동시 재생 최대 수에 영향)
   */
  constructor(srcList, size = 50) {
    this.pool = [];
    for (let i = 0; i < size; i++) {
      const src = srcList[i % srcList.length];
      const audio = new Audio(src);
      audio.preload = "auto";
      this.pool.push(audio);
    }
  }
  /**
   * 공간 오디오 재생(단순 볼륨 감쇠)
   * - 이벤트 Y와 카메라 Y의 차이를 거리로 보고, 거리에 비례해 볼륨을 줄임
   *
   * @param {number} originY 사운드 발생 지점의 Y 좌표
   * @param {number} cameraY 현재 카메라의 Y 좌표
   * @param {number} [baseVolume=0.2] 기본 볼륨(0~1)
   * @param {number} [maxDistance=1200] 이 거리에서 볼륨이 0이 되도록 감쇠
   */
  playSpatial(originY, cameraY, baseVolume = 0.2, maxDistance = 1200) {
    const distance2 = Math.abs(originY - cameraY);
    let volume = baseVolume * (1 - Math.min(distance2 / maxDistance, 1));
    volume = Math.max(0, Math.min(volume, 1));
    for (const audio of this.pool) {
      if (audio.paused || audio.ended) {
        audio.currentTime = 0;
        audio.volume = volume;
        audio.play();
        return;
      }
    }
    this.pool[0].currentTime = 0;
    this.pool[0].volume = volume;
    this.pool[0].play();
  }
}

// utils/pool.js
export class Pool {
  /**
   * @param {() => any} factory 객체를 생성하는 팩토리 함수
   * @param {number} size 초기 풀 크기(미리 생성할 개수)
   */
  constructor(factory, size) {
    this.pool = [];
    this.factory = factory;
    for (let i = 0; i < size; i++) {
      this.pool.push(factory());
    }
  }
  /**
   * 객체를 활성화(스폰)하여 반환
   * - 비활성 객체를 찾아 init(props)로 초기화하고 반환
   * - 전부 사용 중이면 새로 생성하여 풀에 추가(경고 로그 출력)
   * @param {object} props init에 전달할 초기화 데이터
   * @returns {any} 활성화된 객체
   */
  spawn(props) {
    for (const obj2 of this.pool) {
      if (!obj2.active) {
        obj2.init(props);
        return obj2;
      }
    }
    const obj = this.factory();
    obj.init(props);
    this.pool.push(obj);
    console.warn("Pool exhausted, creating new object.");
    return obj;
  }
  /**
   * 풀 내 활성 객체들을 일괄 업데이트
   * @param {number} dt 델타 타임(초)
   * @param  {...any} args 추가 인자(월드/입력 등)
   */
  updateAll(dt, ...args) {
    for (const obj of this.pool) {
      if (obj.active) {
        obj.update(dt, ...args);
      }
    }
  }
  /**
   * 풀 내 활성 객체들을 일괄 드로우
   * @param {CanvasRenderingContext2D} ctx 캔버스 컨텍스트
   * @param  {...any} args 추가 인자(카메라 등)
   */
  drawAll(ctx, ...args) {
    for (const obj of this.pool) {
      if (obj.active) {
        obj.draw(ctx, ...args);
      }
    }
  }
  /**
   * Deactivate all objects in the pool (used for resetting pools between games)
   */
  reset() {
    for (const obj of this.pool) {
      obj.active = false;
    }
  }
}
