// entities.js
import { shootSFXPool, turretSFXPool } from './game.js';
import { clamp, distance, getLeadAngle } from './systems.js';

const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS/i.test(navigator.userAgent);

// entities/Bullet.js
export class Bullet {
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
    this.radius = 2.5;
    this.lifetime = 1;
    this.age = 0;
    this.penRate = 1;
    this.isTurretSpecial = false;
  }
  /**
   * 스프라이트 로딩(팀 색상별)
   * - 최초 로딩 시 ImageBitmap으로 변환하여 캐시
   * - 이후 생성되는 Bullet은 캐시만 참조
   */
  async initSprite(team) {
    if (Bullet.spriteCache[team]) {
      this.sprite = Bullet.spriteCache[team];
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
    Bullet.spriteCache[team] = bitmap;
    this.sprite = bitmap;
    console.log(`\u2705 Sprite loaded for team: ${team}`, this.sprite);
  }
  /**
   * 풀에서 꺼낼 때 호출되는 초기화
   * - 위치/속도/팀/데미지/반지름/수명 초기화
   * - 팀별 스프라이트 자동 연결(이미 캐시되어 있으면 즉시 바인딩)
   */
  init({ x, y, vx, vy, team, damage, isPlayerBullet, radius, lifetime, penRate, isTurretSpecial }) {
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
    this.lifetime = lifetime;
    this.penRate = penRate;
    this.isTurretSpecial = isTurretSpecial ?? false;
    if (Bullet.spriteCache[this.team]) {
      this.sprite = Bullet.spriteCache[this.team];
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
  }
};

// entities/Explosion.js
export class Explosion {
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
    if (Explosion.sprite) return;
    const img = new Image();
    img.src = "../assets/sprites/explosion/explosion.png";
    await new Promise((res) => (img.onload = res));
    Explosion.sprite = await createImageBitmap(img);
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
    if (!this.active || !Explosion.sprite) return;
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;
    const size = this.maxRadius * this.scale * 2;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.drawImage(
      Explosion.sprite,
      screenX - size / 2,
      screenY - size / 2,
      size,
      size,
    );
    ctx.globalAlpha = 1;
    ctx.restore();
  }
};

// entities/Tank.js
import { handleTankAI } from './systems.js';

export class Tank {
  static sprite = null;
  constructor(x, y, team, isPlayer = false, supertank = false) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.isPlayer = isPlayer;
    this.angle = 300;
    this.turretAngle = 0;
    this.speed = supertank ? 300 : (isPlayer ? 125 : 100);
    this.hp = supertank ? 500 : 125;
    this.radius = 11;
    this.fireCooldown = 0;
    this.reloadTime = supertank ? 0.05 : 0.5;
    this.target = null;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = Math.random() * 1;
    this.supertank = supertank;
    this.vx = 0;
    this.vy = 0;
    this.bulletCount = 1;
    this.projectileLifeTime = 1.5;
    this.penRate = 1; // 1개 탱크 맞추면 총알 소멸
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
    let dx = 0,
      dy = 0;
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
    const bulletSpeed = 450;
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
    const maxHP = this.supertank ? 500 : 125;
    const barWidth = 40;
    const barHeight = 4;
    const barX = screenX - barWidth / 2;
    const barY = screenY - this.radius - 18;
    ctx.fillStyle = "#000";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const hpRatio = this.hp / maxHP;
    ctx.fillStyle =
      hpRatio > 0.6
        ? "rgba(76, 193, 76, 1)"
        : hpRatio > 0.3
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
export class Turret {
  constructor(x, y, team, damage = 50, reloadTime = 1) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.damage = damage;
    this.fireCooldown = -1;
    this.reloadTime = reloadTime;
    this.radius = 24;
    this.targetAngle = -Math.PI / 2;
    this.projectileRadius = 8;
    this.projectileSpeed = 2400;
    this.range = 700;
    this.projectileLifeTime = 0.4;
    this.penRate = 1; 
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
      if (target.y <= this.y + this.range && target.y >= this.y - this.range ) {
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
    const maxSpread = 5 * Math.PI / 180; // 5도 spread
    const spread = (Math.random() - 0.5) * 2 * maxSpread;
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
      radius: this.projectileRadius,
      lifetime: this.projectileLifeTime,
      penRate: this.penRate,
      isTurretSpecial: true
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