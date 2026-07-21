// systems.js
import { Bullet, Explosion, Tank, Turret } from './entities.js';
import { clamp, distance, getLeadAngle } from './math.js';
import { calculateSpatialVolume, circlesOverlap } from './runtime.js';
import { DEFAULT_WEAPON_ID, resolveWeaponProfile } from './weapon-config.js';

// utils/math.js
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
};

const PASSIVE_POINT_INTERVAL = 5;
const DEPLOYABLE_WALL = Object.freeze({
  cooldown: 60,
  width: 180,
  thickness: 10,
  maxHp: 5000,
  decayPerSecond: 100,
});

export function getPlayerScreenY(
  viewportHeight,
  verticalBias,
  bottomHudReserve,
  clearance = 32,
) {
  const desiredY = viewportHeight / 2 + verticalBias;
  const highestSafeY = viewportHeight - Math.max(0, bottomHudReserve) - clearance;
  return Math.max(clearance, Math.min(desiredY, highestSafeY));
}

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
    if (s.targetable === false) continue;
    const isAlive = s.hp > 0 && s.isCapturing !== true;
    const isNotOwned = s.owner !== tank.team;
    const distToStronghold = distance(s, tank);
    const inRange = distToStronghold <= AI_CONSTANTS.ENGAGE_RANGE;
    if (isAlive && isNotOwned && inRange) {
      targetsInRange.push(s);
    }
  }
  
  if (world.mode === "frontline") {
    let enemyBaseTeam = "blue";
    if (tank.team === "blue") enemyBaseTeam = "red";
    const enemyBase = world.basePos[enemyBaseTeam];
    const distToBase = distance(enemyBase, tank);
    if (distToBase <= AI_CONSTANTS.ENGAGE_RANGE) {
      targetsInRange.push({
        x: enemyBase.x,
        y: enemyBase.y,
        isBase: true,
        vx: 0,
        vy: 0,
      });
    }
  } else if (
    world.mode === "siege" &&
    tank.team === world.level.attackerTeam &&
    world.getActiveDefenseLine()?.objectiveType === "base"
  ) {
    const enemyBase = world.basePos[world.level.defenderTeam];
    if (distance(enemyBase, tank) <= AI_CONSTANTS.ENGAGE_RANGE) {
      targetsInRange.push({ ...enemyBase, isBase: true, vx: 0, vy: 0 });
    }
  }
  
  return targetsInRange;
}

export function selectStrategicTarget(tank, world) {
  let candidates = [];
  if (world.mode === "siege") {
    if (tank.team === world.level.attackerTeam) {
      const activeLine = world.getActiveDefenseLine();
      if (activeLine?.objectiveType === "base") {
        candidates = [world.basePos[world.level.defenderTeam]];
      } else if (activeLine) {
        candidates = world.strongholds.filter(
          (stronghold) => stronghold.lineId === activeLine.id && !stronghold.destroyed,
        );
      }
    } else {
      candidates = world.strongholds.filter((stronghold) => stronghold.role === "spawn");
    }
  } else if (world.mode === "frontline") {
    candidates = world.strongholds.filter(
      (stronghold) => stronghold.owner !== tank.team && stronghold.hp > 0,
    );
    if (candidates.length === 0) {
      candidates = [world.basePos[tank.team === "blue" ? "red" : "blue"]];
    }
  } else if (world.mode === "attrition") {
    candidates = [world.basePos[tank.team === "blue" ? "red" : "blue"]];
  }
  let nearest = null;
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    const hasPassedCandidate =
      tank.team === "blue" ? tank.y < candidate.y : tank.y > candidate.y;
    if (!hasPassedCandidate) continue;

    const candidateDistance = distance(tank, candidate);
    if (candidateDistance < nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
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
  const strategicTarget = nearest ?? selectStrategicTarget(tank, world);
  
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
    if (strategicTarget) {
      // Chase mode: move toward target
      const dx = strategicTarget.x - tank.x;
      const dy = strategicTarget.y - tank.y;
      const chaseAngle = Math.atan2(dy, dx);
      tank.angle = chaseAngle;
      
      const cosChaseAngle = Math.cos(chaseAngle);
      const sinChaseAngle = Math.sin(chaseAngle);
      
      moveX = cosChaseAngle * moveSpeed;
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
      tank.turretAngle = getLeadAngle(
        tank,
        nearest,
        tank.weapon.aiLeadSpeed,
      );
    } else {
      // It's a structure, aim directly
      tank.turretAngle = Math.atan2(nearest.y - tank.y, nearest.x - tank.x);
    }
    
    const fireRange = tank.weapon.fireRange;
    const canFire = distance(nearest, tank) < fireRange;
    if (canFire) {
      tank.tryShoot(world);
    }
  }
}

