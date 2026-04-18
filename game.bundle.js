(() => {
  // ===== MOBILE SUPPORT =====
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 2;
  window.isMobile = isMobile;
  // ============================================================
  // GAME CONSTANTS - All magic numbers defined here for easy tuning
  // ============================================================
  const CONSTANTS = {
    // Player/Tank speeds
    PLAYER_SPEED: isMobile ? 90 : 125,
    AI_TANK_SPEED: isMobile ? 75 : 100,
    SUPERTANK_SPEED: isMobile ? 200 : 300,

    // Tank HP values
    TANK_HP: 125,
    SUPERTANK_HP: 500,
    TANK_RADIUS: isMobile ? 11 : 14,
    
    // Tank reload times (in seconds)
    TANK_RELOAD_TIME: 0.5,
    SUPERTANK_RELOAD_TIME: 0.05,
    
    // Bullet properties
    BULLET_SPEED: isMobile ? 300 : 400,
    BULLET_DAMAGE: 25,
    BULLET_RADIUS: isMobile ? 2 : 3,
    BULLET_LIFETIME: 1.5,
    BULLET_SPAWN_OFFSET: 6,
    BULLET_PEN_RATE: 1,
    BULLET_SPREAD_ANGLE: Math.PI / 36,
    BULLET_UNIFORM_SPREAD: Math.PI / 10,
    
    // Turret properties
    TURRET_RADIUS: 24,
    TURRET_DAMAGE: 75,
    TURRET_RELOAD_TIME: 0.5,
    TURRET_PROJECTILE_RADIUS: 8,
    TURRET_PROJECTILE_SPEED: 1800,
    TURRET_RANGE: 700,
    TURRET_PROJECTILE_LIFETIME: 0.5,
    TURRET_PEN_RATE: 2,
    TURRET_BASE_RANGE: 700,
    
    // Stronghold properties
    STRONGHOLD_HP: 2000,
    STRONGHOLD_SIZE: isMobile ? 48 : 72,
    STRONGHOLD_RESET_TIME: 50,
    STRONGHOLD_RELOAD_TIME: 1.0,
    
    // Base properties
    BASE_HP: 3000,
    BASE_SIZE: isMobile ? 48 : 80,
    BASE_OFFSET: 200,
    
    // World bounds
    WORLD_HEIGHT: 5000,
    GRID_SIZE: 200,
    
    // Spawning
    SPAWN_INTERVAL: 3,
    MAX_TANKS_PER_TEAM: isMobile ? 12 : 24,
    SPAWN_SCATTER_X: 120,
    SPAWN_SCATTER_Y: 60,
    
    // AI Controller parameters
    AI_ENGAGE_RANGE: 450,
    AI_DESIRED_MIN_DISTANCE: 250,
    AI_DESIRED_MAX_DISTANCE: 350,
    AI_ORBIT_FACTOR: 0.75,
    AI_RADIAL_GAIN: 0.45,
    AI_RADIAL_CAP_MULTIPLIER: 0.6,
    AI_AWARENESS_RANGE: 2000,
    AI_STRAFE_FACTOR: 0.3,
    AI_STRAFE_TIME_MIN: 0.5,
    AI_STRAFE_TIME_MAX: 1.5,
    AI_ORBIT_SWITCH_MIN: 1,
    AI_ORBIT_SWITCH_MAX: 2,
    AI_TARGET_SELECTION_TIMER: 10,
    AI_FIRE_RANGE: 500,
    
    // Physics
    FRICTION: 0.92,
    VELOCITY_THRESHOLD: 0.1,
    TANK_COLLISION_PADDING: 4,
    TANK_PUSH_FACTOR: 0.5,
    
    // Game settings
    FIXED_TIMESTEP: 1 / 60,
    SPECIAL_WEAPON_DELAY_NORMAL: 5.0,
    SPECIAL_WEAPON_DELAY_SUPER: 1.0,
    SPECIAL_WEAPON_POINT_COST: 5,
    SPECIAL_EXPLOSION_RADIUS: 250,
    SPECIAL_EXPLOSION_DAMAGE_MIN: 50,
    SPECIAL_EXPLOSION_DAMAGE_MAX: 200,
    SPECIAL_EXPLOSION_PUSH: 1500,
    PLAYER_RESPAWN_TIME: 5,
    FOCUS_RESUME_DELAY: 3,
    
    // UI and Camera
    MINIMAP_WIDTH: 100,
    MINIMAP_HEIGHT: 400,
    MINIMAP_MARGIN: 16,
    CAMERA_FOLLOW_OFFSET_Y: 100,
    CAMERA_EASING_FACTOR: 0.05,
    
    // Explosion
    EXPLOSION_LIFETIME: 1,
    EXPLOSION_DEFAULT_RADIUS: 50,
    TANK_DEATH_EXPLOSION_RADIUS: 36,
    
    // Audio pools
    SHOOT_SFX_POOL_SIZE: 120,
    DEATH_SFX_POOL_SIZE: 50,
    TURRET_SFX_POOL_SIZE: 20,
    BULLET_POOL_SIZE: 200,
    EXPLOSION_POOL_SIZE: 50,
    
    // HP bar colors and thresholds
    HP_BAR_WIDTH: 40,
    HP_BAR_HEIGHT: 4,
    HP_BAR_OFFSET_Y: 18,
    HP_THRESHOLD_HIGH: 0.6,
    HP_THRESHOLD_MED: 0.3,
    
    // Base HP bar
    BASE_HP_BAR_WIDTH: 400,
    BASE_HP_BAR_HEIGHT: 18,
    BASE_HP_BAR_Y: 16,
    BASE_HP_BAR_LEFT_X: 40,
  };

  // entities/Bullet.js
  var Bullet = class _Bullet {
    // 팀별 스프라이트 캐시(빨강/파랑)
    static spriteCache = {};
    constructor() {
      this.active = false;  
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.team = "";
      this.isPlayerBullet = false;
      this.damage = CONSTANTS.BULLET_DAMAGE;
      this.radius = CONSTANTS.BULLET_RADIUS;
      this.lifetime = CONSTANTS.BULLET_LIFETIME;
      this.age = 0;
      this.penRate = CONSTANTS.BULLET_PEN_RATE;
    }
    /**
     * 스프라이트 로딩(팀 색상별)
     * - 최초 로딩 시 ImageBitmap으로 변환하여 캐시
     * - 이후 생성되는 Bullet은 캐시만 참조
     */
    async initSprite(team) {
      if (_Bullet.spriteCache[team]) {
        this.sprite = _Bullet.spriteCache[team];
        return;
      }
      // const pathMap = {
      //   red: "../assets/sprites/bullets/projectile_red.png",
      //   blue: "../assets/sprites/bullets/projectile_blue.png",
      // };
      const pathMap = {
        red: "../assets/sprites/bullets/projectile_red.png",
        blue: "../assets/sprites/bullets/projectile_blue.png",
      };
      const path = pathMap[team];
      const img = new Image();
      img.src = path;
      await img.decode();
      const bitmap = await createImageBitmap(img);
      _Bullet.spriteCache[team] = bitmap;
      this.sprite = bitmap;
      console.log(`\u2705 Sprite loaded for team: ${team}`, this.sprite);
    }
    /**
     * 풀에서 꺼낼 때 호출되는 초기화
     * - 위치/속도/팀/데미지/반지름/수명 초기화
     * - 팀별 스프라이트 자동 연결(이미 캐시되어 있으면 즉시 바인딩)
     */
    init({ x, y, vx, vy, team, damage, isPlayerBullet, radius, lifetime, penRate }) {
      this.active = true;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.team = team;
      this.isPlayerBullet = isPlayerBullet;
      this.damage = damage ?? CONSTANTS.BULLET_DAMAGE;
      this.radius = radius ?? CONSTANTS.BULLET_RADIUS;
      this.age = 0;
      this.lifetime = lifetime;
      this.penRate = penRate;
      if (_Bullet.spriteCache[this.team]) {
        this.sprite = _Bullet.spriteCache[this.team];
      }
    }
    /**
     * 프레임별 이동/수명 관리
     * - lifetime 경과 시 active=false로 비활성화(풀 반환)
     */
    update(dt) {
      this.age += dt;
      if (this.age > this.lifetime) {
        this.active = false;
        return;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    /**
     * 스프라이트 렌더링
     * - 탄 속도 벡터 방향으로 회전하여 그려 시각적 일치감 제공
     * - isLarge 플래그가 true면 크기를 1.5배로 확장
     */
    draw(ctx, camera) {
      if (!this.active || !this.sprite) return;
      const screenX = this.x - camera.x;
      const screenY = this.y - camera.y;
      const angle = Math.atan2(this.vy, this.vx) ;
      const scale = this.isLarge ? 1.5 : 1;
      const size = this.radius * 16 * scale;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }lifetime
  };

  // entities/Explosion.js
  var Explosion = class _Explosion {
    // 공용 스프라이트 캐시
    // - 모든 인스턴스가 동일 시트를 공유하여 메모리/로드 비용 절약
    static sprite = null;
    constructor() {
      this.active = false;
      this.x = 0;
      this.y = 0;
      this.scale = 1;
      this.alpha = 1;
      this.age = 0;
      this.lifetime = CONSTANTS.EXPLOSION_LIFETIME;
    }
    /**
     * 스프라이트 미리 로드(정적)
     * - 처음 한 번만 이미지 로딩 → ImageBitmap 변환 후 캐시
     * - GPU 친화 포맷으로 드로우 비용 절감
     */
    static async initSprite() {
      if (_Explosion.sprite) return;
      const img = new Image();
      img.src = "../assets/sprites/explosion/explosion.png";
      await new Promise((res) => (img.onload = res));
      _Explosion.sprite = await createImageBitmap(img);
      console.log("\u2705 Explosion sprite loaded");
    }
    /**
     * 폭발 인스턴스 초기화
     * - 위치/최대 반경/나이/투명도/스케일 초기화
     */
    init({ x, y, maxRadius = CONSTANTS.EXPLOSION_DEFAULT_RADIUS }) {
      this.active = true;
      this.x = x;
      this.y = y;
      this.maxRadius = maxRadius;
      this.age = 0;
      this.scale = 1;
      this.alpha = 1;
    }
    /**
     * 프레임별 업데이트
     * - t = age/lifetime에 따라 크기/투명도를 선형으로 변화
     * - 수명 종료 시 active=false로 풀에 반환될 준비
     */
    update(dt) {
      if (!this.active) return;
      this.age += dt;
      const t = this.age / this.lifetime;
      this.scale = 1 - 0.5 * t;
      this.alpha = Math.max(0, 1 - t);
      if (t >= 1) {
        this.active = false;
      }
    }
    /**
     * 스프라이트 렌더링
     * - 카메라 오프셋 보정 후, 중심 기준으로 스케일 적용하여 그리기
     */
    draw(ctx, camera) {
      if (!this.active || !_Explosion.sprite) return;
      const screenX = this.x - camera.x;
      const screenY = this.y - camera.y;
      const size = this.maxRadius * this.scale * 2;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.drawImage(
        _Explosion.sprite,
        screenX - size / 2,
        screenY - size / 2,
        size,
        size,
      );
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  };

  // utils/math.js
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function getLeadAngle(shooter, target, projectileSpeed) {
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
  function handleTankAI(tank, dt, world) {
    // Determine forward direction based on team
    let forwardDir = 1;
    if (tank.team === "blue") {
      forwardDir = -1;
    }
    
    const moveSpeed = tank.speed;
    
    // Initialize strafe direction if not set
    if (tank.strafeDir === undefined || tank.strafeDir === null) {
      const randomValue = Math.random();
      if (randomValue < 0.5) {
        tank.strafeDir = -1;
      } else {
        tank.strafeDir = 1;
      }
    }
    
    // Initialize strafe timer if not set
    if (tank.strafeTimer === undefined || tank.strafeTimer === null) {
      tank.strafeTimer = 0.5 + Math.random() * 1.5;
    } else {
      tank.strafeTimer -= dt;
      const strafeExpired = tank.strafeTimer <= 0;
      if (strafeExpired) {
        const randomValue = Math.random();
        if (randomValue < 0.5) {
          tank.strafeDir = -1;
        } else {
          tank.strafeDir = 1;
        }
        tank.strafeTimer = 0.5 + Math.random() * 1.5;
      }
    }
    
    // Initialize orbit direction if not set
    if (tank.orbitDir === undefined || tank.orbitDir === null) {
      const randomValue = Math.random();
      if (randomValue < 0.5) {
        tank.orbitDir = 1;
      } else {
        tank.orbitDir = -1;
      }
    }
    
    // Initialize orbit switch timer if not set
    if (tank.orbitSwitchTimer === undefined || tank.orbitSwitchTimer === null) {
      tank.orbitSwitchTimer = 1 + Math.random() * 2;
    } else {
      tank.orbitSwitchTimer -= dt;
      const orbitExpired = tank.orbitSwitchTimer <= 0;
      if (orbitExpired) {
        tank.orbitDir = tank.orbitDir * -1;
        tank.orbitSwitchTimer = 1 + Math.random() * 2;
      }
    }
    
    // Initialize target selection timer if not set
    if (tank.targetSelectionTimer === undefined || tank.targetSelectionTimer === null) {
      tank.targetSelectionTimer = 10;
    } else {
      tank.targetSelectionTimer -= dt;
    }
    
    // Build target list: find all targets within engage range
    const targetsInRange = [];
    
    for (const t of world.tanks) {
      const isEnemy = t.team !== tank.team;
      const isAlive = t.hp > 0;
      const distToTank = distance(t, tank);
      const inRange = distToTank <= CONSTANTS.AI_ENGAGE_RANGE;
      if (isEnemy && isAlive && inRange) {
        targetsInRange.push(t);
      }
    }
    
    for (const s of world.strongholds) {
      const isAlive = s.hp > 0 && s.isCapturing !== true;
      const isNotOwned = s.owner !== tank.team;
      const distToStronghold = distance(s, tank);
      const inRange = distToStronghold <= CONSTANTS.AI_ENGAGE_RANGE;
      if (isAlive && isNotOwned && inRange) {
        // push the actual stronghold object so owner/hp are available later
        targetsInRange.push(s);
      }
    }
    
    let enemyBaseTeam = "blue";
    if (tank.team === "blue") {
      enemyBaseTeam = "red";
    }
    const enemyBase = world.basePos[enemyBaseTeam];
    const distToBase = distance(enemyBase, tank);
    const baseInRange = distToBase <= CONSTANTS.AI_ENGAGE_RANGE;
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
    
    // Select or update target randomly
    let nearest = null;
    let distToTarget = Infinity;
    
    const shouldSelectNewTarget = tank.targetSelectionTimer <= 0 || !tank.currentTarget || tank.currentTarget.hp <= 0;
    
    if (shouldSelectNewTarget) {
      // Select random target from those in range
      if (targetsInRange.length > 0) {
        const randomIndex = Math.floor(Math.random() * targetsInRange.length);
        tank.currentTarget = targetsInRange[randomIndex];
        tank.targetSelectionTimer = 10;
      } else {
        tank.currentTarget = null;
        tank.targetSelectionTimer = 1;
      }
    }
    
    // Use current target if valid
    if (tank.currentTarget) {
      const targetAlive = tank.currentTarget.hp === undefined || tank.currentTarget.hp > 0;
      const targetInRange = distance(tank.currentTarget, tank) <= CONSTANTS.AI_ENGAGE_RANGE;
      
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
    
    // Initialize movement
    let moveX = 0;
    let moveY = 0;
    
    // Engagement parameters
    const DESIRED_MIN = CONSTANTS.AI_DESIRED_MIN_DISTANCE;
    const DESIRED_MAX = CONSTANTS.AI_DESIRED_MAX_DISTANCE;
    const ENGAGE_MAX = CONSTANTS.AI_ENGAGE_RANGE;
    const ORBIT_FACTOR = CONSTANTS.AI_ORBIT_FACTOR;
    const RADIAL_GAIN = CONSTANTS.AI_RADIAL_GAIN;
    const RADIAL_CAP = moveSpeed * CONSTANTS.AI_RADIAL_CAP_MULTIPLIER;
    
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
      const inAwarenessRange = nearest && distToTarget <= CONSTANTS.AI_AWARENESS_RANGE;
      if (inAwarenessRange) {
        // Chase mode: move toward target
        const dx = nearest.x - tank.x;
        const dy = nearest.y - tank.y;
        const chaseAngle = Math.atan2(dy, dx);
        tank.angle = chaseAngle;
        
        const cosChaseAngle = Math.cos(chaseAngle);
        const sinChaseAngle = Math.sin(chaseAngle);
        
        moveX = cosChaseAngle * moveSpeed + tank.strafeDir * moveSpeed * CONSTANTS.AI_STRAFE_FACTOR;
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
      
      const fireRange = CONSTANTS.AI_FIRE_RANGE;
      const canFire = distance(nearest, tank) < fireRange;
      if (canFire) {
        tank.tryShoot(world);
      }
    }
  }

  // entities/Tank.js
  var Tank = class {
    static sprite = null;
    constructor(x, y, team, isPlayer = false, supertank = false) {
      this.x = x;
      this.y = y;
      this.team = team;
      this.isPlayer = isPlayer;
      this.angle = 300;
      this.turretAngle = 0;
      this.speed = supertank ? CONSTANTS.SUPERTANK_SPEED : (isPlayer ? CONSTANTS.PLAYER_SPEED : CONSTANTS.AI_TANK_SPEED);
      this.hp = supertank ? CONSTANTS.SUPERTANK_HP : CONSTANTS.TANK_HP;
      this.radius = CONSTANTS.TANK_RADIUS;
      this.fireCooldown = 0;
      this.reloadTime = supertank ? CONSTANTS.SUPERTANK_RELOAD_TIME : CONSTANTS.TANK_RELOAD_TIME;
      this.target = null;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = Math.random() * 1;
      this.supertank = supertank;
      this.vx = 0;
      this.vy = 0;
      this.bulletCount = 1;
      this.projectileLifeTime = CONSTANTS.BULLET_LIFETIME;
      this.penRate = CONSTANTS.BULLET_PEN_RATE; // 1개 탱크 맞추면 총알 소멸
    }
    /**
     * 프레임별 갱신
     * - 입력/AI 이동, 경계 클램프, 감쇠 적용, 사격 쿨다운 감소
     */
    update(dt, world, input) {
      if (this.hp <= 0) return;
      if (this.isPlayer) {
        this.handlePlayerInput(dt, world, input);
      } else {
        handleTankAI(this, dt, world);
      }
      if (this.fireCooldown > 0) {
        this.fireCooldown -= dt;
      }
      this.x = clamp(
        this.x,
        world.bounds.minX + this.radius,
        world.bounds.maxX - this.radius,
      );
      this.y = clamp(
        this.y,
        world.bounds.minY + this.radius,
        world.bounds.maxY - this.radius,
      );
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= CONSTANTS.FRICTION;
      this.vy *= CONSTANTS.FRICTION;
      if (Math.abs(this.vx) < CONSTANTS.VELOCITY_THRESHOLD) this.vx = 0;
      if (Math.abs(this.vy) < CONSTANTS.VELOCITY_THRESHOLD) this.vy = 0;
    }
    /**
     * 플레이어 입력 처리
     * - WASD/화살표 이동(스크린 기준), 대각선 정규화
     * - 마우스 위치로 포탑 조준(캔버스→월드 좌표 변환)
     * - 좌클릭 지속 발사
     */
    handlePlayerInput(dt, world, input) {
      if (input.isMobile) {
        // ==================== 모바일 조이스틱 ====================
        const dx = input.moveInput.x;
        const dy = input.moveInput.y;
        if (dx !== 0 || dy !== 0) {
          this.x += dx * this.speed * dt;
          this.y += dy * this.speed * dt;
          this.angle = Math.atan2(dy, dx);
        }

        // 조준 (우측 조이스틱)
        if (input.aimInput.x !== 0 || input.aimInput.y !== 0) {
          this.turretAngle = Math.atan2(input.aimInput.y, input.aimInput.x);
        }

        // 자동 발사
        if (input.fireInput) {
          this.tryShoot(world, this.bulletCount);
        }
      } else {
        // ==================== 기존 PC 컨트롤 ====================
        const keys = input.keys;
        let dx = 0, dy = 0;
        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const len = Math.sqrt(dx * dx + dy * dy);
          dx /= len; dy /= len;
          this.x += dx * this.speed * dt;
          this.y += dy * this.speed * dt;
          this.angle = Math.atan2(dy, dx);
        }
        const cam = world.camera;
        const mouseWorldX = input.mouse.canvasX + cam.x;
        const mouseWorldY = input.mouse.canvasY + cam.y;
        this.turretAngle = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);
        if (input.mouse.down) this.tryShoot(world, this.bulletCount);
      }
    }
    /**
     * 발사 처리
     * - bulletCount 만큼 부채꼴/스프레드로 탄환 발사하도록 구현하는 곳
     * - bulletPool.spawn(...) 호출로 총알 오브젝트 활성화
     */
    tryShoot(world, bulletCount = this.bulletCount) {
      if (this.fireCooldown > 0) return;
      const baseAngle = this.turretAngle;
      const bulletSpeed = CONSTANTS.BULLET_SPEED;
      const maxSpread = CONSTANTS.BULLET_SPREAD_ANGLE;
      const uniformSpreadAngle = CONSTANTS.BULLET_UNIFORM_SPREAD;
      for (let i = 0; i < bulletCount; i++) {
        let angle;
        if (bulletCount === 1) {
          const spread = (Math.random() - 0.5) * 2 * maxSpread;
          angle = baseAngle + spread;
        } else {
          const startAngle = baseAngle - uniformSpreadAngle / 2;
          const step = uniformSpreadAngle / (bulletCount - 1);
          angle = startAngle + step * i;
        }
        const vx = Math.cos(angle) * bulletSpeed;
        const vy = Math.sin(angle) * bulletSpeed;
        world.bulletPool.spawn({
          x: this.x + Math.cos(angle) * (this.radius + CONSTANTS.BULLET_SPAWN_OFFSET),
          y: this.y + Math.sin(angle) * (this.radius + CONSTANTS.BULLET_SPAWN_OFFSET),
          vx,
          vy,
          team: this.team,
          isPlayerBullet: this.isPlayer,
          lifetime: this.projectileLifeTime,
          penRate: this.penRate
        });
      }
      shootSFXPool.playSpatial(this.y, world.camera.y, 0.4);
      this.fireCooldown = this.reloadTime;
    }

    /**
     * 스프라이트 비동기 로드
     * - 경로가 유효하면 createImageBitmap으로 비트맵 생성
     */
    static async loadSprite(path) {
      try {
        const img = await fetch(path)
          .then((res) => res.blob())
          .then((blob) => createImageBitmap(blob));
        Tank.sprite = img;
        console.log("Tank sprite loaded successfully");
      } catch (err) {
        console.warn("Failed to load tank sprite:", err);
        Tank.sprite = null; // 실패하면 기본 드로잉 사용
      }
    }

    draw(ctx, camera) {
      if (this.hp <= 0) return;

      const screenX = this.x - camera.x;
      const screenY = this.y - camera.y;

      if (Tank.sprite) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);
        ctx.drawImage(
          Tank.sprite,
          -Tank.sprite.width / 2,
          -Tank.sprite.height / 2
        );
        ctx.restore();
      } else {
        // 기존 ctx 벡터 드로잉
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.isPlayer
          ? "rgba(255, 230, 0, 0.8)"
          : this.team === "blue"
            ? "rgba(92, 179, 255, 0.8)"
            : "rgba(255, 106, 106, 0.8)";
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.isPlayer
          ? "#ffe600ff"
          : this.team === "blue"
            ? "#5cb3ff"
            : "#ff6a6a";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.restore();
        ctx.shadowBlur = 0;
      }

      // HP 바 항상 그리기
      const maxHP = this.supertank ? CONSTANTS.SUPERTANK_HP : CONSTANTS.TANK_HP;
      const barWidth = CONSTANTS.HP_BAR_WIDTH;
      const barHeight = CONSTANTS.HP_BAR_HEIGHT;
      const barX = screenX - barWidth / 2;
      const barY = screenY - this.radius - CONSTANTS.HP_BAR_OFFSET_Y;
      ctx.fillStyle = "#000";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      const hpRatio = this.hp / maxHP;
      ctx.fillStyle =
        hpRatio > CONSTANTS.HP_THRESHOLD_HIGH
          ? "rgba(76, 193, 76, 1)"
          : hpRatio > CONSTANTS.HP_THRESHOLD_MED
            ? "rgba(200, 200, 71, 1)"
            : "rgba(204, 63, 63, 1)";
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

      ctx.strokeStyle = "#4f4f4fff";
      ctx.lineWidth = 1;
      for (let hp = 25; hp < maxHP; hp += 25) {
        const x = barX + barWidth * (hp / maxHP);
        ctx.beginPath();
        ctx.moveTo(x, barY);
        ctx.lineTo(x, barY + barHeight);
        ctx.stroke();
      }
    }
  };

  // entities/Turret.js
  var Turret = class {
    constructor(x, y, team, damage = CONSTANTS.TURRET_DAMAGE, reloadTime = CONSTANTS.TURRET_RELOAD_TIME) {
      this.x = x;
      this.y = y;
      this.team = team;
      this.damage = damage;
      this.fireCooldown = -1;
      this.reloadTime = reloadTime;
      this.radius = CONSTANTS.TURRET_RADIUS;
      this.targetAngle = -Math.PI / 2;
      this.projectileRadius = CONSTANTS.TURRET_PROJECTILE_RADIUS;
      this.projectileSpeed = CONSTANTS.TURRET_PROJECTILE_SPEED;
      this.range = CONSTANTS.TURRET_RANGE;
      this.projectileLifeTime = CONSTANTS.TURRET_PROJECTILE_LIFETIME;
      this.penRate = CONSTANTS.TURRET_PEN_RATE;
    }
    /**
     * 프레임별 갱신
     * - 가장 가까운 적 탱크 탐색 → 리드샷 각도 계산 → 사거리 내면 발사
     * - 발사 쿨다운 감소
     */
    update(dt, world) {
      const enemies = world.tanks.filter(
        (t) => t.team !== this.team && t.hp > 0,
      );
      if (enemies.length > 0) {
        enemies.sort((a, b) => distance(a, this) - distance(b, this));
        const target = enemies[0];
        this.targetAngle = getLeadAngle(this, target, this.projectileSpeed);
        // if (distance(target, this) < this.range ) {
        //   this.tryShoot(world);
        // }
        
        // 사거리 Y축 만 기준으로 사거리 내에 들어오면 발사
        if (target.y <= this.y + CONSTANTS.TURRET_BASE_RANGE && target.y >= this.y - CONSTANTS.TURRET_BASE_RANGE ) {
          this.tryShoot(world);
        }
      }
      if (this.fireCooldown > 0) {
        this.fireCooldown -= dt;
      }
    }
    /**
     * 사격 처리
     * - 약간의 랜덤 탄퍼짐(spread) 적용으로 자연스러운 발사
     * - Bullet 풀에 스폰 요청
     * - 포탑 발사음 공간 재생
     */
    tryShoot(world) {
      if (this.fireCooldown > 0) return;
      const angle = this.targetAngle;
      const vx = Math.cos(angle) * this.projectileSpeed;
      const vy = Math.sin(angle) * this.projectileSpeed;
      world.bulletPool.spawn({
        x: this.x + Math.cos(angle) * (this.radius + CONSTANTS.TURRET_PROJECTILE_RADIUS),
        y: this.y + Math.sin(angle) * (this.radius + CONSTANTS.TURRET_PROJECTILE_RADIUS),
        vx,
        vy,
        team: this.team,
        damage: this.damage,
        radius: this.projectileRadius,
        lifetime: this.projectileLifeTime,
        penRate: this.penRate
      });
      turretSFXPool.playSpatial(this.y, world.camera.y, 0.9, 1500);
      this.fireCooldown = this.reloadTime;
    }
    /**
     * 단순한 실루엣 렌더링(포신)
     * - 베이스나 섀도우 등은 생략하고 포신만 그려 간결하게 표현
     */
    draw(ctx, camera) {
      const screenX = (this.x - camera.x) * camera.scale;
      const screenY = (this.y - camera.y) * camera.scale;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(this.targetAngle);
      ctx.fillStyle = "#333";
      ctx.fillRect(0, -8, 40, 16);
      ctx.restore();
    }
  };

  // core/World.js
  var World = class {
    constructor(canvas, isSuperMode) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.bounds = {
        minX: 0,
        maxX: canvas.width,
        minY: 0,
        maxY: CONSTANTS.WORLD_HEIGHT,
      };
      this.camera = { x: 0, y: 0 };
      this.cameraScale = window.isMobile ? 0.2 : 1;
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
      this.spawnInterval = CONSTANTS.SPAWN_INTERVAL;
      this.maxTanksPerTeam = CONSTANTS.MAX_TANKS_PER_TEAM;
      this.isSuperMode = isSuperMode;
      this.point = this.isSuperMode ? 999999 : 10;
      this.pointDisplay = null;
      this.killcount = { player: 0, blue: 0, red: 0 };
      this.redTeamKillDisplay = null;
      this.blueTeamKillDisplay = null;
      this.myKillDisplay = null;
      this.defaultBaseHealth = CONSTANTS.BASE_HP;
      this.baseHealth = {
        blue: this.defaultBaseHealth,
        red: this.defaultBaseHealth,
      };
      this.basePos = {
        // 파랑 본진: 맵 하단 근처
        blue: { x: canvas.width / 2, y: this.bounds.maxY - CONSTANTS.BASE_OFFSET },
        // 빨강 본진: 맵 상단 근처
        red: { x: canvas.width / 2, y: this.bounds.minY + CONSTANTS.BASE_OFFSET },
      };
      this.strongholds = [
        {
          x: canvas.width / 2,
          y: this.bounds.maxY * 0.25,
          hp: CONSTANTS.STRONGHOLD_HP,
          owner: null,
        },
        {
          x: canvas.width / 2,
          y: this.bounds.maxY * 0.5,
          hp: CONSTANTS.STRONGHOLD_HP,
          owner: null,
        },
        {
          x: canvas.width / 2,
          y: this.bounds.maxY * 0.75,
          hp: CONSTANTS.STRONGHOLD_HP,
          owner: null,
        },
      ];
      this.turrets = [];
      this.turrets.push(
        new Turret(this.basePos.blue.x, this.basePos.blue.y, "blue", CONSTANTS.TURRET_DAMAGE, CONSTANTS.TURRET_RELOAD_TIME),
      );
      this.turrets.push(
        new Turret(this.basePos.red.x, this.basePos.red.y, "red", CONSTANTS.TURRET_DAMAGE, CONSTANTS.TURRET_RELOAD_TIME),
      );
      this.gameOver = false;
      this.specialCooldown = 0;
      this.specialCoolTime = this.isSuperMode ? CONSTANTS.SPECIAL_WEAPON_DELAY_SUPER : 30;
      this.pendingExplosion = null;
      this.specialWeaponText = null;
      this.specialWeaponPoint = CONSTANTS.SPECIAL_WEAPON_POINT_COST;
    }
    /**
     * 탱크를 월드에 등록
     */
    addTank(tank) {
      this.tanks.push(tank);
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
          100;
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
            tank.hp -= bullet.damage || 25;
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
              stronghold.owner = bullet.team;
              stronghold.isCapturing = true;
              // // 점령시 티켓 회복
              // this.baseHealth[bullet.team] = clamp(
              //   this.baseHealth[bullet.team] + 50,
              //   0,
              //   this.defaultBaseHealth,
              // );
              this.turrets = this.turrets.filter(
                (t) => !(t.x === stronghold.x && t.y === stronghold.y),
              );
              this.turrets.push(
                new Turret(stronghold.x, stronghold.y, stronghold.owner, 75, CONSTANTS.STRONGHOLD_RELOAD_TIME),
              );
              // Reset stronghold after 3 seconds to prevent constant targeting
              setTimeout(() => {
                stronghold.hp = CONSTANTS.STRONGHOLD_HP;
                stronghold.isCapturing = false;
              }, 50);
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
    getSpawnPoint(team) {
      const enemyBaseY = this.basePos[team === "blue" ? "red" : "blue"].y;
      const owned = this.strongholds.filter((s) => s.owner === team);
      if (owned.length === 0) {
        return { x: this.basePos[team].x, y: this.basePos[team].y };
      }
      owned.sort(
        (a, b) => Math.abs(a.y - enemyBaseY) - Math.abs(b.y - enemyBaseY),
      );
      return { x: owned[0].x, y: owned[0].y };
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
        const spawn = this.getSpawnPoint("blue");
        for (let i = 0; i < toSpawn; i++) {
          const x = spawn.x + (Math.random() - 0.5) * 120;
          const y = spawn.y + (Math.random() - 0.5) * 60;
          this.addTank(new Tank(x, y, "blue", false));
          const stronghold = this.strongholds.find(
            (s) => s.owner === "blue" && s.x === spawn.x && s.y === spawn.y,
          );
          if (stronghold) {
            stronghold.hp = clamp(stronghold.hp + 5, 0, CONSTANTS.STRONGHOLD_HP);
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
        const spawn = this.getSpawnPoint("red");
        for (let i = 0; i < toSpawn; i++) {
          const x = spawn.x + (Math.random() - 0.5) * 120;
          const y = spawn.y + (Math.random() - 0.5) * 60;
          this.addTank(new Tank(x, y, "red", false));
          const stronghold = this.strongholds.find(
            (s) => s.owner === "red" && s.x === spawn.x && s.y === spawn.y,
          );
          if (stronghold) {
            stronghold.hp = clamp(stronghold.hp + 5, 0, CONSTANTS.STRONGHOLD_HP);
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
      const cam = this.camera;
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
        const baseSize = isMobile ? 48 : 80;
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
        const strongholdSize = isMobile ? 48 : 72;
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
          72 * clamp(stronghold.hp / CONSTANTS.STRONGHOLD_HP, 0, 1),
          6,
        );
        ctx.restore();
      }
      for (const turret of this.turrets) {
        turret.draw(ctx, cam);
      }
      ctx.save();
      const barWidth = window.isMobile ? 150 : 400;
      const barHeight = 18;
      const baseMaxHp = this.defaultBaseHealth;
      ctx.fillStyle = "#333";
      ctx.fillRect(
        ctx.canvas.width / 2 - (40 + barWidth),
        16,
        barWidth,
        barHeight,
      );
      ctx.fillStyle = "#5cb3ff";
      ctx.fillRect(
        ctx.canvas.width / 2 - (40 + barWidth),
        16,
        barWidth * clamp(this.baseHealth.blue / baseMaxHp, 0, 1),
        barHeight,
      );
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        ctx.canvas.width / 2 - (40 + barWidth),
        16,
        barWidth,
        barHeight,
      );
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `BLUE Base: ${this.baseHealth.blue}`,
        ctx.canvas.width / 2 - (40 + barWidth),
        8,
      );
      ctx.fillStyle = "#333";
      ctx.fillRect(ctx.canvas.width / 2 + 40, 16, barWidth, barHeight);
      ctx.fillStyle = "#ff6a6a";
      ctx.fillRect(
        ctx.canvas.width / 2 + 40,
        16,
        barWidth * clamp(this.baseHealth.red / baseMaxHp, 0, 1),
        barHeight,
      );
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(ctx.canvas.width / 2 + 40, 16, barWidth, barHeight);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `RED Base: ${this.baseHealth.red}`,
        ctx.canvas.width / 2 + 40,
        8,
      );
      ctx.restore();
      ctx.save();
      const minimapWidth = 100;
      const mapMinX = this.bounds.minX;
      const mapMaxX = this.bounds.maxX;
      const mapMinY = this.bounds.minY;
      const mapMaxY = this.bounds.maxY;
      const minimapHeight = this.isMobile ? 320 : 400;   // 모바일은 조금 작게
      const margin = 16;
      let minimapX, minimapY;

      if (this.isMobile) {
        // 모바일: 좌측 상단 (작동 안함)
        minimapX = margin;
        minimapY = margin;
      } else {
        // PC: 기존 우측 하단
        minimapX = ctx.canvas.width - minimapWidth - margin;
        minimapY = ctx.canvas.height - minimapHeight - margin;
      }
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
  };

  // input/InputManager.js
  var InputManager = class {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.keys = {};
    this.mouse = { canvasX: 0, canvasY: 0, down: false, rightDown: false };
    this.isMobile = window.isMobile || false;
    this.moveInput = { x: 0, y: 0 };
    this.aimInput = { x: 0, y: 0 };
    this.fireInput = false;
    this.specialAiming = false;
    this.specialTargetCanvasX = 0;
    this.specialTargetCanvasY = 0;

    // PC 키보드/마우스
    window.addEventListener("keydown", e => this.keys[e.key.toLowerCase()] = true);
    window.addEventListener("keyup", e => this.keys[e.key.toLowerCase()] = false);
    canvas.addEventListener("mousedown", e => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.mouse.rightDown = true;
    });
    canvas.addEventListener("mouseup", e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    canvas.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.canvasX = e.clientX - rect.left;
      this.mouse.canvasY = e.clientY - rect.top;
    });

    if (this.isMobile) this.setupMobileControls();
  }

  setupMobileControls() {
    // 모바일 컨트롤 표시
    document.getElementById('left-joystick').style.display = 'block';
    document.getElementById('right-joystick').style.display = 'block';
    document.getElementById('mobile-instruction').style.display = 'block';
    document.getElementById('pc-instruction').style.display = 'none';

    // 조이스틱
    this.leftJoystick = new VirtualJoystick("left-joystick",
      (x, y) => { this.moveInput = { x, y }; },
      () => { this.moveInput = { x: 0, y: 0 }; }
    );
    this.rightJoystick = new VirtualJoystick("right-joystick",
      (x, y) => {
        this.aimInput = { x, y };
        this.fireInput = true;
      },
      () => {
        this.aimInput = { x: 0, y: 0 };
        this.fireInput = false;
      }
    );
  }
};

  // core/managers/UIManager.js
  var UIManager = class {
    /**
     * @param {HTMLCanvasElement} canvas The game's rendering canvas.
     */
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.pointEl = document.getElementById("point");
      this.blueKillEl = document.getElementById("blueTeamKill");
      this.redKillEl = document.getElementById("redTeamKill");
      this.playerKillEl = document.getElementById("myKill");
      this.specialWeaponEl = document.getElementById("special-weapon");
      this.specialWeaponPointEl = document.getElementById("specialWeaponPoint");
    }
    /**
     * Update the kill scoreboard text. Accepts the latest kill counts for
     * blue, red and player. Each call writes to the corresponding DOM
     * element if it exists.
     *
     * @param {number} blueKills Number of kills by blue team.
     * @param {number} redKills Number of kills by red team.
     * @param {number} playerKills Number of kills by the player.
     */
    updateScoreboard(blueKills, redKills, playerKills) {
      if (this.blueKillEl) this.blueKillEl.textContent = `${blueKills}`;
      if (this.redKillEl) this.redKillEl.textContent = `${redKills}`;
      if (this.playerKillEl) this.playerKillEl.textContent = `${playerKills}`;
    }
    /**
     * Update the player's current point display.
     *
     * @param {number} point The current point value.
     */
    updatePoint(point) {
      if (this.pointEl) this.pointEl.textContent = `${point}`;
    }
    /**
     * Update the special weapon cooldown bar and remaining point cost. The
     * gauge shows a fixed number of bars (30) filling from empty to full
     * based on the remaining cooldown. Once cooldown reaches zero the bar
     * is fully filled. The current point cost is displayed to the right of
     * the bar.
     *
     * @param {number} cooldown Remaining cooldown time.
     * @param {number} maxCooldown Maximum cooldown time.
     * @param {number} currentPoint Current cost for using the special weapon.
     */
    updateSpecialWeaponBar(cooldown, maxCooldown, currentPoint) {
      if (!this.specialWeaponEl) return;
      const barLength = 10;
      if (cooldown > 0 && maxCooldown > 0) {
        const currentBars = Math.ceil(
          ((maxCooldown - cooldown) / maxCooldown) * barLength,
        );
        const bars = "\u2588".repeat(currentBars);
        const emptyBars = "\u2591".repeat(barLength - currentBars);
        this.specialWeaponEl.textContent = `[${bars}${emptyBars}] `;
        this.specialWeaponPointEl.textContent = `${currentPoint}  `;
        this.specialWeaponEl.style.color = "#ffe600";
      } else {
        this.specialWeaponEl.style.color = "#00ffff";
        this.specialWeaponEl.textContent = `[${"\u2588".repeat(barLength)}] `;
        this.specialWeaponPointEl.textContent = `${currentPoint}  `;
      }
    }
    /**
     * Draw a generic overlay message on top of the canvas. This helper is
     * flexible enough to render pause screens, respawn countdowns or any
     * arbitrary message by configuring its appearance. It first draws a
     * semi-transparent backdrop and then the message on top.
     *
     * @param {string} message The text to render.
     * @param {Object} options Rendering options.
     * @param {number} [options.opacity=0.3] Background opacity (0–1).
     * @param {string} [options.bgColor="#000"] Background fill colour.
     * @param {string} [options.color="#fff"] Text colour.
     * @param {string} [options.font="bold 30px sans-serif"] Font style for text.
     * @param {string} [options.textAlign="center"] Canvas textAlign setting.
     * @param {string} [options.textBaseline="middle"] Canvas textBaseline setting.
     * @param {number} [options.offsetY=0] Y offset applied to the message.
     */
    drawOverlayMessage(message, options = {}) {
      const ctx = this.ctx;
      const {
        opacity = 0.3,
        bgColor = "#000",
        color = "#fff",
        font = window.isMobile ? "bold 20px sans-serif" : "bold 30px sans-serif",
        textAlign = "center",
        textBaseline = "middle",
        offsetY = 0,
      } = options;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = textAlign;
      ctx.textBaseline = textBaseline;
      ctx.fillText(
        message,
        this.canvas.width / 2,
        this.canvas.height / 2 + offsetY,
      );
      ctx.restore();
    }
    /**
     * Draw a glowing red border and label indicating super mode is active.
     * The border and label emphasise the player's enhanced state. This
     * method should be called after the world has been drawn.
     */
    drawSuperModeIndicator() {
      const ctx = this.ctx;
      ctx.save();
      ctx.shadowColor = "rgba(255, 0, 0, 0.8)";
      ctx.shadowBlur = 20;
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#ffffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("SUPER MODE: ON", this.canvas.width - 20, 20);
      ctx.restore();
    }
  };

  // core/managers/EventManager.js
  var EventManager = class {
    constructor(game) {
      this.game = game;
      const canvas = game.canvas;
      this.requestFullscreen();
      window.addEventListener("keydown", (e) => {
        if (e.key === "p" || e.key === "P") {
          game.stateManager.togglePause();
        }
        if (e.key === "Escape") {
          this.exitFullscreen();
        }
      });
      canvas.addEventListener(
        "wheel",
        (e) => {
          if (game.input && game.input.keys && game.input.keys[" "]) {
            e.preventDefault();
            const deltaY = e.deltaY;
            const world = game.world;
            const newY = world.camera.y + deltaY;
            const maxOffset = world.bounds.maxY - canvas.height;
            world.camera.y = clamp(newY, world.bounds.minY, maxOffset);
          }
        },
        { passive: false },
      );
      canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (typeof game.activateSpecialWeapon === "function") {
          game.activateSpecialWeapon(e);
        }
      });
      document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) {
          console.log("\uC804\uCCB4\uD654\uBA74 \uD574\uC81C\uB428");
        }
      });
    }
    // --- 전체화면 요청 ---
    async requestFullscreen() {
      if (this.game.isMobile) return;   // ← 모바일에서는 전체화면 안 함
      const elem = this.game.canvas.parentElement || document.documentElement;
      if (!document.fullscreenElement) {
        try { await elem.requestFullscreen(); } catch (err) {}
      }
    }
    // --- 전체화면 해제 ---
    async exitFullscreen() {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
          console.log("\uC804\uCCB4\uD654\uBA74 \uD574\uC81C\uB428");
        } catch (err) {
          console.warn(
            "\uC804\uCCB4\uD654\uBA74 \uD574\uC81C \uC2E4\uD328:",
            err,
          );
        }
      }
    }
  };

  // core/managers/GameStateManager.js
  var GameStateManager = class {
    /**
     * @param {import('../Game.js').Game} game A reference to the main game.
     */
    constructor(game) {
      this.game = game;
    }
    /**
     * Toggle the pause state of the game. Pausing stops the game loop
     * updates and pauses background music. Resuming restarts music and
     * updates if the world isn't over.
     */
    togglePause() {
      const game = this.game;
      game.running = !game.running;
      if (game.running && !game.world.gameOver) {
        game.bgm.play();
      } else {
        game.bgm.pause();
      }
    }
    /**
     * Pause the game without toggling. Used when the window loses focus.
     */
    pauseGame() {
      const game = this.game;
      if (game.running) {
        game.running = false;
        game.bgm.pause();
      }
    }
    /**
     * Resume the game if it is currently paused and the world hasn't ended.
     */
    resumeGame() {
      const game = this.game;
      if (!game.running && !game.world.gameOver) {
        // Start a 3-second countdown instead of resuming immediately
        game.focusCountdown = CONSTANTS.FOCUS_RESUME_DELAY;
        game.running = false; // Explicitly ensure game stays paused during countdown
      }
    }
    /**
     * Handle the transition into the game over state. This is called once
     * when the world's base health for either team reaches zero. It stops
     * the music, mutes all shooting and hit sound effects, and prepares
     * the ending explosion sequence by spawning the first explosion and
     * positioning the camera.
     */
    handleGameOver() {
      const game = this.game;
      game.bgm.pause();
      if (window.shootSFXPool) {
        for (const audio of window.shootSFXPool.pool) audio.volume = 0;
      }
      if (window.hitSFXPool) {
        for (const audio of window.hitSFXPool.pool) audio.volume = 0;
      }
      game.endingExplosions = {
        timer: 10,
        nextIdx: 0,
        explosions: [],
      };
      const destroyedTeam = game.world.baseHealth.blue <= 0 ? "blue" : "red";
      const base = game.world.basePos[destroyedTeam];
      game.world.camera.targetY = base.y - game.canvas.height / 2;
      const exp = game.world.explosionPool.factory();
      exp.init({ x: base.x, y: base.y, maxRadius: 120 });
      game.endingExplosions.explosions.push(exp);
      deathSFXPool.playSpatial(base.y, game.world.camera.y, 1);
      game.endingExplosions.nextIdx++;
    }
    /**
     * Restart the game by rebuilding the world and player tank, resetting
     * timers and background music. It also fades the BGM back in and
     * unmutes sound effect pools.
     */
    restartGame() {
      const game = this.game;
      // Reset all active projectiles and explosions from previous game
      window.bulletPool.reset();
      window.explosionPool.reset();
      game.world = new World(game.canvas, game.isSuperMode);
      game.input = new InputManager(game.canvas);
      const spawn = game.getPlayerSpawn();
      game.playerRespawnTimer = 0;
      game.playerTank = new Tank(
        spawn.x,
        spawn.y,
        "blue",
        true,
        game.isSuperMode ? true : false,
      );
      game.world.addTank(game.playerTank);
      game.world.spawnWave();
      game.accumulator = 0;
      game.lastTime = performance.now();
      game.endingExplosions = null;
      game.running = true;
      game.bgm.currentTime = 50;
      game.bgm.volume = 0;
      game.bgm.play();
      let vol = 0;
      const fadeIn = setInterval(() => {
        vol += 0.01;
        if (vol >= 1) {
          vol = 1;
          clearInterval(fadeIn);
        }
        game.bgm.volume = vol;
      }, 100);
      if (window.shootSFXPool) {
        for (const audio of window.shootSFXPool.pool) audio.volume = 1;
      }
      if (window.hitSFXPool) {
        for (const audio of window.hitSFXPool.pool) audio.volume = 1;
      }
    }
  };

  // core/Game.js
  var Game = class {
    constructor(canvas, isSuperMode = false) {
      this.canvas = canvas;
      this.isSuperMode = isSuperMode;
      this.restartTimer = 0;
      this.init().then(() => {
        console.log("\u2705 All assets loaded, starting game");
        this.start();
      });
    }
    /**
     * 비동기 초기화
     * - 총알/폭발 스프라이트 사전 로드
     * - World/Input/UI/State/Event 매니저 생성
     * - 플레이어 탱크 생성 및 월드 등록, 초기 웨이브 스폰
     * - 타임스텝 및 루프 제어 변수 초기화
     */
    async init() {
      document.getElementById('pc-instruction').style.display = 'block';
      const tempBullet = new Bullet();
      await tempBullet.initSprite("red");
      await tempBullet.initSprite("blue");
      await Explosion.initSprite();
      this.world = new World(this.canvas, this.isSuperMode);
      this.isMobile = window.isMobile || false;
      this.input = new InputManager(this.canvas, this);
      this.bgm = document.getElementById("bgm");
      this.ui = new UIManager(this.canvas);
      this.stateManager = new GameStateManager(this);
      this.eventManager = new EventManager(this);
      this.endingExplosions = null;
      this.specialWeaponPoint = 5;
      const playerSpawn = this.getPlayerSpawn();
      this.playerRespawnTimer = 0;
      this.playerTank = new Tank(
        playerSpawn.x,
        playerSpawn.y,
        "blue",
        true,
        // isPlayer
        this.isSuperMode,
        // 슈퍼 모드에 따라 파라미터 상이
      );
      this.world.addTank(this.playerTank);
      this.world.spawnWave();
      this.lastTime = 0;
      this.accumulator = 0;
      this.timeStep = CONSTANTS.FIXED_TIMESTEP; // 60 FPS 고정 타임스텝
      this.running = true;
      this.focusCountdown = 0; // Countdown timer when regaining focus
      
      // Add focus/blur event listeners to pause/resume game when tab loses/gains focus
      window.addEventListener("blur", () => {
        this.stateManager.pauseGame();
      });
      window.addEventListener("focus", () => {
        this.stateManager.resumeGame();
      });
    }
    /**
     * 특수 무기(지정 지점 대규모 폭발) 활성화
     * - 마우스 클릭 지점을 월드 좌표로 변환하여 pendingExplosion 등록
     * - 쿨다운/포인트 조건 검사 후 발동
     */
    activateSpecialWeapon(e) {
      const { canvas, world, specialWeaponPoint } = this;
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = e.clientX - rect.left;
      const mouseCanvasY = e.clientY - rect.top;

      const { camera: cam } = world;
      const pending = this.isSuperMode ? 1.0 : 5.0;

      // 쿨다운 중이거나, 이미 예약된 폭발이 있거나, 포인트가 부족하면 즉시 무시
      if (
        world.specialCooldown > 0 ||
        world.pendingExplosion ||
        world.point < specialWeaponPoint
      ) {
        // console.debug("Special weapon blocked (cooldown/pending/insufficient points)");
        return;
      }

      // 마우스 화면 좌표 → 월드 좌표 변환
      const mouseWorldX = mouseCanvasX + cam.x;
      const mouseWorldY = mouseCanvasY + cam.y;

      // 특수 무기 예약 등록 및 자원/쿨다운 처리
      world.pendingExplosion = {
        x: mouseWorldX,
        y: mouseWorldY,
        timer: pending,
      };
      world.specialCooldown = world.specialCoolTime;
      world.point -= specialWeaponPoint;

      // 다음 사용 비용 증가(게임/월드 표기 동기화 유지)
      this.specialWeaponPoint++;
      world.specialWeaponPoint++;
      console.log(`SWP: ${this.specialWeaponPoint}`);
    }
    activateSpecialWeaponMobile(canvasX, canvasY) {
      const { world, specialWeaponPoint } = this;
      const cam = world.camera;
      const mouseWorldX = canvasX + cam.x;
      const mouseWorldY = canvasY + cam.y;
      const pending = this.isSuperMode ? 1.0 : 5.0;

      if (world.specialCooldown > 0 || world.pendingExplosion || world.point < specialWeaponPoint) return;

      world.pendingExplosion = { x: mouseWorldX, y: mouseWorldY, timer: pending };
      world.specialCooldown = world.specialCoolTime;
      world.point -= specialWeaponPoint;
      this.specialWeaponPoint++;
      world.specialWeaponPoint++;
    }
    /**
     * 플레이어 스폰 위치 계산
     * - 아군(블루) 소유 거점 중 전방(화면 상단에 가까운 y가 작은) 거점을 우선
     * - 없으면 본진 위치로 스폰
     */
    getPlayerSpawn() {
      const ownedStrongholds = this.world.strongholds.filter(
        (s) => s.owner === "blue",
      );
      if (ownedStrongholds.length > 0) {
        let frontStronghold = ownedStrongholds[0];
        for (const s of ownedStrongholds) {
          if (s.y < frontStronghold.y) {
            frontStronghold = s;
          }
        }
        return { x: frontStronghold.x, y: frontStronghold.y };
      }
      return { x: this.world.basePos.blue.x, y: this.world.basePos.blue.y };
    }
    /**
     * 게임 루프 시작(브라우저 애니메이션 프레임 사용)
     */
    start() {
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    }
    /**
     * 메인 루프
     * - dt(실시간)으로 누적기를 채우고, 고정 타임스텝으로 update를 여러 번 수행
     * - 엔딩 연출 상태일 땐 카메라 이징/폭발 연쇄/문구 출력 후 타이머 종료 시 재시작
     * - 평시에는 월드 업데이트 → UI 동기화 → 그리기
     */
    loop(now) {
      const dtMs = now - this.lastTime;
      this.lastTime = now;
      const dt = dtMs / 1e3;
      
      // Handle focus countdown timer - keeps game paused during countdown
      if (this.focusCountdown > 0) {
        this.focusCountdown -= dt;
        this.running = false; // Ensure game stays paused during countdown
        if (this.focusCountdown <= 0) {
          this.focusCountdown = 0;
          this.running = true;
          if (this.bgm) {
            this.bgm.play();
          }
        }
      }
      
      if (this.running) {
        this.accumulator += dt;
      }
      if (this.endingExplosions) {
        const destroyedTeam = this.world.baseHealth.blue <= 0 ? "blue" : "red";
        const base = this.world.basePos[destroyedTeam];
        const targetY = base.y - this.world.canvas.height / 2;
        const camera = this.world.camera;
        const distance2 = targetY - camera.y;
        if (Math.abs(distance2) > 0.5) {
          camera.y += distance2 * 0.05;
        } else {
          camera.y = targetY;
        }
        this.endingExplosions.timer -= dt;
        for (const exp of this.endingExplosions.explosions) {
          exp.update(dt);
        }
        this.world.draw();
        const ctx = this.canvas.getContext("2d");
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalAlpha = 1;
        for (const exp of this.endingExplosions.explosions) {
          exp.update(dt);
          exp.draw(ctx, this.world.camera);
        }
        if (
          camera.y == targetY &&
          this.endingExplosions.nextIdx < 7 &&
          this.endingExplosions.timer <= 9 - this.endingExplosions.nextIdx * 0.5
        ) {
          const exp = this.world.explosionPool.factory();
          exp.init({
            x: base.x + (Math.random() - 0.5) * 120,
            y: base.y + (Math.random() - 0.5) * 120,
            maxRadius: 120,
          });
          this.endingExplosions.explosions.push(exp);
          deathSFXPool.playSpatial(base.y, this.world.camera.y, 1);
          this.endingExplosions.nextIdx++;
        }
        ctx.fillStyle = "#fff";
        ctx.font = "bold 64px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let msg = "";
        if (this.world.baseHealth.blue <= 0) msg = "Blue Base Destroyed!";
        if (this.world.baseHealth.red <= 0) msg = "Red Base Destroyed!";
        ctx.fillText(msg, this.canvas.width / 2, this.canvas.height / 2 - 60);
        ctx.fillStyle = "#ffe600";
        ctx.font = "bold 48px sans-serif";
        ctx.fillText(
          `Restarting in ${Math.ceil(this.endingExplosions.timer)}...`,
          this.canvas.width / 2,
          this.canvas.height / 2 + 40,
        );
        ctx.restore();
        if (this.endingExplosions.timer <= 0) {
          this.endingExplosions = null;
          this.restartGame();
        }
        requestAnimationFrame(this.loop.bind(this));
        return;
      }
      if (this.running) {
        while (this.accumulator >= this.timeStep) {
          if (this.playerTank.hp <= 0) {
            if (this.playerRespawnTimer <= 0) {
              this.playerRespawnTimer = CONSTANTS.PLAYER_RESPAWN_TIME;
            } else {
              this.playerRespawnTimer -= this.timeStep;
              if (this.playerRespawnTimer <= 0) {
                const spawn = this.getPlayerSpawn();
                this.playerTank.x = spawn.x;
                this.playerTank.y = spawn.y;
                this.playerTank.hp = this.isSuperMode ? 300 : 125;
                this.playerTank.angle = -Math.PI / 2;
                this.playerTank.turretAngle = -Math.PI / 2;
                this.playerRespawnTimer = 0;
              }
            }
          }
          this.world.update(this.timeStep, this.input);
          this.accumulator -= this.timeStep;
        }
      }
      this.ui.updateScoreboard(
        this.world.killcount.blue,
        this.world.killcount.red,
        this.world.killcount.player,
      );
      this.ui.updatePoint(this.world.point);
      this.ui.updateSpecialWeaponBar(
        this.world.specialCooldown,
        this.world.specialCoolTime,
        this.world.specialWeaponPoint,
      );
      this.world.draw();
      if (this.focusCountdown > 0) {
        // Draw focus countdown timer
        this.ui.drawOverlayMessage(
          `Resuming in ${Math.ceil(this.focusCountdown)}...`,
          { opacity: 0.8, color: "#ff6b6b", font: "bold 72px sans-serif", textBaseline: "middle" },
        );
      } else if (!this.running && !this.world.gameOver) {
        this.ui.drawOverlayMessage("PAUSED", {
          opacity: 0.2,
          textBaseline: "top",
        });
      } else {
        if (this.isSuperMode) {
          this.ui.drawSuperModeIndicator();
        }
        if (this.playerTank.hp <= 0 && this.playerRespawnTimer > 0) {
          this.ui.drawOverlayMessage(
            `Respawning in ${Math.ceil(this.playerRespawnTimer)}...`,
            { opacity: 0.7, color: "#ffe600", font: isMobile ? "bold 32px sans-serif" : "bold 64px sans-serif" },
          );
        }
        if (this.world.gameOver && !this.endingExplosions) {
          this.stateManager.handleGameOver();
        }
      }
      requestAnimationFrame(this.loop.bind(this));
    }
    /**
     * 게임 재시작
     * - 실제 재시작 로직은 GameStateManager로 위임
     */
    restartGame() {
      if (this.stateManager) {
        this.stateManager.restartGame();
      }
    }
  };

  // utils/AudioPool.js
  var AudioPool = class {
    /**
     * @param {string[]} srcList 오디오 파일 경로 목록
     * @param {number} [size=20] 풀 크기(동시 재생 최대 수에 영향)
     */
    constructor(srcList, size = 20) {
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
  };

  // utils/pool.js
  var Pool = class {
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
  };
  // ==============================
// Virtual Joystick (모바일 전용)
// ==============================
var VirtualJoystick = class {
  constructor(elementId, onMove, onEnd) {
    this.element = document.getElementById(elementId);
    this.knob = this.element.querySelector('.joystick-knob');
    this.onMove = onMove;
    this.onEnd = onEnd;
    this.active = false;
    this.baseX = 0; this.baseY = 0;
    this.maxDist = 55;
    this.setup();
  }
  setup() {
    this.element.addEventListener('touchstart', e => { e.preventDefault(); this.start(e); }, { passive: false });
    this.element.addEventListener('touchmove', e => { e.preventDefault(); this.move(e); }, { passive: false });
    this.element.addEventListener('touchend', e => { e.preventDefault(); this.end(e); });
    this.element.addEventListener('touchcancel', e => { e.preventDefault(); this.end(e); });
  }
  start(e) {
    this.active = true;
    const touch = e.changedTouches[0];
    this.touchId = touch.identifier;
    this.baseX = touch.clientX;
    this.baseY = touch.clientY;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }
  move(e) {
    if (!this.active) return;
    for (let touch of e.changedTouches) {
      if (touch.identifier === this.touchId) {
        this.update(touch);
        break;
      }
    }
  }
  end(e) {
    if (!this.active) return;
    for (let touch of e.changedTouches) {
      if (touch.identifier === this.touchId) {
        this.active = false;
        this.knob.style.transform = 'translate(-50%, -50%)';
        if (this.onEnd) this.onEnd();
        this.touchId = null;
        break;
      }
    }
  }
  update(touch) {
    const dx = touch.clientX - this.baseX;
    const dy = touch.clientY - this.baseY;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const limited = Math.min(dist, this.maxDist);
    const nx = Math.cos(angle) * limited;
    const ny = Math.sin(angle) * limited;
    this.knob.style.transform = `translate(${nx}px, ${ny}px)`;
    const normX = limited > 0 ? nx / this.maxDist : 0;
    const normY = limited > 0 ? ny / this.maxDist : 0;
    if (this.onMove) this.onMove(normX, normY);
  }
};
  // main.js
  var shootSFXPool = new AudioPool(
    [
      "./assets/Shoot_1.wav",
      "./assets/Shoot_2.wav",
      "./assets/Shoot_3.wav",
      "./assets/Shoot_4.wav",
      "./assets/Shoot_5.wav",
    ],
    120,
  );
  var deathSFXPool = new AudioPool(
    [
      "./assets/Explosion_1.wav",
      "./assets/Explosion_2.wav",
      "./assets/Explosion_3.wav",
      "./assets/Explosion_4.wav",
    ],
    50,
  );
  var turretSFXPool = new AudioPool(["./assets/Turret.wav"], 20);
  var bulletPool = new Pool(() => new Bullet(), 200);
  var explosionPool = new Pool(() => new Explosion(), 50);
  window.shootSFXPool = shootSFXPool;
  window.deathSFXPool = deathSFXPool;
  window.turretSFXPool = turretSFXPool;
  window.bulletPool = bulletPool;
  window.explosionPool = explosionPool;
  async function preloadSprites() {
    await Bullet.prototype.initSprite("red");
    await Bullet.prototype.initSprite("blue");
    await Explosion.initSprite();
    await Tank.loadSprite("PATH TO TANK SPRITE");
  }
  window.addEventListener("DOMContentLoaded", async () => {
    const canvas = document.getElementById("gameCanvas");
    let game,
      gameStarted = false;
    let gameReady = false;
    const ctx = canvas.getContext("2d");
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (game) {
        game.world.bounds.maxX = canvas.width;
      }
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    function drawLoadingScreen(progress) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      const fontSize = isMobile ? 32 : 64;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        "Loading Assets...",
        canvas.width / 2,
        canvas.height / 2 - (isMobile ? 20 : 40),
      );
      ctx.fillStyle = "#333";
      const barWidth = isMobile ? 200 : 400,
        barHeight = isMobile ? 10 : 20;
      ctx.fillRect(
        canvas.width / 2 - barWidth / 2,
        canvas.height / 2,
        barWidth,
        barHeight,
      );
      ctx.fillStyle = "white";
      ctx.fillRect(
        canvas.width / 2 - barWidth / 2,
        canvas.height / 2,
        barWidth * (progress / 100),
        barHeight,
      );
    }
    drawLoadingScreen(0);
    await preloadSprites();
    let loadingProgress = 0;
    const loadingInterval = setInterval(() => {
      loadingProgress += 2.5;
      drawLoadingScreen(loadingProgress);
      if (loadingProgress >= 100) {
        clearInterval(loadingInterval);
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (isMobile) {
          document.getElementById('start-buttons').style.display = 'block';
        } else {
          ctx.fillStyle = "#ffe600";
          ctx.font = "bold 64px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(
            "Press SPACE to Start",
            canvas.width / 2,
            canvas.height / 2,
          );
          ctx.fillStyle = "gray";
          ctx.font = "24px sans-serif";
          ctx.fillText(
            "Press ENTER to Enter Super Mode",
            canvas.width / 2,
            canvas.height / 2 + 60,
          );
        }
        gameReady = true;
      }
    }, 100);
    // Button events for mobile
    document.getElementById('normal-mode').addEventListener('click', () => {
      if (!gameStarted && gameReady) {
        gameStarted = true;
        game = new Game(canvas, false);
        document.getElementById('start-buttons').style.display = 'none';
        const bgm = document.getElementById("bgm");
        if (bgm) {
          bgm.currentTime = 0;
          bgm.volume = 0;
          bgm.play();
          let vol = 0;
          const fadeIn = setInterval(() => {
            vol += 0.01;
            if (vol >= 1) {
              vol = 1;
              clearInterval(fadeIn);
            }
            bgm.volume = vol;
          }, 100);
        }
      }
    });
    document.getElementById('super-mode').addEventListener('click', () => {
      if (!gameStarted && gameReady) {
        gameStarted = true;
        game = new Game(canvas, true);
        document.getElementById('start-buttons').style.display = 'none';
        const bgm = document.getElementById("bgm");
        if (bgm) {
          bgm.currentTime = 0;
          bgm.volume = 0;
          bgm.play();
          let vol = 0;
          const fadeIn = setInterval(() => {
            vol += 0.01;
            if (vol >= 1) {
              vol = 1;
              clearInterval(fadeIn);
            }
            bgm.volume = vol;
          }, 100);
        }
      }
    });
    window.addEventListener("keydown", (e) => {
      if (
        !gameStarted &&
        gameReady &&
        (e.code === "Space" || e.code === "Enter")
      ) {
        gameStarted = true;
        game = e.code === "Enter" ? new Game(canvas, true) : new Game(canvas);
        const bgm = document.getElementById("bgm");
        if (bgm) {
          // bgm.currentTime = 51.5;
          bgm.currentTime = 0;
          bgm.volume = 0;
          bgm.play();
          let vol = 0;
          const fadeIn = setInterval(() => {
            vol += 0.01;
            if (vol >= 1) {
              vol = 1;
              clearInterval(fadeIn);
            }
            bgm.volume = vol;
          }, 100);
        }
      }
    });
  });
})();
