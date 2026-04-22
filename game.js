// game.js
import { Bullet, Explosion, Tank, Turret } from './entities.js';
import { World, AudioPool, Pool, handleTankAI, clamp } from './systems.js';

const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS/i.test(navigator.userAgent);

// input/InputManager.js
export class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.mouse = {
      canvasX: 0,
      canvasY: 0,
      down: false,
      rightDown: false,
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
}

// core/managers/UIManager.js
export class UIManager {
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
    this.overlayEl = document.getElementById("game-overlay");
    this.overlayMessageEl = document.getElementById("overlay-message");
    this.overlaySubmessageEl = document.getElementById("overlay-submessage");
    this.blueBaseFillEl = document.getElementById("blue-base-fill");
    this.redBaseFillEl = document.getElementById("red-base-fill");
    this.blueBaseValueEl = document.getElementById("blue-base-value");
    this.redBaseValueEl = document.getElementById("red-base-value");
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

  showOverlay(message, submessage = "") {
    if (!this.overlayEl) return;
    this.overlayMessageEl.textContent = message;
    if (this.overlaySubmessageEl) {
      this.overlaySubmessageEl.textContent = submessage;
    }
    this.overlayEl.classList.remove("hidden");
  }

  hideOverlay() {
    if (!this.overlayEl) return;
    this.overlayEl.classList.add("hidden");
  }

  updateBaseHealth(blue, red) {
    if (this.blueBaseFillEl) {
      this.blueBaseFillEl.style.width = `${Math.max(0, Math.min(100, (blue / 10e3) * 100))}%`;
    }
    if (this.redBaseFillEl) {
      this.redBaseFillEl.style.width = `${Math.max(0, Math.min(100, (red / 10e3) * 100))}%`;
    }
    if (this.blueBaseValueEl) {
      this.blueBaseValueEl.textContent = `${Math.max(0, Math.round(blue))}`;
    }
    if (this.redBaseValueEl) {
      this.redBaseValueEl.textContent = `${Math.max(0, Math.round(red))}`;
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
export class EventManager {
  constructor(game) {
    this.game = game;
    const canvas = game.canvas;
    this.pointerDragActive = false;
    this.lastPointer = { x: 0, y: 0 };
    if (!game.isSpectatorMode) {
      this.requestFullscreen();
    }
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
          world.camera.y = Math.max(world.bounds.minY, Math.min(newY, maxOffset));
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
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      if (!game.isSpectatorMode || !e.isPrimary) return;
      e.preventDefault();
      this.pointerDragActive = true;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!game.isSpectatorMode || !this.pointerDragActive) return;
      e.preventDefault();
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      const world = game.world;
      if (!world) return;
      world.camera.x = Math.max(
        world.bounds.minX,
        Math.min(world.camera.x - dx, world.bounds.maxX - canvas.width),
      );
      world.camera.y = Math.max(
        world.bounds.minY,
        Math.min(world.camera.y - dy, world.bounds.maxY - canvas.height),
      );
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!game.isSpectatorMode || !e.isPrimary) return;
      this.pointerDragActive = false;
      canvas.releasePointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointercancel", (e) => {
      if (!game.isSpectatorMode) return;
      this.pointerDragActive = false;
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
        console.warn(
          "\uC804\uCCB4\uD654\uBA74 \uC9C4\uC785 \uC2E4\uD328:",
          err,
        );
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
        console.warn(
          "\uC804\uCCB4\uD654\uBA74 \uD574\uC81C \uC2E4\uD328:",
          err,
        );
      }
    }
  }
};