// core/World.js
export class World {
  constructor(canvas, isSuperMode, isSpectatorMode, resources, levelDefinition = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.level = levelDefinition ?? {
      id: "frontline",
      mode: "frontline",
      playerTeam: "blue",
      mapDefinition: { worldHeight: 5000 },
    };
    this.mode = this.level.mode;
    this.weaponId = this.level.weapon ?? DEFAULT_WEAPON_ID;
    this.weapon = resolveWeaponProfile(this.weaponId);
    this.bounds = {
      minX: 0,
      maxX: canvas.width,
      minY: 0,
      maxY: this.level.mapDefinition.worldHeight ?? 5e3,
    };
    this.camera = { x: 0, y: 0 };
    this.bottomHudReserve = 110;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.tanks = [];
    this.ready = false;
    if (!resources?.bulletPool || !resources?.explosionPool || !resources?.audio) {
      throw new Error("World requires bullet, explosion, and audio resources");
    }
    this.bulletPool = resources.bulletPool;
    this.explosionPool = resources.explosionPool;
    this.audio = resources.audio;
    for (const bullet of this.bulletPool.pool) {
      if (Bullet.spriteCache.red) bullet.sprite = Bullet.spriteCache.red;
    }
    for (const explosion of this.explosionPool.pool) {
      if (Explosion.sprite) explosion.sprite = Explosion.sprite;
    }
    this.spawnTimer = 0;
    this.spawnInterval = 2;
    this.maxTanksPerTeam = 36;
    this.spawnTimers = { blue: 0, red: 0 };
    this.spawnedWaves = { blue: 0, red: 0 };
    this.teamRules = this.level.teams ?? {
      blue: { maxTanks: this.maxTanksPerTeam, spawnInterval: this.spawnInterval },
      red: { maxTanks: this.maxTanksPerTeam, spawnInterval: this.spawnInterval },
    };
    this.isSuperMode = isSuperMode;
    this.isSpectatorMode = isSpectatorMode;
    this.point = this.isSuperMode || this.isSpectatorMode ? 9999 : 10;
    this.itemPointCost = 5;
    this.passivePointTimer = 0;
    this.deployableWall = null;
    this.deployableWallCooldown = 0;
    this.deployableWallSequence = 0;
    this.deployableWallRules = DEPLOYABLE_WALL;
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
        x: canvas.width * 0.25,
        y: this.bounds.maxY * 0.25,
        hp: 4e3,
        owner: "red",
        isTurret: true,
      },
      {
        x: canvas.width * 0.75,
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
      //=========================================
      // 아군 쌍둥이 거점
      //-----------------------------------------
      {
        x: canvas.width * 0.25,
        y: this.bounds.maxY * 0.75,
        hp: 4e3,
        owner: "blue",
        isTurret: true,
      },
      {
        x: canvas.width * 0.75,
        y: this.bounds.maxY * 0.75,
        hp: 4e3,
        owner: "blue",
        isTurret: true,
      },
    ];
    for (const stronghold of this.strongholds) {
      stronghold.captureTimer = 0;
      stronghold.isStronghold = true;
    }
    this.turrets = [];
    this.turrets.push(
      new Turret(this.basePos.blue.x, this.basePos.blue.y, "blue", 100, 0.3),
    );
    this.turrets.push(
      new Turret(this.basePos.red.x, this.basePos.red.y, "red", 100, 0.3),
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
    this.remainingTime = this.level.mapDefinition.timeLimit ?? null;
    this.winner = null;
    this.gameOverMessage = "";
    this.gameOverTarget = null;
    if (this.mode === "siege") this.configureSiege();
    if (this.mode === "attrition") this.configureAttrition();
  }
  configureAttrition() {
    this.strongholds = [];
    this.turrets = [];
    this.remainingTime = null;
  }
  chooseSpawnWeapon(random = Math.random) {
    const distribution = this.level.weaponDistribution;
    if (this.mode !== "attrition" || !distribution?.length) return this.weaponId;
    const totalWeight = distribution.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * totalWeight;
    for (const entry of distribution) {
      roll -= entry.weight;
      if (roll < 0) return entry.id;
    }
    return distribution.at(-1).id;
  }
  configureSiege() {
    const map = this.level.mapDefinition;
    const attacker = this.level.attackerTeam;
    const defender = this.level.defenderTeam;
    const toWorldX = (value) => value * this.canvas.width;
    const toWorldY = (value) => value * this.bounds.maxY;
    const orientY = (value) => toWorldY(defender === "blue" ? 1 - value : value);
    const attackerSpawnY = attacker === "blue"
      ? toWorldY(map.attackerSpawn.y)
      : toWorldY(1 - map.attackerSpawn.y);
    this.basePos = {
      blue: { x: toWorldX(0.5), y: toWorldY(0.93) },
      red: { x: toWorldX(0.5), y: toWorldY(0.07) },
    };
    const attackerSpawns = map.attackerSpawn.xs.map((x, index) => ({
      id: `attacker_spawn_${index + 1}`,
      role: "spawn",
      isStronghold: true,
      x: toWorldX(x),
      y: attackerSpawnY,
      hp: 4e3,
      maxHp: 4e3,
      owner: attacker,
      targetable: false,
      isTurret: false,
      captureTimer: 0,
    }));
    this.defenseLines = map.defenseLines.map((line, index) => ({
      id: line.id,
      objectiveType: line.objectiveType,
      objectiveY: orientY(line.objectiveY),
      hp: line.hp,
      active: index === 0,
      destroyed: false,
      wall: {
        id: line.id,
        y: orientY(line.wallY),
        thickness: map.wallThickness,
        hp: map.wallHp,
        maxHp: map.wallHp,
        active: true,
      },
    }));
    const defenseStrongholds = this.defenseLines
      .filter((line) => line.objectiveType === "stronghold")
      .flatMap((line) => map.strongholdXs.map((x, index) => ({
          id: `${line.id}_${index + 1}`,
          lineId: line.id,
          role: "defense",
          isStronghold: true,
          x: toWorldX(x),
          y: line.objectiveY,
          hp: line.hp,
          maxHp: line.hp,
          owner: defender,
          targetable: line.active,
          destroyed: false,
          isTurret: true,
          captureTimer: 0,
        })));
    this.strongholds = [...attackerSpawns, ...defenseStrongholds];
    const finalDefenseLine = this.defenseLines[this.defenseLines.length - 1];
    this.baseHealth[defender] = finalDefenseLine.hp;
    this.defaultBaseHealth = finalDefenseLine.hp;
    this.activeDefenseLineIndex = 0;
    this.turrets = this.strongholds
      .filter((stronghold) => stronghold.isTurret)
      .map((stronghold) =>
        new Turret(stronghold.x, stronghold.y, stronghold.owner, 75, 1.5),
      );
    this.turrets.push(
      new Turret(this.basePos[defender].x, this.basePos[defender].y, defender, 100, 0.3),
    );
  }
  updateTankAI(tank, dt) {
    handleTankAI(tank, dt, this);
  }
  playSpatialAudio(channel, originY, baseVolume, maxDistance) {
    const audioPool = this.audio[channel];
    if (!audioPool) return;
    const listenerY = this.camera.y + this.canvas.height / 2;
    audioPool.playSpatial(originY, listenerY, baseVolume, maxDistance);
  }
  resize(width) {
    const previousWidth = this.bounds.maxX;
    if (!previousWidth || previousWidth === width) return;
    const scaleX = width / previousWidth;
    this.bounds.maxX = width;
    for (const base of Object.values(this.basePos)) base.x *= scaleX;
    for (const stronghold of this.strongholds) stronghold.x *= scaleX;
    for (const turret of this.turrets) turret.x *= scaleX;
    if (this.deployableWall) this.deployableWall.x *= scaleX;
    this.camera.x = clamp(this.camera.x, this.bounds.minX, Math.max(0, width - this.canvas.width));
  }
  /**
   * 탱크를 월드에 등록
   */
  addTank(tank) {
    tank.setWeapon(this.weaponId);
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
    this.updatePassivePoints(dt);
    this.updateDeployableWall(dt);
    this.updateSpawning(dt);
    for (const tank of this.tanks) {
      const previousY = tank.y;
      tank.update(dt, this, input);
      this.resolveWallCollisions(tank, previousY);
    }
    this.bulletPool.updateAll(dt);
    this.explosionPool.updateAll(dt);
    this.handleCollisions();
    for (const tank of this.tanks) {
      this.resolveWallCollisions(tank, tank.y);
    }
    this.updateStrongholds(dt);
    this.removeDestroyedAITanks();
    const player = this.tanks.find((t) => t.isPlayer);
    if (player && !input.keys[" "]) {
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      this.camera.x = clamp(
        player.x - cw / 2,
        this.bounds.minX,
        this.bounds.maxX - cw,
      );
      const verticalBias = Math.min(200, ch * 0.25);
      const bottomHudReserve = Math.min(this.bottomHudReserve, ch * 0.45);
      const playerScreenY = getPlayerScreenY(
        ch,
        verticalBias,
        bottomHudReserve,
      );
      this.camera.y = clamp(
        player.y - playerScreenY,
        this.bounds.minY,
        Math.max(this.bounds.minY, this.bounds.maxY - ch + bottomHudReserve),
      );
    }
    if (this.mode === "siege") {
      this.remainingTime = Math.max(0, this.remainingTime - dt);
      if (this.remainingTime <= 0 && !this.gameOver) {
        this.finishGame(this.level.defenderTeam, "Defense held until time expired!");
      }
    } else if (this.baseHealth.blue <= 0 || this.baseHealth.red <= 0) {
      this.gameOver = true;
      this.winner = this.baseHealth.blue <= 0 ? "red" : "blue";
      this.gameOverMessage = `${this.winner.toUpperCase()} TEAM WINS`;
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
  updatePassivePoints(dt) {
    if (this.isSuperMode || this.isSpectatorMode || this.gameOver) return;
    this.passivePointTimer += dt;
    while (this.passivePointTimer >= PASSIVE_POINT_INTERVAL) {
      this.point += 1;
      this.passivePointTimer -= PASSIVE_POINT_INTERVAL;
    }
  }
  getAliveTankCount(team) {
    return this.tanks.reduce(
      (count, tank) => count + Number(tank.team === team && tank.hp > 0),
      0,
    );
  }
  chargeTankLoss(tank, amount = 5) {
    if (tank.isPlayer) return;
    this.baseHealth[tank.team] -= amount;
  }
  getDeployableWallPlacement(x, y) {
    const rules = this.deployableWallRules;
    if (this.gameOver) return { ok: false, reason: "Match ended" };
    if (this.deployableWall?.active) return { ok: false, reason: "Barrier active" };
    if (this.deployableWallCooldown > 0) return { ok: false, reason: "Barrier cooling down" };
    if (this.point < this.itemPointCost) {
      return { ok: false, reason: `Need ${this.itemPointCost} points` };
    }

    const halfWidth = rules.width / 2;
    const halfThickness = rules.thickness / 2;
    if (
      x - halfWidth < this.bounds.minX ||
      x + halfWidth > this.bounds.maxX ||
      y - halfThickness < this.bounds.minY ||
      y + halfThickness > this.bounds.maxY
    ) {
      return { ok: false, reason: "Outside battlefield" };
    }

    const overlapsObjective = [
      ...Object.values(this.basePos),
      ...this.strongholds.filter((stronghold) => !stronghold.destroyed),
    ].some((objective) =>
      Math.abs(objective.x - x) <= halfWidth + 48 &&
      Math.abs(objective.y - y) <= halfThickness + 48,
    );
    if (overlapsObjective) return { ok: false, reason: "Objective too close" };

    const overlapsDefenseWall = (this.defenseLines ?? []).some((line) =>
      line.wall?.active &&
      Math.abs(line.wall.y - y) <= (line.wall.thickness + rules.thickness) / 2 + 12,
    );
    if (overlapsDefenseWall) return { ok: false, reason: "Defense wall too close" };

    const overlapsTank = this.tanks.some((tank) =>
      tank.hp > 0 &&
      Math.abs(tank.x - x) <= halfWidth + tank.radius &&
      Math.abs(tank.y - y) <= halfThickness + tank.radius,
    );
    if (overlapsTank) return { ok: false, reason: "Tank in placement area" };
    return { ok: true, reason: "Ready" };
  }
  placeDeployableWall(x, y, owner = "blue") {
    const placement = this.getDeployableWallPlacement(x, y);
    if (!placement.ok) return placement;
    const rules = this.deployableWallRules;
    this.deployableWallSequence += 1;
    this.deployableWall = {
      id: `deployable_${this.deployableWallSequence}`,
      x,
      y,
      width: rules.width,
      thickness: rules.thickness,
      hp: rules.maxHp,
      maxHp: rules.maxHp,
      owner,
      active: true,
    };
    this.commitItemUse();
    this.deployableWallCooldown = rules.cooldown;
    return { ok: true, reason: "Barrier deployed", wall: this.deployableWall };
  }
  updateDeployableWall(dt) {
    this.deployableWallCooldown = Math.max(0, this.deployableWallCooldown - dt);
    const wall = this.deployableWall;
    if (!wall?.active) return;
    wall.hp = Math.max(0, wall.hp - this.deployableWallRules.decayPerSecond * dt);
    if (wall.hp <= 0) wall.active = false;
  }
  commitItemUse() {
    if (this.point < this.itemPointCost) return false;
    this.point -= this.itemPointCost;
    this.itemPointCost += 1;
    return true;
  }
  updateSpawning(dt) {
    for (const team of ["blue", "red"]) {
      this.spawnTimers[team] += dt;
      const interval = this.teamRules[team].spawnInterval;
      if (this.spawnTimers[team] >= interval) {
        const spawned = this.spawnWave(team);
        this.spawnTimers[team] = spawned
          ? this.spawnTimers[team] % interval
          : interval;
      }
    }
  }
  resolveWallCollisions(tank, previousY) {
    if (tank.hp <= 0) return;
    for (const line of this.defenseLines ?? []) {
      const wall = line.wall;
      if (!wall?.active) continue;
      this.resolveTankAgainstWall(tank, previousY, {
        ...wall,
        x: this.bounds.maxX / 2,
        width: this.bounds.maxX - this.bounds.minX,
      });
    }
    if (this.deployableWall?.active) {
      this.resolveTankAgainstWall(tank, previousY, this.deployableWall);
    }
  }
  resolveTankAgainstWall(tank, previousY, wall) {
    const halfWidth = wall.width / 2;
    const isPastLeftEnd = tank.x + tank.radius <= wall.x - halfWidth;
    const isPastRightEnd = tank.x - tank.radius >= wall.x + halfWidth;
    if (isPastLeftEnd || isPastRightEnd) {
      delete tank.wallSides[wall.id];
      return;
    }
    const upperEdge = wall.y - wall.thickness / 2 - tank.radius;
    const lowerEdge = wall.y + wall.thickness / 2 + tank.radius;
    const side = tank.wallSides[wall.id] ?? (previousY < wall.y ? -1 : 1);
    tank.wallSides[wall.id] = side;
    if (side < 0 && tank.y > upperEdge) {
      tank.y = upperEdge;
      tank.vy = Math.min(0, tank.vy);
    } else if (side > 0 && tank.y < lowerEdge) {
      tank.y = lowerEdge;
      tank.vy = Math.max(0, tank.vy);
    }
  }
  finishGame(winner, message, target = null) {
    this.gameOver = true;
    this.winner = winner;
    this.gameOverMessage = message;
    this.gameOverTarget = target;
  }
  getActiveDefenseLine() {
    return this.defenseLines?.[this.activeDefenseLineIndex] ?? null;
  }
  updateStrongholds(dt) {
    for (const stronghold of this.strongholds) {
      if (!stronghold.isCapturing) continue;
      stronghold.captureTimer -= dt;
      if (stronghold.captureTimer <= 0) {
        stronghold.captureTimer = 0;
        stronghold.hp = 4e3;
        stronghold.isCapturing = false;
      }
    }
  }
  removeDestroyedAITanks() {
    for (let index = this.tanks.length - 1; index >= 0; index--) {
      const tank = this.tanks[index];
      if (!tank.isPlayer && tank.hp <= 0) {
        this.tanks.splice(index, 1);
      }
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
      if (this.handleBulletWallCollision(bullet)) continue;
      for (const tank of this.tanks) {
        if (tank.hp <= 0) continue;
        if (tank.team === bullet.team) continue;
        if (bullet.hitTargets.has(tank)) continue;
        if (this.bulletSegmentIntersectsCircle(bullet, tank)) {
          bullet.hitTargets.add(tank);
          // Turret 특수 포탄: 충돌 시 소규모 Orbital Strike 발생
          if (bullet.explosion) {
            this.causeWeaponExplosion(
              bullet.x,
              bullet.y,
              bullet.team,
              bullet.explosion,
              bullet.isPlayerBullet,
            );
            bullet.active = false;
          } else if (bullet.isTurretSpecial) {
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
              this.playSpatialAudio("hit", tank.y, 1);
            }
            if (tank.hp <= 0) {
              this.killcount[bullet.team]++;
              this.chargeTankLoss(tank);
              if (bullet.isPlayerBullet === true) {
                this.killcount.player++;
                this.point++;
              }
              this.explosionPool.spawn({ x: tank.x, y: tank.y, maxRadius: 36 });
              this.playSpatialAudio("death", tank.y);
            }
          }
          break;
        }
      }
      if (!bullet.active) continue;
      if (this.mode === "siege") {
        const activeLine = this.getActiveDefenseLine();
        if (
          activeLine?.objectiveType === "base" &&
          bullet.team === this.level.attackerTeam
        ) {
          const base = this.basePos[this.level.defenderTeam];
          if (circlesOverlap(bullet.x, bullet.y, bullet.radius, base.x, base.y, 40)) {
            this.baseHealth[this.level.defenderTeam] -= bullet.damage;
            bullet.active = false;
            if (this.baseHealth[this.level.defenderTeam] <= 0) {
              this.completeDefenseLine(activeLine, base);
            }
          }
        }
      }
      if (!bullet.active) continue;
      for (const team of ["blue", "red"]) {
        if (this.mode !== "frontline") break;
        const base = this.basePos[team];
        if (bullet.team !== team) {
          const baseRadius = 40;
          if (circlesOverlap(bullet.x, bullet.y, bullet.radius, base.x, base.y, baseRadius)) {
            this.baseHealth[team] -= bullet.damage;
            bullet.active = false;
            break;
          }
        }
      }
      if (!bullet.active) continue;
      for (const stronghold of this.strongholds) {
        if (stronghold.targetable === false) continue;
        if (stronghold.hp <= 0) continue;
        if (stronghold.owner === bullet.team) continue;
        const strongholdRadius = 36;
        if (circlesOverlap(
          bullet.x,
          bullet.y,
          bullet.radius,
          stronghold.x,
          stronghold.y,
          strongholdRadius,
        )) {
          stronghold.hp -= bullet.damage;
          bullet.active = false;
          if (stronghold.hp <= 0) {
            if (this.mode === "siege" && stronghold.role === "defense") {
              this.destroyDefenseLine(stronghold);
              break;
            }
            // Capture all strongholds at the same Y position
            for (const s of this.strongholds) {
              if (s.y === stronghold.y) {
                s.owner = bullet.team;
                s.isCapturing = true;
                s.captureTimer = 0.05;
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
    if (this.mode === "siege") {
      if (team === this.level.attackerTeam) {
        return this.strongholds.filter((stronghold) => stronghold.role === "spawn");
      }
      const activeLine = this.getActiveDefenseLine();
      if (!activeLine || activeLine.objectiveType === "base") {
        return [{ x: this.basePos[team].x, y: this.basePos[team].y }];
      }
      const strongholds = this.strongholds.filter(
        (item) => item.lineId === activeLine.id,
      );
      return strongholds.length > 0
        ? strongholds
        : [{ x: this.basePos[team].x, y: this.basePos[team].y }];
    }
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
  spawnWave(requestedTeam = null) {
    let spawnedAny = false;
    const blueAlive = this.tanks.filter(
      (t) => t.team === "blue" && (
        t.hp > 0 || t.isPlayer
      ),
    ).length;
    const redAlive = this.tanks.filter(
      (t) => t.team === "red" && (
        t.hp > 0 || t.isPlayer
      ),
    ).length;
    const blueMax = this.teamRules.blue.maxTanks;
    const redMax = this.teamRules.red.maxTanks;
    if ((!requestedTeam || requestedTeam === "blue") && blueAlive < blueMax) {
      const toSpawn = this.getSpawnCount("blue", blueAlive);
      const spawnPoints = this.getSpawnPoints("blue");
      for (let i = 0; i < toSpawn; i++) {
        const spawn = spawnPoints[i % spawnPoints.length];
        const x = spawn.x + (Math.random() - 0.5) * 120;
        const y = spawn.y + (Math.random() - 0.5) * 60;
        const tank = new Tank(x, y, "blue", false);
        this.addTank(tank);
        if (this.mode === "attrition") tank.setWeapon(this.chooseSpawnWeapon());
        spawnedAny = true;
        if (this.mode === "frontline") {
          const stronghold = this.strongholds.find(
            (s) => s.owner === "blue" && s.x === spawn.x && s.y === spawn.y,
          );
          if (stronghold) stronghold.hp = clamp(stronghold.hp + 5, 0, 4e3);
          else this.baseHealth.blue = clamp(this.baseHealth.blue + 5, 0, this.defaultBaseHealth);
        }
      }
      if (toSpawn > 0) this.spawnedWaves.blue++;
    }
    if ((!requestedTeam || requestedTeam === "red") && redAlive < redMax) {
      const toSpawn = this.getSpawnCount("red", redAlive);
      const spawnPoints = this.getSpawnPoints("red");
      for (let i = 0; i < toSpawn; i++) {
        const spawn = spawnPoints[i % spawnPoints.length];
        const x = spawn.x + (Math.random() - 0.5) * 120;
        const y = spawn.y + (Math.random() - 0.5) * 60;
        const tank = new Tank(x, y, "red", false);
        this.addTank(tank);
        if (this.mode === "attrition") tank.setWeapon(this.chooseSpawnWeapon());
        spawnedAny = true;
        if (this.mode === "frontline") {
          const stronghold = this.strongholds.find(
            (s) => s.owner === "red" && s.x === spawn.x && s.y === spawn.y,
          );
          if (stronghold) stronghold.hp = clamp(stronghold.hp + 5, 0, 4e3);
          else this.baseHealth.red = clamp(this.baseHealth.red + 5, 0, this.defaultBaseHealth);
        }
      }
      if (toSpawn > 0) this.spawnedWaves.red++;
    }
    return spawnedAny;
  }
  getSpawnBatchSize(team) {
    const rules = this.teamRules[team];
    if (rules.spawnMode === "wave") return rules.waveSize;
    return 3 + Math.floor(Math.random() * 2);
  }
  getSpawnCount(team, aliveCount) {
    const rules = this.teamRules[team];
    const availableSlots = Math.max(0, rules.maxTanks - aliveCount);
    let batchSize = this.getSpawnBatchSize(team);
    if (
      rules.spawnMode === "wave" &&
      team === this.level.playerTeam &&
      this.spawnedWaves[team] === 0
    ) {
      batchSize = Math.max(0, batchSize - aliveCount);
    }
    if (rules.spawnMode === "wave" && availableSlots < batchSize) return 0;
    return Math.min(batchSize, availableSlots);
  }
  handleBulletWallCollision(bullet) {
    const deployedWall = this.deployableWall;
    if (
      deployedWall?.active &&
      this.bulletSegmentIntersectsWall(bullet, deployedWall)
    ) {
      deployedWall.hp = Math.max(0, deployedWall.hp - bullet.damage);
      bullet.active = false;
      if (deployedWall.hp <= 0) deployedWall.active = false;
      return true;
    }
    if (this.mode !== "siege" || bullet.team !== this.level.attackerTeam) return false;
    const previousY = bullet.previousY ?? bullet.y;
    const segmentMinY = Math.min(previousY, bullet.y);
    const segmentMaxY = Math.max(previousY, bullet.y);
    const candidates = this.defenseLines
      .map((line) => line.wall)
      .filter((wall) =>
        wall.active &&
        segmentMaxY >= wall.y - wall.thickness / 2 &&
        segmentMinY <= wall.y + wall.thickness / 2,
      )
      .sort((a, b) => Math.abs(a.y - previousY) - Math.abs(b.y - previousY));
    const wall = candidates[0];
    if (!wall) return false;
    wall.hp = Math.max(0, wall.hp - bullet.damage);
    bullet.active = false;
    if (wall.hp <= 0) {
      wall.active = false;
      this.collapseStrongholdsBehindWall(wall.id);
    }
    return true;
  }
  bulletSegmentIntersectsWall(bullet, wall) {
    const x0 = bullet.previousX ?? bullet.x;
    const y0 = bullet.previousY ?? bullet.y;
    const x1 = bullet.x;
    const y1 = bullet.y;
    const radius = bullet.radius ?? 0;
    const left = wall.x - wall.width / 2 - radius;
    const right = wall.x + wall.width / 2 + radius;
    const top = wall.y - wall.thickness / 2 - radius;
    const bottom = wall.y + wall.thickness / 2 + radius;
    if (Math.max(y0, y1) < top || Math.min(y0, y1) > bottom) return false;
    const dy = y1 - y0;
    if (Math.abs(dy) < 1e-8) {
      return y0 >= top && y0 <= bottom && Math.max(x0, x1) >= left && Math.min(x0, x1) <= right;
    }
    const enter = Math.max(0, Math.min((top - y0) / dy, (bottom - y0) / dy));
    const exit = Math.min(1, Math.max((top - y0) / dy, (bottom - y0) / dy));
    if (enter > exit) return false;
    const xEnter = x0 + (x1 - x0) * enter;
    const xExit = x0 + (x1 - x0) * exit;
    return Math.max(xEnter, xExit) >= left && Math.min(xEnter, xExit) <= right;
  }
  bulletSegmentIntersectsCircle(bullet, target) {
    const x0 = bullet.previousX ?? bullet.x;
    const y0 = bullet.previousY ?? bullet.y;
    const x1 = bullet.x;
    const y1 = bullet.y;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segmentLengthSquared = dx * dx + dy * dy;
    const combinedRadius = (bullet.radius ?? 0) + (target.radius ?? 0);
    if (segmentLengthSquared <= 1e-12) {
      return circlesOverlap(x1, y1, bullet.radius ?? 0, target.x, target.y, target.radius ?? 0);
    }
    const projection = (
      (target.x - x0) * dx + (target.y - y0) * dy
    ) / segmentLengthSquared;
    const t = clamp(projection, 0, 1);
    const closestX = x0 + dx * t;
    const closestY = y0 + dy * t;
    const targetDx = closestX - target.x;
    const targetDy = closestY - target.y;
    return targetDx * targetDx + targetDy * targetDy <= combinedRadius * combinedRadius;
  }
  collapseStrongholdsBehindWall(lineId) {
    const line = this.defenseLines.find((item) => item.id === lineId);
    if (!line || line.objectiveType !== "stronghold" || line.destroyed) return;
    const strongholds = this.strongholds.filter(
      (item) => item.lineId === lineId && !item.destroyed,
    );
    for (const stronghold of strongholds) {
      this.causeSpecialExplosion(stronghold.x, stronghold.y, {
        creditTeam: null,
        awardPlayer: false,
      });
      this.destroyDefenseLine(stronghold);
    }
  }
  destroyDefenseLine(stronghold) {
    stronghold.hp = 0;
    stronghold.targetable = false;
    stronghold.destroyed = true;
    this.turrets = this.turrets.filter(
      (turret) => turret.x !== stronghold.x || turret.y !== stronghold.y,
    );
    const line = this.defenseLines.find((item) => item.id === stronghold.lineId);
    const remainingStrongholds = this.strongholds.some(
      (item) => item.lineId === stronghold.lineId && !item.destroyed,
    );
    if (remainingStrongholds) return;
    this.completeDefenseLine(line, stronghold);
  }
  completeDefenseLine(line, target) {
    if (!line || line.destroyed) return;
    line.destroyed = true;
    line.active = false;
    line.wall.active = false;
    if (line.objectiveType === "base") {
      const base = this.basePos[this.level.defenderTeam];
      this.baseHealth[this.level.defenderTeam] = 0;
      this.turrets = this.turrets.filter(
        (turret) => turret.x !== base.x || turret.y !== base.y,
      );
    }
    this.activeDefenseLineIndex++;
    if (this.activeDefenseLineIndex >= this.defenseLines.length) {
      this.finishGame(
        this.level.attackerTeam,
        "All defense lines destroyed!",
        { x: target.x, y: target.y },
      );
    } else {
      const nextLine = this.getActiveDefenseLine();
      nextLine.active = true;
      const nextStrongholds = this.strongholds.filter(
        (item) => item.lineId === nextLine.id,
      );
      for (const stronghold of nextStrongholds) stronghold.targetable = true;
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
    for (const line of this.defenseLines ?? []) {
      const wall = line.wall;
      if (!wall?.active) continue;
      const screenY = wall.y - cam.y;
      ctx.save();
      ctx.fillStyle = "rgba(180, 190, 205, 0.9)";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "rgba(220, 235, 255, 0.7)";
      ctx.fillRect(-cam.x, screenY - wall.thickness / 2, this.bounds.maxX, wall.thickness);
      const barX = this.bounds.maxX / 2 - cam.x - 100;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111";
      ctx.fillRect(barX, screenY + wall.thickness / 2 + 8, 200, 7);
      ctx.fillStyle = "#dcecff";
      ctx.fillRect(
        barX,
        screenY + wall.thickness / 2 + 8,
        200 * clamp(wall.hp / wall.maxHp, 0, 1),
        7,
      );
      ctx.restore();
    }
    if (this.deployableWall?.active) {
      const wall = this.deployableWall;
      const screenX = wall.x - cam.x;
      const screenY = wall.y - cam.y;
      ctx.save();
      ctx.fillStyle = "rgba(92, 179, 255, 0.9)";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(92, 179, 255, 0.75)";
      ctx.fillRect(
        screenX - wall.width / 2,
        screenY - wall.thickness / 2,
        wall.width,
        wall.thickness,
      );
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111";
      ctx.fillRect(screenX - 45, screenY + wall.thickness / 2 + 7, 90, 5);
      ctx.fillStyle = "#5cb3ff";
      ctx.fillRect(
        screenX - 45,
        screenY + wall.thickness / 2 + 7,
        90 * clamp(wall.hp / wall.maxHp, 0, 1),
        5,
      );
      ctx.restore();
    }
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
      if (stronghold.destroyed) continue;
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
        72 * clamp(stronghold.hp / (stronghold.maxHp ?? 4e3), 0, 1),
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
      if (stronghold.destroyed) continue;
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
    for (const line of this.defenseLines ?? []) {
      const wall = line.wall;
      if (!wall?.active) continue;
      const left = toMinimap(this.bounds.minX, wall.y);
      const right = toMinimap(this.bounds.maxX, wall.y);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.strokeStyle = "#dcecff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (this.deployableWall?.active) {
      const wall = this.deployableWall;
      const left = toMinimap(wall.x - wall.width / 2, wall.y);
      const right = toMinimap(wall.x + wall.width / 2, wall.y);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.strokeStyle = "#5cb3ff";
      ctx.lineWidth = 3;
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
  /** Resolve a data-driven explosive projectile impact. */
  causeWeaponExplosion(x, y, bulletTeam, explosion, isPlayerBullet = false) {
    this.explosionPool.spawn({ x, y, maxRadius: explosion.visualRadius });
    this.playSpatialAudio("death", y, 0.55, 1500);
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      const dx = tank.x - x;
      const dy = tank.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist >= explosion.radius) continue;
      const ratio = 1 - dist / explosion.radius;
      const damage = explosion.minDamage +
        (explosion.maxDamage - explosion.minDamage) * ratio;
      tank.hp -= damage;
      if (tank.isPlayer) this.triggerShake(damage);
      const angle = Math.atan2(dy, dx);
      tank.vx += Math.cos(angle) * explosion.pushForce;
      tank.vy += Math.sin(angle) * explosion.pushForce;
      if (tank.hp > 0) continue;
      this.explosionPool.spawn({ x: tank.x, y: tank.y, maxRadius: 36 });
      this.playSpatialAudio("death", tank.y, 1);
      if (tank.team !== bulletTeam) {
        this.killcount[bulletTeam]++;
        if (isPlayerBullet) {
          this.killcount.player++;
          this.point++;
        }
      }
      this.chargeTankLoss(tank);
    }
  }
  /** Resolve the stronger legacy turret-shell explosion. */
  causeTurretOrbitalStrike(x, y, bulletTeam, baseDamage) {
    const strikeRadius = 105; // 반경 100~110의 중간값
    const maximumDamage = Number.isFinite(baseDamage) && baseDamage > 0
      ? baseDamage * 0.5
      : 50;
    const minimumDamage = maximumDamage * 0.5;
    this.explosionPool.spawn({ x, y, maxRadius: 80 }); // 작은 폭발 이펙트
    this.playSpatialAudio("death", y, 0.6); // 사운드 재생
    
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      
      const dx = tank.x - x;
      const dy = tank.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < strikeRadius) {
        // Preserve the legacy Base-turret range (25-50) while allowing
        // Stronghold turret damage settings to scale the blast.
        const damageRatio = 1 - (dist / strikeRadius);
        const damage = minimumDamage +
          (maximumDamage - minimumDamage) * damageRatio;
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
          this.playSpatialAudio("death", tank.y, 1);
          if (tank.team !== bulletTeam) this.killcount[bulletTeam]++;
          this.chargeTankLoss(tank);
        }
      }
    }
  }
  /**
   * 대형 특수 폭발 생성
   * - 지정 좌표에 다중 폭발을 일으켜 광역 피해/연출 처리
   */
  causeSpecialExplosion(
    x,
    y,
    { creditTeam = this.level.playerTeam, awardPlayer = true } = {},
  ) {
    this.explosionPool.spawn({ x, y, maxRadius: 250 });
    this.playSpatialAudio("death", y, 1);
    for (const tank of this.tanks) {
      if (tank.hp <= 0) continue;
      const dx = tank.x - x;
      const dy = tank.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 멀수록 적게 흔들림
      this.triggerShake(dist);
      if (dist < 250) {
        const damage = Math.max(50, 200 * (1 - dist / 250));
        tank.hp -= damage;
        if (tank.hp > 0) {
          const push = 1500;
          const angle = Math.atan2(dy, dx);
          tank.vx += Math.cos(angle) * push;
          tank.vy += Math.sin(angle) * push;
        }
        if (tank.hp <= 0) {
          this.explosionPool.spawn({ x: tank.x, y: tank.y, maxRadius: 36 });
          this.playSpatialAudio("death", tank.y, 1, 2500);
          if (creditTeam && tank.team !== creditTeam) {
            this.killcount[creditTeam]++;
          }
          if (awardPlayer && tank.team !== this.level.playerTeam) {
            this.killcount.player++;
            this.point++;
          }
          this.chargeTankLoss(tank);
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
   * - 이벤트 Y와 청취 지점 Y의 차이를 거리로 보고, 거리에 비례해 볼륨을 줄임
   *
   * @param {number} originY 사운드 발생 지점의 Y 좌표
   * @param {number} listenerY 화면 중심 등 실제 청취 지점의 월드 Y 좌표
   * @param {number} [baseVolume=0.2] 기본 볼륨(0~1)
   * @param {number} [maxDistance=1200] 이 거리에서 볼륨이 0이 되도록 감쇠
   */
  playSpatial(originY, listenerY, baseVolume = 0.2, maxDistance = 1200) {
    const volume = calculateSpatialVolume(
      originY,
      listenerY,
      baseVolume,
      maxDistance,
    );
    for (const audio of this.pool) {
      if (audio.paused || audio.ended) {
        audio.currentTime = 0;
        audio.volume = volume;
        audio.play().catch(() => {});
        return;
      }
    }
    this.pool[0].currentTime = 0;
    this.pool[0].volume = volume;
    this.pool[0].play().catch(() => {});
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
