(() => {
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
      this.damage = 25;
      this.radius = 3;
      this.lifetime = 1.5;
      this.age = 0;
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
      const pathMap = {
        red: "../assets/sprites/bullets/projectile_red.png",
        blue: "../assets/sprites/bullets/projectile_blue.png"
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
    init({ x, y, vx, vy, team, damage, isPlayerBullet, radius }) {
      this.active = true;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.team = team;
      this.isPlayerBullet = isPlayerBullet;
      this.damage = damage ?? 25;
      this.radius = radius ?? 3;
      this.age = 0;
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
      const angle = Math.atan2(this.vy, this.vx);
      const scale = this.isLarge ? 1.5 : 1;
      const size = this.radius * 16 * scale;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
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
      this.lifetime = 1;
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
      await new Promise((res) => img.onload = res);
      _Explosion.sprite = await createImageBitmap(img);
      console.log("\u2705 Explosion sprite loaded");
    }
    /**
     * 폭발 인스턴스 초기화
     * - 위치/최대 반경/나이/투명도/스케일 초기화
     */
    init({ x, y, maxRadius = 50 }) {
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
        size
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
    const finalPredictedX = shooter.x + (predictedX - shooter.x) * leadMultiplier;
    const finalPredictedY = shooter.y + (predictedY - shooter.y) * leadMultiplier;
    return Math.atan2(finalPredictedY - shooter.y, finalPredictedX - shooter.x);
  }

  // ai/AIController.js
  function handleTankAI(tank, dt, world) {
    if (tank.isAce) {
      handleAceTankAI(tank, dt, world);
      return;
    }
    const forwardDir = tank.team === "blue" ? -1 : 1;
    const moveSpeed = tank.speed;
    if (tank.strafeDir == null) tank.strafeDir = Math.random() < 0.5 ? -1 : 1;
    if (tank.strafeTimer === void 0) {
      tank.strafeTimer = 0.5 + Math.random() * 1.5;
    } else {
      tank.strafeTimer -= dt;
      if (tank.strafeTimer <= 0) {
        tank.strafeDir = Math.random() < 0.5 ? -1 : 1;
        tank.strafeTimer = 0.5 + Math.random() * 1.5;
      }
    }
    if (tank.orbitDir == null) tank.orbitDir = Math.random() < 0.5 ? 1 : -1;
    if (tank.orbitSwitchTimer === void 0) {
      tank.orbitSwitchTimer = 1 + Math.random() * 2;
    } else {
      tank.orbitSwitchTimer -= dt;
      if (tank.orbitSwitchTimer <= 0) {
        tank.orbitDir *= -1;
        tank.orbitSwitchTimer = 1 + Math.random() * 2;
      }
    }
    const targets = world.tanks.filter((t) => t.team !== tank.team && t.hp > 0);
    for (const s of world.strongholds) {
      if (s.hp > 0 && s.owner !== tank.team) {
        targets.push({ x: s.x, y: s.y, isStronghold: true, vx: 0, vy: 0 });
      }
    }
    const enemyBase = world.basePos[tank.team === "blue" ? "red" : "blue"];
    targets.push({ x: enemyBase.x, y: enemyBase.y, isBase: true, vx: 0, vy: 0 });
    let nearest = null;
    let distToTarget = Infinity;
    if (targets.length > 0) {
      targets.sort((a, b) => distance(a, tank) - distance(b, tank));
      nearest = targets[0];
      distToTarget = distance(nearest, tank);
    }
    let moveX = 0, moveY = 0;
    const DESIRED_MIN = 250;
    const DESIRED_MAX = 350;
    const ENGAGE_MAX = 450;
    const ORBIT_FACTOR = 0.75;
    const RADIAL_GAIN = 0.45;
    const RADIAL_CAP = moveSpeed * 0.6;
    if (nearest && distToTarget <= ENGAGE_MAX) {
      const dx = nearest.x - tank.x;
      const dy = nearest.y - tank.y;
      const dist = Math.max(Math.hypot(dx, dy), 1e-4);
      const rx = dx / dist;
      const ry = dy / dist;
      const tx = tank.orbitDir * -ry;
      const ty = tank.orbitDir * rx;
      moveX = tx * moveSpeed * ORBIT_FACTOR;
      moveY = ty * moveSpeed * ORBIT_FACTOR;
      let radial = 0;
      if (dist < DESIRED_MIN) {
        const err = (DESIRED_MIN - dist) / DESIRED_MIN;
        radial = -Math.min(RADIAL_CAP, moveSpeed * RADIAL_GAIN * err);
      } else if (dist > DESIRED_MAX) {
        const err = (dist - DESIRED_MAX) / DESIRED_MAX;
        radial = Math.min(RADIAL_CAP, moveSpeed * RADIAL_GAIN * err);
      }
      moveX += rx * radial;
      moveY += ry * radial;
      if (moveX !== 0 || moveY !== 0) {
        tank.angle = Math.atan2(moveY, moveX);
      }
    } else if (nearest && distToTarget <= 1e3) {
      const dx = nearest.x - tank.x;
      const dy = nearest.y - tank.y;
      const chaseAngle = Math.atan2(dy, dx);
      tank.angle = chaseAngle;
      moveX = Math.cos(chaseAngle) * moveSpeed + tank.strafeDir * moveSpeed * 0.3;
      moveY = Math.sin(chaseAngle) * moveSpeed;
    } else {
      tank.angle = forwardDir === -1 ? -Math.PI / 2 : Math.PI / 2;
      moveY = forwardDir * moveSpeed;
      moveX = (tank.strafeDir || 1) * moveSpeed * 0.4;
    }
    tank.x += moveX * dt;
    tank.y += moveY * dt;
    if (nearest) {
      if (!nearest.isStronghold && !nearest.isBase) {
        tank.turretAngle = getLeadAngle(tank, nearest, 400);
      } else {
        tank.turretAngle = Math.atan2(nearest.y - tank.y, nearest.x - tank.x);
      }
      if (distance(nearest, tank) < 500) {
        tank.tryShoot(world);
      }
    }
  }
  function handleAceTankAI(tank, dt, world) {
    const targets = world.tanks.filter((t) => t.team !== tank.team && t.hp > 0);
    for (const s of world.strongholds) {
      if (s.hp > 0 && s.owner !== tank.team) {
        targets.push({ x: s.x, y: s.y, isStronghold: true, vx: 0, vy: 0 });
      }
    }
    const enemyBase = world.basePos[tank.team === "blue" ? "red" : "blue"];
    targets.push({ x: enemyBase.x, y: enemyBase.y, isBase: true, vx: 0, vy: 0 });
    let nearest = null;
    let distToTarget = Infinity;
    if (targets.length > 0) {
      targets.sort((a, b) => distance(a, tank) - distance(b, tank));
      nearest = targets[0];
      distToTarget = distance(nearest, tank);
    }
    if (tank.orbitDir == null) tank.orbitDir = Math.random() < 0.5 ? 1 : -1;
    if (tank.orbitSwitchTimer === void 0) {
      tank.orbitSwitchTimer = 2 + Math.random() * 3;
    } else {
      tank.orbitSwitchTimer -= dt;
      if (tank.orbitSwitchTimer <= 0) {
        tank.orbitDir *= -1;
        tank.orbitSwitchTimer = 2 + Math.random() * 3;
      }
    }
    const allies = world.tanks.filter((t) => t.team === tank.team && t !== tank && t.hp > 0);
    let allyRepulsion = { x: 0, y: 0 };
    for (const ally of allies) {
      const dx = tank.x - ally.x;
      const dy = tank.y - ally.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200) {
        const repulsion = (200 - dist) / 200;
        allyRepulsion.x += dx / dist * repulsion * tank.speed;
        allyRepulsion.y += dy / dist * repulsion * tank.speed;
      }
    }
    let dodgeX = 0, dodgeY = 0;
    let threatLevel = 0;
    const bulletGroups = {};
    for (const bullet of world.bulletPool.pool) {
      if (!bullet.active || bullet.team === tank.team) continue;
      const dx = tank.x - bullet.x;
      const dy = tank.y - bullet.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 150) continue;
      const bulletDir = Math.atan2(bullet.vy, bullet.vx);
      const toTankDir = Math.atan2(dy, dx);
      const angleDiff = Math.abs(bulletDir - toTankDir);
      if (dist < 350 && angleDiff < Math.PI / 8) {
        const groupDir = Math.round(bulletDir / (Math.PI / 6)) * (Math.PI / 6);
        if (!bulletGroups[groupDir]) {
          bulletGroups[groupDir] = {
            count: 0,
            // 그룹 내 탄 개수
            totalDist: 0,
            // 평균 거리 산출용 누적
            closest: dist,
            // 가장 가까운 탄 거리
            dir: bulletDir
            // 대표 방향(최근 탄 방향)
          };
        }
        bulletGroups[groupDir].count++;
        bulletGroups[groupDir].totalDist += dist;
        bulletGroups[groupDir].closest = Math.min(bulletGroups[groupDir].closest, dist);
      }
    }
    let mostDangerousGroup = null;
    let highestThreat = 0;
    for (const groupDir in bulletGroups) {
      const group = bulletGroups[groupDir];
      const avgDist = group.totalDist / group.count;
      const threat = (group.count * 0.5 + 0.5) * (1 - avgDist / 350);
      if (threat > highestThreat) {
        highestThreat = threat;
        mostDangerousGroup = group;
      }
    }
    if (mostDangerousGroup) {
      threatLevel = highestThreat;
      const bulletDir = mostDangerousGroup.dir;
      const horizontal = Math.abs(Math.sin(bulletDir)) < 0.5;
      if (horizontal) {
        const upBlocked = Object.values(bulletGroups).some(
          (g) => Math.abs(g.dir - Math.PI / 2) < Math.PI / 4
        );
        dodgeY = (upBlocked ? 1 : -1) * tank.speed;
      } else {
        const dodgeAngle = bulletDir + Math.PI / 2;
        dodgeX = Math.cos(dodgeAngle) * tank.speed;
        dodgeY = Math.sin(dodgeAngle) * tank.speed;
      }
    }
    let moveX = 0, moveY = 0;
    const DESIRED_MIN = 300;
    const DESIRED_MAX = 400;
    const ENGAGE_MAX = 500;
    const ORBIT_FACTOR = 1;
    if (nearest && distToTarget <= ENGAGE_MAX) {
      const dx = nearest.x - tank.x;
      const dy = nearest.y - tank.y;
      const dist = Math.max(Math.hypot(dx, dy), 1e-4);
      const rx = dx / dist;
      const ry = dy / dist;
      const tx = tank.orbitDir * -ry;
      const ty = tank.orbitDir * rx;
      moveX = tx * tank.speed * ORBIT_FACTOR;
      moveY = ty * tank.speed * ORBIT_FACTOR;
      if (dist < DESIRED_MIN) {
        moveX -= rx * tank.speed * 0.5;
        moveY -= ry * tank.speed * 0.5;
      } else if (dist > DESIRED_MAX) {
        moveX += rx * tank.speed * 0.3;
        moveY += ry * tank.speed * 0.3;
      }
      tank.angle = Math.atan2(moveY, moveX);
    } else if (nearest) {
      const dx = nearest.x - tank.x;
      const dy = nearest.y - tank.y;
      const angle = Math.atan2(dy, dx);
      moveX = Math.cos(angle) * tank.speed * 0.8;
      moveY = Math.sin(angle) * tank.speed * 0.8;
      tank.angle = angle;
    }
    if (threatLevel > 0) {
      tank.x += (dodgeX + allyRepulsion.x * 0.5) * dt;
      tank.y += (dodgeY + allyRepulsion.y * 0.5) * dt;
    } else {
      tank.x += (moveX + allyRepulsion.x) * dt;
      tank.y += (moveY + allyRepulsion.y) * dt;
    }
    if (nearest) {
      const predictedAngle = getLeadAngle(tank, nearest, 200);
      tank.turretAngle = predictedAngle;
      if (distToTarget < 550) {
        tank.tryShoot(world);
      }
    }
  }

  // entities/Tank.js
  var Tank = class {
    constructor(x, y, team, isPlayer = false, supertank = false) {
      this.x = x;
      this.y = y;
      this.team = team;
      this.isPlayer = isPlayer;
      this.angle = 300;
      this.turretAngle = 0;
      this.speed = supertank ? 300 : 100;
      this.hp = supertank ? 500 : 125;
      this.radius = 14;
      this.fireCooldown = 0;
      this.reloadTime = supertank ? 0.05 : 0.5;
      this.target = null;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = Math.random() * 1;
      this.supertank = supertank;
      this.vx = 0;
      this.vy = 0;
      this.bulletCount = 1;
    }
    /**
     * 업그레이드(탄 수 증가)에 따른 스펙 반영
     * - bulletCount: 플레이어 5발, 에이스/AI 4발, 기본 1발
     * - reloadTime: 발사 수 증가만큼 총 발사주기를 늘려 DPS 과도 상승 방지
     */
    applyUpgrade(upgradeBulletCount) {
      this.bulletCount = upgradeBulletCount ? this.isPlayer ? 5 : 4 : 1;
      this.reloadTime = (this.supertank ? 0.05 : 0.5) * (upgradeBulletCount ? 5 : 1);
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
      this.x = clamp(this.x, world.bounds.minX + this.radius, world.bounds.maxX - this.radius);
      this.y = clamp(this.y, world.bounds.minY + this.radius, world.bounds.maxY - this.radius);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.92;
      this.vy *= 0.92;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      if (Math.abs(this.vy) < 0.1) this.vy = 0;
    }
    /**
     * 플레이어 입력 처리
     * - WASD/화살표 이동(스크린 기준), 대각선 정규화
     * - 마우스 위치로 포탑 조준(캔버스→월드 좌표 변환)
     * - 좌클릭 지속 발사
     */
    handlePlayerInput(dt, world, input) {
      const keys = input.keys;
      let dx = 0, dy = 0;
      if (keys["w"] || keys["arrowup"]) dy -= 1;
      if (keys["s"] || keys["arrowdown"]) dy += 1;
      if (keys["a"] || keys["arrowleft"]) dx -= 1;
      if (keys["d"] || keys["arrowright"]) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;
        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        this.angle = Math.atan2(dy, dx);
      }
      const cam = world.camera;
      const mouseWorldX = input.mouse.canvasX + cam.x;
      const mouseWorldY = input.mouse.canvasY + cam.y;
      this.turretAngle = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);
      if (input.mouse.down) {
        this.tryShoot(world, this.bulletCount);
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
      const bulletSpeed = 400;
      const maxSpread = Math.PI / 36;
      const uniformSpreadAngle = Math.PI / 10;
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
          x: this.x + Math.cos(angle) * (this.radius + 6),
          y: this.y + Math.sin(angle) * (this.radius + 6),
          vx,
          vy,
          team: this.team,
          isPlayerBullet: this.isPlayer
        });
      }
      shootSFXPool.playSpatial(this.y, world.camera.y, 0.4);
      this.fireCooldown = this.reloadTime;
    }
    /**
     * 렌더링
     * - 차체/포탑/HP바 등 그리기(카메라 오프셋 고려)
     */
    draw(ctx, camera) {
      if (this.hp <= 0) return;
      const screenX = this.x - camera.x;
      const screenY = this.y - camera.y;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.shadowBlur = 15;
      ctx.shadowColor = this.isPlayer ? "rgba(255, 230, 0, 0.8)" : this.isAce ? "rgba(255, 0, 255, 0.8)" : this.team === "blue" ? "rgba(92, 179, 255, 0.8)" : "rgba(255, 106, 106, 0.8)";
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      if (this.isPlayer) {
        ctx.fillStyle = "#ffe600ff";
      } else if (this.isAce) {
        ctx.fillStyle = "#ff00ff";
      } else {
        ctx.fillStyle = this.team === "blue" ? "#5cb3ff" : "#ff6a6a";
      }
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.rotate(this.turretAngle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(this.radius + 10, 0);
      ctx.lineWidth = 6;
      ctx.strokeStyle = this.isPlayer ? "#fffed4ff" : this.team === "blue" ? "#a3d1ff" : "#ffa3a3";
      ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 0;
      const maxHP = this.supertank ? 500 : 125;
      const barWidth = 40;
      const barHeight = 4;
      const barX = screenX - barWidth / 2;
      const barY = screenY - this.radius - 18;
      ctx.fillStyle = "#000";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      const hpRatio = this.hp / maxHP;
      ctx.fillStyle = hpRatio > 0.6 ? "rgba(76, 193, 76, 1)" : hpRatio > 0.3 ? "rgba(200, 200, 71, 1)" : "rgba(204, 63, 63, 1)";
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
    constructor(x, y, team, damage = 50) {
      this.x = x;
      this.y = y;
      this.team = team;
      this.damage = damage;
      this.fireCooldown = 0;
      this.reloadTime = 0.6;
      this.radius = 24;
      this.targetAngle = -Math.PI / 2;
      this.projectileRadius = 8;
      this.projectileSpeed = 600;
      this.range = 800;
    }
    /**
     * 업그레이드 반영
     * - 외부(World.applyUpgrades)에서 호출되어 포탑 화력 조정
     */
    applyUpgrade(upgradeTurret) {
      this.damage = upgradeTurret ? 125 : 75;
    }
    /**
     * 프레임별 갱신
     * - 가장 가까운 적 탱크 탐색 → 리드샷 각도 계산 → 사거리 내면 발사
     * - 발사 쿨다운 감소
     */
    update(dt, world) {
      const enemies = world.tanks.filter((t) => t.team !== this.team && t.hp > 0);
      if (enemies.length > 0) {
        enemies.sort((a, b) => distance(a, this) - distance(b, this));
        const target = enemies[0];
        this.targetAngle = getLeadAngle(this, target, this.projectileSpeed);
        if (distance(target, this) < this.range) {
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
      const spread = (Math.random() - 0.5) * (Math.PI / 30);
      const angle = this.targetAngle + spread;
      const vx = Math.cos(angle) * this.projectileSpeed;
      const vy = Math.sin(angle) * this.projectileSpeed;
      world.bulletPool.spawn({
        x: this.x + Math.cos(angle) * (this.radius + this.projectileRadius),
        y: this.y + Math.sin(angle) * (this.radius + this.projectileRadius),
        vx,
        vy,
        team: this.team,
        damage: this.damage,
        radius: this.projectileRadius
      });
      turretSFXPool.playSpatial(this.y, world.camera.y, 0.9, 1500);
      this.fireCooldown = this.reloadTime;
    }
    /**
     * 단순한 실루엣 렌더링(포신)
     * - 베이스나 섀도우 등은 생략하고 포신만 그려 간결하게 표현
     */
    draw(ctx, camera) {
      const screenX = this.x - camera.x;
      const screenY = this.y - camera.y;
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
        maxY: 6e3
      };
      this.camera = { x: 0, y: 0 };
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
      this.spawnInterval = 3;
      this.maxTanksPerTeam = 24;
      this.isSuperMode = isSuperMode;
      this.point = this.isSuperMode ? 999999 : 10;
      this.pointDisplay = null;
      this.upgradeBulletCount = false;
      this.upgradeBulletCountCost = 7;
      this.upgradeTurret = false;
      this.upgradeTurretCost = 7;
      const bulletBtn = document.getElementById("upgradeBulletBtn");
      const turretBtn = document.getElementById("upgradeTurretBtn");
      let bulletUpgradeActive = false;
      let turretUpgradeActive = false;
      bulletBtn.addEventListener("click", () => {
        if (this.point < this.upgradeBulletCountCost) {
          return;
        } else {
          this.point -= this.upgradeBulletCountCost;
          this.upgradeBulletCountCost++;
          this.upgradeBulletCount = !this.upgradeBulletCount;
          if (!bulletUpgradeActive) {
            bulletUpgradeActive = true;
            bulletBtn.classList.add("active");
            bulletBtn.textContent = `Cancel Bullet Upgrade [${this.upgradeBulletCountCost}Point]`;
          } else {
            bulletUpgradeActive = false;
            bulletBtn.classList.remove("active");
            bulletBtn.textContent = `Bullet Upgrade [${this.upgradeBulletCountCost}Point]`;
          }
          this.applyUpgrades();
        }
      });
      turretBtn.addEventListener("click", () => {
        if (this.point < this.upgradeTurretCost) {
          return;
        } else {
          this.point -= this.upgradeTurretCost;
          this.upgradeTurretCost++;
          this.upgradeTurret = !this.upgradeTurret;
          if (!turretUpgradeActive) {
            turretUpgradeActive = true;
            turretBtn.classList.add("active");
            turretBtn.textContent = `Cancel Turret Upgrade [${this.upgradeTurretCost}Point]`;
          } else {
            turretUpgradeActive = false;
            turretBtn.classList.remove("active");
            turretBtn.textContent = `Turret Upgrade [${this.upgradeTurretCost}Point]`;
          }
          this.applyUpgrades();
        }
      });
      this.killcount = { player: 0, blue: 0, red: 0 };
      this.redTeamKillDisplay = null;
      this.blueTeamKillDisplay = null;
      this.myKillDisplay = null;
      this.defaultBaseHealth = 5e3;
      this.baseHealth = { blue: this.defaultBaseHealth, red: this.defaultBaseHealth };
      this.basePos = {
        // 파랑 본진: 맵 하단 근처
        blue: { x: canvas.width / 2, y: this.bounds.maxY - 200 },
        // 빨강 본진: 맵 상단 근처
        red: { x: canvas.width / 2, y: this.bounds.minY + 200 }
      };
      this.strongholds = [
        { x: canvas.width / 2, y: this.bounds.maxY * 0.2, hp: 1e3, owner: null },
        { x: canvas.width / 2, y: this.bounds.maxY * 0.4, hp: 1e3, owner: null },
        { x: canvas.width / 2, y: this.bounds.maxY * 0.6, hp: 1e3, owner: null },
        { x: canvas.width / 2, y: this.bounds.maxY * 0.8, hp: 1e3, owner: null }
      ];
      this.turrets = [];
      this.turrets.push(new Turret(this.basePos.blue.x, this.basePos.blue.y, "blue", 75));
      this.turrets.push(new Turret(this.basePos.red.x, this.basePos.red.y, "red", 75));
      this.gameOver = false;
      this.aceTankSpawned = false;
      this.aceRespawnTimer = 0;
      this.aceTanksSpawned = 0;
      this.maxAceTanks = 2;
      this.specialCooldown = 0;
      this.specialCoolTime = this.isSuperMode ? 1 : 30;
      this.pendingExplosion = null;
      this.specialWeaponText = null;
      this.specialWeaponPoint = 5;
    }
    /**
     * 현재 업그레이드 상태를 모든 유닛/포탑에 적용
     * - 런타임 중 업그레이드가 발생할 수 있으므로 주기적으로/트리거 시 호출
     */
    applyUpgrades() {
      for (const tank of this.tanks) {
        if (tank.isPlayer || tank.isAce) tank.applyUpgrade(this.upgradeBulletCount);
      }
      for (const turret of this.turrets) {
        turret.applyUpgrade(this.upgradeTurret);
      }
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
        this.camera.x = clamp(player.x - cw / 2, this.bounds.minX, this.bounds.maxX - cw);
        this.camera.y = clamp(player.y - ch / 2, this.bounds.minY, this.bounds.maxY - ch) - 100;
      }
      if (this.baseHealth.blue <= 0 || this.baseHealth.red <= 0) {
        this.gameOver = true;
      }
      for (const turret of this.turrets) {
        turret.update(dt, this);
      }
      const deadAces = this.tanks.filter((t) => t.isAce && t.hp <= 0);
      for (const ace of deadAces) {
        if (ace.respawnTimer === void 0) {
          ace.respawnTimer = 5;
        } else {
          ace.respawnTimer -= dt;
          if (ace.respawnTimer <= 0) {
            const spawn = this.getSpawnPoint("red");
            ace.x = spawn.x + (Math.random() - 0.5) * 80;
            ace.y = spawn.y + (Math.random() - 0.5) * 40;
            ace.hp = 125;
            ace.angle = Math.PI / 2;
            ace.turretAngle = Math.PI / 2;
            ace.respawnTimer = void 0;
          }
        }
      }
      if (this.specialCooldown > 0) this.specialCooldown -= dt;
      if (this.pendingExplosion) {
        this.pendingExplosion.timer -= dt;
        if (!this.pendingExplosion.triggered && this.pendingExplosion.timer <= 0) {
          this.causeSpecialExplosion(this.pendingExplosion.x, this.pendingExplosion.y);
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
            bullet.active = false;
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
                tank.isAce ? this.point += 2 : this.point++;
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
            if (distSq <= (bullet.radius + baseRadius) * (bullet.radius + baseRadius)) {
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
          if (distSq <= (bullet.radius + strongholdRadius) * (bullet.radius + strongholdRadius)) {
            stronghold.hp -= bullet.damage;
            bullet.active = false;
            if (stronghold.hp <= 0) {
              stronghold.owner = bullet.team;
              this.baseHealth[bullet.team] = clamp(
                this.baseHealth[bullet.team] + 200,
                0,
                this.defaultBaseHealth
              );
              stronghold.hp = 1e3;
              this.turrets = this.turrets.filter((t) => !(t.x === stronghold.x && t.y === stronghold.y));
              this.turrets.push(new Turret(stronghold.x, stronghold.y, stronghold.owner, 75));
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
      owned.sort((a, b) => Math.abs(a.y - enemyBaseY) - Math.abs(b.y - enemyBaseY));
      return { x: owned[0].x, y: owned[0].y };
    }
    /**
     * 웨이브 스폰
     * - 팀별 생존 수를 확인하고 부족하면 가까운 스폰 지점에 새 탱크 생성
     * - 필요 시 에이스 탱크도 제한 수까지 투입
     */
    spawnWave() {
      const blueAlive = this.tanks.filter((t) => t.team === "blue" && t.hp > 0).length;
      const redAlive = this.tanks.filter((t) => t.team === "red" && t.hp > 0).length;
      const spawnCount = 3 + Math.floor(Math.random() * 2);
      if (blueAlive < this.maxTanksPerTeam) {
        const toSpawn = Math.min(spawnCount, this.maxTanksPerTeam - blueAlive);
        const spawn = this.getSpawnPoint("blue");
        for (let i = 0; i < toSpawn; i++) {
          const x = spawn.x + (Math.random() - 0.5) * 120;
          const y = spawn.y + (Math.random() - 0.5) * 60;
          this.addTank(new Tank(x, y, "blue", false));
          const stronghold = this.strongholds.find((s) => s.owner === "blue" && s.x === spawn.x && s.y === spawn.y);
          if (stronghold) {
            stronghold.hp = clamp(stronghold.hp + 5, 0, 1e3);
          } else {
            this.baseHealth.blue = clamp(this.baseHealth.blue + 5, 0, this.defaultBaseHealth);
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
          const stronghold = this.strongholds.find((s) => s.owner === "red" && s.x === spawn.x && s.y === spawn.y);
          if (stronghold) {
            stronghold.hp = clamp(stronghold.hp + 5, 0, 1e3);
          } else {
            this.baseHealth.red = clamp(this.baseHealth.red + 5, 0, this.defaultBaseHealth);
          }
        }
      }
      const acesToSpawn = this.maxAceTanks - this.aceTanksSpawned;
      if (acesToSpawn > 0) {
        const spawn = this.getSpawnPoint("red");
        for (let i = 0; i < acesToSpawn; i++) {
          const aceTank = new Tank(
            spawn.x + (Math.random() - 0.5) * 80,
            spawn.y + (Math.random() - 0.5) * 40,
            "red",
            false,
            false
          );
          aceTank.isAce = true;
          this.addTank(aceTank);
          this.aceTanksSpawned++;
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
        ctx.shadowColor = team === "blue" ? "rgba(92, 179, 255, 0.8)" : "rgba(255, 106, 106, 0.8)";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        const baseSize = 80;
        ctx.rect(screenX - baseSize / 2, screenY - baseSize / 2, baseSize, baseSize);
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
        ctx.shadowColor = stronghold.owner === "blue" ? "rgba(92, 179, 255, 0.8)" : stronghold.owner === "red" ? "rgba(255, 106, 106, 0.8)" : "rgba(170, 170, 170, 0.8)";
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        const strongholdSize = 72;
        ctx.rect(screenX - strongholdSize / 2, screenY - strongholdSize / 2, strongholdSize, strongholdSize);
        ctx.fillStyle = stronghold.owner === "blue" ? "#5cb3ff" : stronghold.owner === "red" ? "#ff6a6a" : "#aaa";
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
          stronghold.owner ? `${stronghold.owner.toUpperCase()} Stronghold` : "Neutral Stronghold",
          screenX,
          screenY - 44
        );
        ctx.fillStyle = "#000";
        ctx.fillRect(screenX - 36, screenY + 44, 72, 6);
        ctx.fillStyle = stronghold.owner === "blue" ? "#5cb3ff" : stronghold.owner === "red" ? "#ff6a6a" : "#aaa";
        ctx.fillRect(screenX - 36, screenY + 44, 72 * clamp(stronghold.hp / 1e3, 0, 1), 6);
        ctx.restore();
      }
      for (const turret of this.turrets) {
        turret.draw(ctx, cam);
      }
      ctx.save();
      const barWidth = 400;
      const barHeight = 18;
      const baseMaxHp = this.defaultBaseHealth;
      ctx.fillStyle = "#333";
      ctx.fillRect(ctx.canvas.width / 2 - (40 + barWidth), 16, barWidth, barHeight);
      ctx.fillStyle = "#5cb3ff";
      ctx.fillRect(
        ctx.canvas.width / 2 - (40 + barWidth),
        16,
        barWidth * clamp(this.baseHealth.blue / baseMaxHp, 0, 1),
        barHeight
      );
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(ctx.canvas.width / 2 - (40 + barWidth), 16, barWidth, barHeight);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`BLUE Base: ${this.baseHealth.blue}`, ctx.canvas.width / 2 - (40 + barWidth), 8);
      ctx.fillStyle = "#333";
      ctx.fillRect(ctx.canvas.width / 2 + 40, 16, barWidth, barHeight);
      ctx.fillStyle = "#ff6a6a";
      ctx.fillRect(
        ctx.canvas.width / 2 + 40,
        16,
        barWidth * clamp(this.baseHealth.red / baseMaxHp, 0, 1),
        barHeight
      );
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(ctx.canvas.width / 2 + 40, 16, barWidth, barHeight);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`RED Base: ${this.baseHealth.red}`, ctx.canvas.width / 2 + 40, 8);
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
          y: minimapY + (y - mapMinY) * scaleY
        };
      }
      for (const team of ["blue", "red"]) {
        const base = this.basePos[team];
        const pos = toMinimap(base.x, base.y);
        ctx.beginPath();
        const baseSize = 20;
        ctx.rect(pos.x - baseSize / 2, pos.y - baseSize / 2, baseSize, baseSize);
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
        ctx.rect(pos.x - strongholdSize / 2, pos.y - strongholdSize / 2, strongholdSize, strongholdSize);
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
        } else if (tank.isAce) {
          ctx.fillStyle = "#ff00ff";
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
        const progress = this.pendingExplosion.triggered ? 1 : 1 - this.pendingExplosion.timer / totalTime;
        const fadeOutAlpha = this.pendingExplosion.triggered ? Math.max(0, this.pendingExplosion.fadeTimer / 1) : 1;
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
          [radius, 0]
          // 오른쪽
        ];
        for (const [x, y] of directions) {
          const nx = x === 0 ? 0 : Math.sign(x);
          const ny = y === 0 ? 0 : Math.sign(y);
          const lx = x - nx * lineLength / 2;
          const ly = y - ny * lineLength / 2;
          const rx = x + nx * lineLength / 2;
          const ry = y + ny * lineLength / 2;
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
    constructor(canvas) {
      this.keys = {};
      this.mouse = {
        canvasX: 0,
        canvasY: 0,
        down: false,
        rightDown: false
      };
      window.addEventListener("keydown", (e) => {
        this.keys[e.key.toLowerCase()] = true;
      });
      window.addEventListener("keyup", (e) => {
        this.keys[e.key.toLowerCase()] = false;
      });
      canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0) this.mouse.down = true;
        if (e.button === 2) this.mouse.rightDown = true;
      });
      canvas.addEventListener("mouseup", (e) => {
        if (e.button === 0) this.mouse.down = false;
        if (e.button === 2) this.mouse.rightDown = false;
      });
      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouse.canvasX = e.clientX - rect.left;
        this.mouse.canvasY = e.clientY - rect.top;
      });
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
        const currentBars = Math.ceil((maxCooldown - cooldown) / maxCooldown * barLength);
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
        font = "bold 30px sans-serif",
        textAlign = "center",
        textBaseline = "middle",
        offsetY = 0
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
      ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 + offsetY);
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
      canvas.addEventListener("wheel", (e) => {
        if (game.input && game.input.keys && game.input.keys[" "]) {
          e.preventDefault();
          const deltaY = e.deltaY;
          const world = game.world;
          const newY = world.camera.y + deltaY;
          const maxOffset = world.bounds.maxY - canvas.height;
          world.camera.y = clamp(newY, world.bounds.minY, maxOffset);
        }
      }, { passive: false });
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
      const elem = this.game.canvas.parentElement || document.documentElement;
      if (!document.fullscreenElement) {
        try {
          await elem.requestFullscreen();
          console.log("\uC804\uCCB4\uD654\uBA74 \uC9C4\uC785 \uC131\uACF5");
        } catch (err) {
          console.warn("\uC804\uCCB4\uD654\uBA74 \uC9C4\uC785 \uC2E4\uD328:", err);
        }
      }
    }
    // --- 전체화면 해제 ---
    async exitFullscreen() {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
          console.log("\uC804\uCCB4\uD654\uBA74 \uD574\uC81C\uB428");
        } catch (err) {
          console.warn("\uC804\uCCB4\uD654\uBA74 \uD574\uC81C \uC2E4\uD328:", err);
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
        game.running = true;
        game.bgm.play();
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
        explosions: []
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
      game.world = new World(game.canvas, game.isSuperMode);
      game.input = new InputManager(game.canvas);
      const spawn = game.getPlayerSpawn();
      game.playerRespawnTimer = 0;
      game.playerTank = new Tank(spawn.x, spawn.y, "blue", true, game.isSuperMode ? true : false);
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
      const tempBullet = new Bullet();
      await tempBullet.initSprite("red");
      await tempBullet.initSprite("blue");
      await Explosion.initSprite();
      this.world = new World(this.canvas, this.isSuperMode);
      this.input = new InputManager(this.canvas);
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
        this.isSuperMode
        // 슈퍼 모드에 따라 파라미터 상이
      );
      this.world.addTank(this.playerTank);
      this.world.spawnWave();
      this.lastTime = 0;
      this.accumulator = 0;
      this.timeStep = 1 / 60;
      this.running = true;
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
    if (world.specialCooldown > 0 || world.pendingExplosion || world.point < specialWeaponPoint) {
      // console.debug("Special weapon blocked (cooldown/pending/insufficient points)");
      return;
    }

    // 마우스 화면 좌표 → 월드 좌표 변환
    const mouseWorldX = mouseCanvasX + cam.x;
    const mouseWorldY = mouseCanvasY + cam.y;

    // 특수 무기 예약 등록 및 자원/쿨다운 처리
    world.pendingExplosion = { x: mouseWorldX, y: mouseWorldY, timer: pending };
    world.specialCooldown = world.specialCoolTime;
    world.point -= specialWeaponPoint;

    // 다음 사용 비용 증가(게임/월드 표기 동기화 유지)
    this.specialWeaponPoint++;
    world.specialWeaponPoint++;
    console.log(`SWP: ${this.specialWeaponPoint}`);
  }
    /**
     * 플레이어 스폰 위치 계산
     * - 아군(블루) 소유 거점 중 전방(화면 상단에 가까운 y가 작은) 거점을 우선
     * - 없으면 본진 위치로 스폰
     */
    getPlayerSpawn() {
      const ownedStrongholds = this.world.strongholds.filter((s) => s.owner === "blue");
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
        if (camera.y == targetY && this.endingExplosions.nextIdx < 7 && this.endingExplosions.timer <= 9 - this.endingExplosions.nextIdx * 0.5) {
          const exp = this.world.explosionPool.factory();
          exp.init({
            x: base.x + (Math.random() - 0.5) * 120,
            y: base.y + (Math.random() - 0.5) * 120,
            maxRadius: 120
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
          this.canvas.height / 2 + 40
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
              this.playerRespawnTimer = 5;
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
        this.world.killcount.player
      );
      this.ui.updatePoint(this.world.point);
      this.ui.updateSpecialWeaponBar(
        this.world.specialCooldown,
        this.world.specialCoolTime,
        this.world.specialWeaponPoint
      );
      this.world.draw();
      if (!this.running && !this.world.gameOver) {
        this.ui.drawOverlayMessage("PAUSED", { opacity: 0.2, textBaseline: "top" });
      } else {
        if (this.isSuperMode) {
          this.ui.drawSuperModeIndicator();
        }
        if (this.playerTank.hp <= 0 && this.playerRespawnTimer > 0) {
          this.ui.drawOverlayMessage(
            `Respawning in ${Math.ceil(this.playerRespawnTimer)}...`,
            { opacity: 0.7, color: "#ffe600", font: "bold 64px sans-serif" }
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
  };

  // main.js
  var shootSFXPool = new AudioPool([
    "./assets/Shoot_1.wav",
    "./assets/Shoot_2.wav",
    "./assets/Shoot_3.wav",
    "./assets/Shoot_4.wav",
    "./assets/Shoot_5.wav"
  ], 120);
  var deathSFXPool = new AudioPool([
    "./assets/Explosion_1.wav",
    "./assets/Explosion_2.wav",
    "./assets/Explosion_3.wav",
    "./assets/Explosion_4.wav"
  ], 50);
  var turretSFXPool = new AudioPool([
    "./assets/Turret.wav"
  ], 20);
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
  }
  window.addEventListener("DOMContentLoaded", async () => {
    const canvas = document.getElementById("gameCanvas");
    let game, gameStarted = false;
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
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Loading Assets...", canvas.width / 2, canvas.height / 2 - 40);
      ctx.fillStyle = "#333";
      const barWidth = 400, barHeight = 20;
      ctx.fillRect(canvas.width / 2 - barWidth / 2, canvas.height / 2, barWidth, barHeight);
      ctx.fillStyle = "white";
      ctx.fillRect(
        canvas.width / 2 - barWidth / 2,
        canvas.height / 2,
        barWidth * (progress / 100),
        barHeight
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
        ctx.fillStyle = "#ffe600";
        ctx.font = "bold 64px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Press SPACE to Start", canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = "gray";
        ctx.font = "24px sans-serif";
        ctx.fillText("Press ENTER to Enter Super Mode", canvas.width / 2, canvas.height / 2 + 60);
        gameReady = true;
      }
    }, 100);
    window.addEventListener("keydown", (e) => {
      if (!gameStarted && gameReady && (e.code === "Space" || e.code === "Enter")) {
        gameStarted = true;
        game = e.code === "Enter" ? new Game(canvas, true) : new Game(canvas);
        const bgm = document.getElementById("bgm");
        if (bgm) {
          bgm.currentTime = 51.5;
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