// core/managers/GameStateManager.js
export class GameStateManager {
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
      game.focusCountdown = 3;
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
    if (!game.isSpectatorMode) {
      game.playerTank = new Tank(
        spawn.x,
        spawn.y,
        "blue",
        true,
        game.isSuperMode ? true : false,
      );
      game.world.addTank(game.playerTank);
    } else {
      game.playerTank = null;
    }
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
export class Game {
  constructor(canvas, isSuperMode = false, isSpectatorMode = false) {
    this.canvas = canvas;
    this.isSuperMode = isSuperMode;
    this.isSpectatorMode = isSpectatorMode || isMobileDevice;
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
    this.world = new World(this.canvas, this.isSuperMode, this.isSpectatorMode);
    this.input = new InputManager(this.canvas);
    this.bgm = document.getElementById("bgm");
    this.ui = new UIManager(this.canvas);
    this.stateManager = new GameStateManager(this);
    this.eventManager = new EventManager(this);
    this.endingExplosions = null;
    this.specialWeaponPoint = 5;
    const playerSpawn = this.getPlayerSpawn();
    this.playerRespawnTimer = 0;
    if (!this.isSpectatorMode) {
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
    } else {
      this.playerTank = null;
    }
    this.world.spawnWave();
    this.lastTime = 0;
    this.accumulator = 0;
    this.timeStep = 1 / 60; // 60 FPS 고정 타임스텝
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
    
    // Handle focus countdown timer
    if (this.focusCountdown > 0) {
      this.focusCountdown -= dt;
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
        if (this.playerTank && this.playerTank.hp <= 0) {
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
      this.world.killcount.player,
    );
    this.ui.updatePoint(this.world.point);
    this.ui.updateSpecialWeaponBar(
      this.world.specialCooldown,
      this.world.specialCoolTime,
      this.world.specialWeaponPoint,
    );
    this.ui.updateBaseHealth(this.world.baseHealth.blue, this.world.baseHealth.red);
    this.world.draw();
    if (this.focusCountdown > 0) {
      this.ui.showOverlay(`Resuming in ${Math.ceil(this.focusCountdown)}...`, "Get ready to continue");
    } else if (!this.running && !this.world.gameOver) {
      this.ui.showOverlay("PAUSED", "Press P to resume");
    } else {
      if (this.playerTank && this.playerTank.hp <= 0 && this.playerRespawnTimer > 0) {
        this.ui.showOverlay(
          `Respawning in ${Math.ceil(this.playerRespawnTimer)}...`,
          "Stay patient. Your tank will return soon.",
        );
      } else {
        this.ui.hideOverlay();
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

// main.js
export const shootSFXPool = new AudioPool(
  [
    "./assets/Shoot_1.wav",
    "./assets/Shoot_2.wav",
    "./assets/Shoot_3.wav",
    "./assets/Shoot_4.wav",
    "./assets/Shoot_5.wav",
  ],
  120,
);
export const deathSFXPool = new AudioPool(
  [
    "./assets/Explosion_1.wav",
    "./assets/Explosion_2.wav",
    "./assets/Explosion_3.wav",
    "./assets/Explosion_4.wav",
  ],
  50,
);
export const turretSFXPool = new AudioPool(["./assets/Turret.wav"], 50);
export const bulletPool = new Pool(() => new Bullet(), 150);
export const explosionPool = new Pool(() => new Explosion(), 75);
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
  const loadingScreenEl = document.getElementById("loading-screen");
  const loadingTitleEl = document.getElementById("loading-title");
  const loadingBarFillEl = document.getElementById("loading-bar-fill");
  const loadingStatusEl = document.getElementById("loading-status");
  const loadingHintEl = document.getElementById("loading-hint");

  function updateLoadingScreen(progress, ready = false) {
    if (!loadingScreenEl) return;
    loadingScreenEl.classList.remove("hidden");
    if (loadingBarFillEl) {
      loadingBarFillEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
    if (loadingStatusEl) {
      loadingStatusEl.textContent = `${Math.min(100, Math.max(0, Math.round(progress)))}%`;
    }
    if (loadingTitleEl) {
      loadingTitleEl.textContent = ready ? "Ready to Start" : "Loading Assets...";
    }
    if (loadingHintEl) {
      loadingHintEl.classList.toggle("hidden", !ready);
    }
  }

  function startGame(useSuper = false) {
    gameStarted = true;
    game = useSuper ? new Game(canvas, true) : new Game(canvas);
    const instructionEl = document.getElementById("instruction");
    if (instructionEl) {
      instructionEl.style.display = game.isSpectatorMode ? "none" : "block";
    }
    const baseHealthEl = document.getElementById("base-health-ui");
    if (baseHealthEl) {
      baseHealthEl.style.display = "flex";
    }
    if (loadingScreenEl) {
      loadingScreenEl.classList.add("hidden");
    }
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

  updateLoadingScreen(0);
  await preloadSprites();
  let loadingProgress = 0;
  const loadingInterval = setInterval(() => {
    loadingProgress += 2.5;
    updateLoadingScreen(loadingProgress);
    if (loadingProgress >= 100) {
      clearInterval(loadingInterval);
      updateLoadingScreen(100, true);
      gameReady = true;
    }
  }, 100);
  window.addEventListener("keydown", (e) => {
    if (!gameStarted && gameReady && (e.code === "Space" || e.code === "Enter")) {
      startGame(e.code === "Enter");
    }
  });

  window.addEventListener("pointerdown", (e) => {
    if (!gameStarted && gameReady && e.isPrimary) {
      startGame(false);
    }
  });
});