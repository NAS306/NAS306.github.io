// game.js
import { Bullet, Explosion, Tank, Turret } from './entities.js';
import { World, AudioPool, Pool } from './systems.js';
import { clampFrameDelta } from './runtime.js';
import { detectMobileDevice, getLayoutDragThreshold } from './mobile-support.js';
import { ATTRITION_WEAPON_IDS } from './weapon-config.js';
import {
  chooseRandomScenarioId,
  loadLevelCatalog,
  resolveScenario,
} from './level-config.js';

const isMobileDevice = detectMobileDevice({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
  userAgentDataMobile: navigator.userAgentData?.mobile,
  coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches ?? false,
  screenWidth: window.screen?.width,
  screenHeight: window.screen?.height,
});
const ITEM_BY_KEY = Object.freeze({ "1": "orbital", "2": "barrier" });
const MOBILE_LONG_PRESS_MS = 650;

// input/InputManager.js
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = {
      canvasX: 0,
      canvasY: 0,
      down: false,
      rightDown: false,
    };
    this.onKeyDown = (e) => {
      this.keys[e.key.toLowerCase()] = true;
    };
    this.onKeyUp = (e) => {
      this.keys[e.key.toLowerCase()] = false;
    };
    this.onMouseDown = (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.mouse.rightDown = true;
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    };
    this.onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.canvasX = e.clientX - rect.left;
      this.mouse.canvasY = e.clientY - rect.top;
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("mousemove", this.onMouseMove);
  }

  reset() {
    this.keys = {};
    this.mouse.down = false;
    this.mouse.rightDown = false;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
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
    this.orbitalStatusEl = document.getElementById("orbital-status");
    this.orbitalCooldownFillEl = document.getElementById("orbital-cooldown-fill");
    this.specialWeaponPointEl = document.getElementById("specialWeaponPoint");
    this.overlayEl = document.getElementById("game-overlay");
    this.overlayMessageEl = document.getElementById("overlay-message");
    this.overlaySubmessageEl = document.getElementById("overlay-submessage");
    this.blueBaseFillEl = document.getElementById("blue-base-fill");
    this.redBaseFillEl = document.getElementById("red-base-fill");
    this.blueBaseValueEl = document.getElementById("blue-base-value");
    this.redBaseValueEl = document.getElementById("red-base-value");
    this.timerEl = document.getElementById("match-timer");
    this.scenarioNameEl = document.getElementById("scenario-name");
    this.scenarioObjectiveEl = document.getElementById("scenario-objective");
    this.barrierStatusEl = document.getElementById("barrier-status");
    this.barrierCooldownFillEl = document.getElementById("barrier-cooldown-fill");
    this.weaponPanelEl = document.getElementById("weapon-panel");
    this.weaponNameEl = document.getElementById("weapon-name");
    this.weaponDescriptionEl = document.getElementById("weapon-description");
    this.weaponFireModeEl = document.getElementById("weapon-fire-mode");
    this.weaponReloadEl = document.getElementById("weapon-reload");
    this.weaponSwitchStatusEl = document.getElementById("weapon-switch-status-panel");
    this.weaponSwitchFillEl = document.getElementById("weapon-switch-fill");
    this.weaponTankSymbolEl = document.getElementById("weapon-tank-symbol");
    this.weaponFirePatternEl = document.getElementById("weapon-fire-pattern");
    this.bottomHudEl = document.getElementById("bottom-hud");
    this.itemEls = {
      orbital: document.getElementById("orbital-item"),
      barrier: document.getElementById("barrier-item"),
    };
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
    const progress = maxCooldown > 0
      ? Math.max(0, Math.min(1, 1 - cooldown / maxCooldown))
      : 1;
    if (this.orbitalCooldownFillEl) {
      this.orbitalCooldownFillEl.style.width = `${progress * 100}%`;
    }
    if (this.orbitalStatusEl) {
      this.orbitalStatusEl.textContent = cooldown > 0
        ? `${Math.ceil(cooldown)}s`
        : "READY";
    }
    if (this.specialWeaponPointEl) {
      this.specialWeaponPointEl.textContent = `${currentPoint}`;
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

  updateBaseHealth(blue, red, maxValue = 10e3, label = "Base") {
    const blueLabel = document.getElementById("blue-status-label");
    const redLabel = document.getElementById("red-status-label");
    if (blueLabel) blueLabel.textContent = `Blue ${label}`;
    if (redLabel) redLabel.textContent = `Red ${label}`;
    if (this.blueBaseFillEl) {
      this.blueBaseFillEl.style.width = `${Math.max(0, Math.min(100, (blue / maxValue) * 100))}%`;
    }
    if (this.redBaseFillEl) {
      this.redBaseFillEl.style.width = `${Math.max(0, Math.min(100, (red / maxValue) * 100))}%`;
    }
    if (this.blueBaseValueEl) {
      this.blueBaseValueEl.textContent = `${Math.max(0, Math.round(blue))}`;
    }
    if (this.redBaseValueEl) {
      this.redBaseValueEl.textContent = `${Math.max(0, Math.round(red))}`;
    }
  }

  updateTimer(remainingTime) {
    if (!this.timerEl) return;
    if (remainingTime === null) {
      this.timerEl.textContent = "";
      return;
    }
    const seconds = Math.max(0, Math.ceil(remainingTime));
    const minutes = Math.floor(seconds / 60);
    this.timerEl.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  updateScenario(scenario) {
    if (this.scenarioNameEl) this.scenarioNameEl.textContent = scenario?.title ?? "";
    if (this.scenarioObjectiveEl) {
      this.scenarioObjectiveEl.textContent = scenario?.objective ?? "";
    }
  }

  updatePlayerWeapon(world, player, cooldown, maxCooldown) {
    const visible = Boolean(world?.mode === "attrition" && player);
    if (this.weaponPanelEl) {
      this.weaponPanelEl.style.display = visible ? "grid" : "none";
    }
    if (!visible) return;
    const weapon = player.weapon;
    if (this.weaponPanelEl) this.weaponPanelEl.dataset.weaponId = weapon.id;
    if (this.weaponNameEl) this.weaponNameEl.textContent = weapon.title;
    if (this.weaponDescriptionEl) {
      this.weaponDescriptionEl.textContent = weapon.description;
    }
    if (this.weaponFireModeEl) this.weaponFireModeEl.textContent = weapon.fireMode;
    if (this.weaponReloadEl) {
      this.weaponReloadEl.textContent = `Reload ${weapon.reloadTime.toFixed(1)}s`;
    }
    if (this.weaponTankSymbolEl) {
      this.weaponTankSymbolEl.className = `shape-${weapon.tankShape}`;
    }
    if (this.weaponFirePatternEl) {
      this.weaponFirePatternEl.className = `pattern-${weapon.id}`;
    }
    if (this.weaponSwitchStatusEl) {
      this.weaponSwitchStatusEl.textContent = cooldown > 0
        ? `${Math.ceil(cooldown)}s`
        : "READY";
    }
    if (this.weaponSwitchFillEl) {
      const progress = maxCooldown > 0
        ? Math.max(0, Math.min(1, 1 - cooldown / maxCooldown))
        : 1;
      this.weaponSwitchFillEl.style.width = `${progress * 100}%`;
    }
  }

  getBottomHudReserve() {
    if (!this.bottomHudEl) return 110;
    const rect = this.bottomHudEl.getBoundingClientRect();
    return Math.max(0, this.canvas.height - rect.top + 24);
  }

  updateBarrierStatus(world) {
    if (!this.barrierStatusEl) return;
    const wall = world.deployableWall;
    if (wall?.active) {
      this.barrierStatusEl.textContent = `${Math.ceil(wall.hp)} HP`;
      this.barrierStatusEl.style.color = "#5cb3ff";
    } else if (world.deployableWallCooldown > 0) {
      this.barrierStatusEl.textContent = `${Math.ceil(world.deployableWallCooldown)}s`;
      this.barrierStatusEl.style.color = "#ffcf70";
    } else {
      this.barrierStatusEl.textContent = "READY";
      this.barrierStatusEl.style.color = "#8fd8ff";
    }
    if (this.barrierCooldownFillEl) {
      const maxCooldown = world.deployableWallRules.cooldown;
      const progress = Math.max(
        0,
        Math.min(1, 1 - world.deployableWallCooldown / maxCooldown),
      );
      this.barrierCooldownFillEl.style.width = `${progress * 100}%`;
    }
  }
  updateItemSelection(selectedItemId) {
    for (const [itemId, element] of Object.entries(this.itemEls)) {
      element?.classList.toggle("selected", itemId === selectedItemId);
    }
  }

  /**
   * Draw a generic overlay message on top of the canvas. This helper is
   * flexible enough to render respawn countdowns or any
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
};

// core/managers/EventManager.js
export class EventManager {
  constructor(game) {
    this.game = game;
    const canvas = game.canvas;
    this.pointerDragActive = false;
    this.dragConfirmed = false;
    this.longPressTimer = null;
    this.longPressTriggered = false;
    this.dragThreshold = getLayoutDragThreshold(window.visualViewport?.scale);
    this.pressStart = { x: 0, y: 0 };
    this.lastPointer = { x: 0, y: 0 };
    if (!game.isSpectatorMode) {
      this.requestFullscreen();
    }
    window.addEventListener("keydown", (e) => {
      const itemId = ITEM_BY_KEY[e.key];
      if (itemId) game.selectItem(itemId);
      if (e.code === "KeyQ" && !e.repeat) game.switchPlayerWeapon();
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
      if (game.isSpectatorMode) return;
      game.useSelectedItem(e);
    });
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      if (!game.isSpectatorMode || !e.isPrimary) return;
      e.preventDefault();
      this.pointerDragActive = true;
      this.dragConfirmed = false;
      this.longPressTriggered = false;
      this.pressStart.x = e.clientX;
      this.pressStart.y = e.clientY;
      this.dragThreshold = getLayoutDragThreshold(window.visualViewport?.scale);
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.cancelLongPress();
      const target = { clientX: e.clientX, clientY: e.clientY };
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (!this.pointerDragActive) return;
        this.longPressTriggered = game.useSelectedItem(target);
      }, MOBILE_LONG_PRESS_MS);
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!game.isSpectatorMode || !this.pointerDragActive) return;
      e.preventDefault();
      const totalDx = e.clientX - this.pressStart.x;
      const totalDy = e.clientY - this.pressStart.y;
      if (!this.dragConfirmed && Math.hypot(totalDx, totalDy) <= this.dragThreshold) {
        return;
      }
      if (!this.dragConfirmed) {
        this.dragConfirmed = true;
        this.cancelLongPress();
        this.lastPointer.x = e.clientX;
        this.lastPointer.y = e.clientY;
        return;
      }
      if (this.longPressTriggered) return;
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
      this.cancelLongPress();
      this.pointerDragActive = false;
      canvas.releasePointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointercancel", (e) => {
      if (!game.isSpectatorMode) return;
      this.cancelLongPress();
      this.pointerDragActive = false;
    });
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        console.log("\uC804\uCCB4\uD654\uBA74 \uD574\uC81C\uB428");
      }
    });
  }
  // --- 전체화면 요청 ---
  cancelLongPress() {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
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
   * Handle the transition into the game over state. This is called once
   * when the world's base health for either team reaches zero. It stops
   * the music, mutes all shooting and hit sound effects, and prepares
   * the ending explosion sequence by spawning the first explosion and
   * positioning the camera.
   */
  handleGameOver() {
    const game = this.game;
    game.ui.hideOverlay();
    game.playerRespawnTimer = 0;
    game.playerWeaponSwitchCooldown = 0;
    game.bgm.pause();
    for (const audioPool of Object.values(game.resources.audio)) {
      for (const audio of audioPool.pool) audio.volume = 0;
    }
    const nextLevel = game.scenarioProvider?.(game.levelDefinition?.id)
      ?? game.levelDefinition;
    game.nextLevelDefinition = nextLevel;
    game.endingExplosions = {
      timer: 10,
      nextIdx: 0,
      explosions: [],
      message: game.world.gameOverMessage,
      nextScenario: nextLevel,
    };
    const losingTeam = game.world.winner === "blue" ? "red" : "blue";
    const target = game.world.gameOverTarget ?? game.world.basePos[losingTeam];
    game.endingExplosions.target = target;
    game.world.camera.targetY = target.y - game.canvas.height / 2;
    const exp = game.world.explosionPool.factory();
    exp.init({ x: target.x, y: target.y, maxRadius: 120 });
    game.endingExplosions.explosions.push(exp);
    game.world.playSpatialAudio("death", target.y, 1);
    game.endingExplosions.nextIdx++;
  }
  /**
   * Restart the game by rebuilding the world and player tank, resetting
   * timers and background music. It also fades the BGM back in and
   * unmutes sound effect pools.
   */
  restartGame() {
    const game = this.game;
    const nextLevel = game.nextLevelDefinition
      ?? game.scenarioProvider?.(game.levelDefinition?.id);
    if (nextLevel) {
      game.levelDefinition = nextLevel;
      game.playerTeam = nextLevel.playerTeam;
    }
    game.nextLevelDefinition = null;
    // Reset all active projectiles and explosions from previous game
    game.resources.bulletPool.reset();
    game.resources.explosionPool.reset();
    game.world = new World(
      game.canvas,
      game.isSuperMode,
      game.isSpectatorMode,
      game.resources,
      game.levelDefinition,
    );
    game.input.reset();
    const spawn = game.getPlayerSpawn();
    game.playerRespawnTimer = 0;
    game.playerWeaponSwitchCooldown = 0;
    if (!game.isSpectatorMode) {
      game.playerTank = new Tank(
        spawn.x,
        spawn.y,
        game.playerTeam,
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
    game.ui.updateScenario(game.levelDefinition);
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
    for (const audioPool of Object.values(game.resources.audio)) {
      for (const audio of audioPool.pool) audio.volume = 1;
    }
  }
};

// core/Game.js
export class Game {
  constructor(
    canvas,
    isSuperMode = false,
    isSpectatorMode = false,
    levelDefinition = null,
    scenarioProvider = null,
  ) {
    this.canvas = canvas;
    this.isSuperMode = isSuperMode;
    this.isSpectatorMode = isSpectatorMode || isMobileDevice;
    this.levelDefinition = levelDefinition;
    this.playerTeam = levelDefinition?.playerTeam ?? "blue";
    this.scenarioProvider = scenarioProvider;
    this.nextLevelDefinition = null;
    this.playerWeaponSwitchCooldown = 0;
    this.playerWeaponSwitchCoolTime = this.isSuperMode ? 2 : 10;
    this.selectedItemId = "orbital";
    this.itemActions = {
      orbital: (event) => this.activateSpecialWeapon(event),
      barrier: (event) => this.placeBarrierAtPointer(event),
    };
    this.restartTimer = 0;
    this.boundLoop = this.loop.bind(this);
    this.animationFrameId = null;
    this.maxFrameDelta = 0.25;
    this.maxUpdatesPerFrame = 8;
    this.init()
      .then(() => {
        console.log("\u2705 All assets loaded, starting game");
        this.start();
      })
      .catch((error) => {
        console.error("Game initialization failed", error);
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
    await tempBullet.initSprite("player");
    await Explosion.initSprite();
    this.resources = gameResources;
    this.world = new World(
      this.canvas,
      this.isSuperMode,
      this.isSpectatorMode,
      this.resources,
      this.levelDefinition,
    );
    this.input = new InputManager(this.canvas);
    this.bgm = document.getElementById("bgm");
    this.ui = new UIManager(this.canvas);
    this.ui.updateScenario(this.levelDefinition);
    this.stateManager = new GameStateManager(this);
    this.eventManager = new EventManager(this);
    this.endingExplosions = null;
    const playerSpawn = this.getPlayerSpawn();
    this.playerRespawnTimer = 0;
    if (!this.isSpectatorMode) {
      this.playerTank = new Tank(
        playerSpawn.x,
        playerSpawn.y,
        this.playerTeam,
        true,
        this.isSuperMode,
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
  }
  /**
   * 특수 무기(지정 지점 대규모 폭발) 활성화
   * - 마우스 클릭 지점을 월드 좌표로 변환하여 pendingExplosion 등록
   * - 쿨다운/포인트 조건 검사 후 발동
   */
  activateSpecialWeapon(e) {
    const { canvas, world } = this;
    const rect = canvas.getBoundingClientRect();
    const mouseCanvasX = e.clientX - rect.left;
    const mouseCanvasY = e.clientY - rect.top;

    const { camera: cam } = world;
    const pending = this.isSuperMode ? 1.0 : 5.0;

    // 쿨다운 중이거나, 이미 예약된 폭발이 있거나, 포인트가 부족하면 즉시 무시
    if (
      world.specialCooldown > 0 ||
      world.pendingExplosion ||
      world.point < world.itemPointCost
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
    world.commitItemUse();

    // 다음 사용 비용 증가(게임/월드 표기 동기화 유지)
    return true;
  }
  selectItem(itemId) {
    if (!this.itemActions[itemId] || this.isSpectatorMode) return;
    this.selectedItemId = itemId;
    this.ui.updateItemSelection(itemId);
    this.canvas.style.cursor = "crosshair";
  }
  switchPlayerWeapon() {
    if (
      this.world?.mode !== "attrition" ||
      !this.playerTank ||
      this.playerTank.hp <= 0 ||
      this.playerWeaponSwitchCooldown > 0 ||
      this.world.gameOver
    ) {
      return false;
    }
    const currentIndex = ATTRITION_WEAPON_IDS.indexOf(this.playerTank.weaponId);
    const nextIndex = (Math.max(0, currentIndex) + 1) % ATTRITION_WEAPON_IDS.length;
    this.playerTank.setWeapon(ATTRITION_WEAPON_IDS[nextIndex]);
    this.playerWeaponSwitchCooldown = this.playerWeaponSwitchCoolTime;
    return true;
  }
  useSelectedItem(e) {
    if (this.world.gameOver) return false;
    if (this.isSpectatorMode) return this.activateSpecialWeapon(e) === true;
    return this.itemActions[this.selectedItemId]?.(e) === true;
  }
  placeBarrierAtPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left + this.world.camera.x;
    const y = e.clientY - rect.top + this.world.camera.y;
    const result = this.world.placeDeployableWall(x, y, this.playerTeam);
    return result.ok;
  }
  drawSelectedItemPreview() {
    if (this.selectedItemId !== "barrier" || this.isSpectatorMode) return;
    if (this.world.deployableWall?.active || this.world.deployableWallCooldown > 0) return;
    const x = this.input.mouse.canvasX + this.world.camera.x;
    const y = this.input.mouse.canvasY + this.world.camera.y;
    const placement = this.world.getDeployableWallPlacement(x, y);
    const rules = this.world.deployableWallRules;
    const ctx = this.canvas.getContext("2d");
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = placement.ok ? "#5cb3ff" : "#ff6a6a";
    ctx.fillRect(
      this.input.mouse.canvasX - rules.width / 2,
      this.input.mouse.canvasY - rules.thickness / 2,
      rules.width,
      rules.thickness,
    );
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      placement.reason,
      this.input.mouse.canvasX,
      this.input.mouse.canvasY - 14,
    );
    ctx.restore();
  }
  /**
   * 플레이어 스폰 위치 계산
   * - 아군(블루) 소유 거점 중 전방(화면 상단에 가까운 y가 작은) 거점을 우선
   * - 없으면 본진 위치로 스폰
   */
  getPlayerSpawn() {
    if (this.world.mode === "siege") {
      const [spawn] = this.world.getSpawnPoints(this.playerTeam);
      return { x: spawn.x, y: spawn.y };
    }
    const ownedStrongholds = this.world.strongholds.filter(
      (s) => s.owner === this.playerTeam,
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
    return {
      x: this.world.basePos[this.playerTeam].x,
      y: this.world.basePos[this.playerTeam].y,
    };
  }
  /**
   * 게임 루프 시작(브라우저 애니메이션 프레임 사용)
   */
  start() {
    this.lastTime = performance.now();
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }
  }
  /**
   * 메인 루프
   * - dt(실시간)으로 누적기를 채우고, 고정 타임스텝으로 update를 여러 번 수행
   * - 엔딩 연출 상태일 땐 카메라 이징/폭발 연쇄/문구 출력 후 타이머 종료 시 재시작
   * - 평시에는 월드 업데이트 → UI 동기화 → 그리기
   */
  loop(now) {
    this.animationFrameId = null;
    const dtMs = Math.max(0, now - this.lastTime);
    this.lastTime = now;
    const dt = clampFrameDelta(dtMs / 1e3, this.maxFrameDelta);
    
    if (this.running) {
      this.accumulator += dt;
    }
    if (this.endingExplosions) {
      const target = this.endingExplosions.target;
      const targetY = target.y - this.world.canvas.height / 2;
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
        exp.draw(ctx, this.world.camera);
      }
      ctx.fillStyle = "#fff";
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const msg = this.endingExplosions.message;
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      ctx.fillText(msg, centerX, centerY - 100);
      const nextScenario = this.endingExplosions.nextScenario;
      ctx.fillStyle = "#7fd6ff";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText(`Next: ${nextScenario.title}`, centerX, centerY - 15, this.canvas.width - 40);
      ctx.fillStyle = "#fff";
      ctx.font = "18px sans-serif";
      ctx.fillText(nextScenario.summary, centerX, centerY + 25, this.canvas.width - 40);
      ctx.fillStyle = "#ffe600";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText(
        `Restarting in ${Math.ceil(this.endingExplosions.timer)}...`,
        centerX,
        centerY + 100,
      );
      ctx.restore();
      if (this.endingExplosions.timer <= 0) {
        this.endingExplosions = null;
        this.restartGame();
      }
      this.animationFrameId = requestAnimationFrame(this.boundLoop);
      return;
    }
    this.world.bottomHudReserve = this.ui.getBottomHudReserve();
    if (this.running) {
      let updates = 0;
      while (
        this.accumulator >= this.timeStep &&
        updates < this.maxUpdatesPerFrame
      ) {
        this.playerWeaponSwitchCooldown = Math.max(
          0,
          this.playerWeaponSwitchCooldown - this.timeStep,
        );
        if (
          this.playerTank &&
          this.playerTank.hp <= 0
        ) {
          if (this.playerRespawnTimer <= 0) {
            this.playerRespawnTimer = 5;
          } else {
            this.playerRespawnTimer -= this.timeStep;
            if (this.playerRespawnTimer <= 0) {
              const spawn = this.getPlayerSpawn();
              this.playerTank.respawn(
                spawn.x,
                spawn.y,
                this.isSuperMode ? 500 : 125,
              );
              this.playerRespawnTimer = 0;
            }
          }
        }
        this.world.update(this.timeStep, this.input);
        this.accumulator -= this.timeStep;
        updates++;
      }
      if (updates === this.maxUpdatesPerFrame) {
        this.accumulator %= this.timeStep;
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
      this.world.itemPointCost,
    );
    if (this.world.mode === "attrition") {
      this.ui.updateBaseHealth(
        this.world.baseHealth.blue,
        this.world.baseHealth.red,
        this.world.defaultBaseHealth,
        "Tickets",
      );
    } else {
      this.ui.updateBaseHealth(this.world.baseHealth.blue, this.world.baseHealth.red);
    }
    this.ui.updateTimer(this.world.remainingTime);
    this.ui.updateBarrierStatus(this.world);
    this.ui.updatePlayerWeapon(
      this.world,
      this.playerTank,
      this.playerWeaponSwitchCooldown,
      this.playerWeaponSwitchCoolTime,
    );
    this.world.draw();
    this.drawSelectedItemPreview();
    if (this.world.gameOver) {
      this.ui.hideOverlay();
      if (!this.endingExplosions) this.stateManager.handleGameOver();
    } else if (
      this.playerTank &&
      this.playerTank.hp <= 0 &&
      this.playerRespawnTimer > 0
    ) {
      this.ui.showOverlay(
        `Respawning in ${Math.ceil(this.playerRespawnTimer)}...`,
        "Stay patient. Your tank will return soon.",
      );
    } else {
      this.ui.hideOverlay();
    }
    this.animationFrameId = requestAnimationFrame(this.boundLoop);
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
export const hitSFXPool = new AudioPool(
  [
    "./assets/Impact_1.wav",
    "./assets/Impact_2.wav",
    "./assets/Impact_3.wav",
    "./assets/Impact_4.wav",
  ],
  20,
);
export const bulletPool = new Pool(() => new Bullet(), 150);
export const explosionPool = new Pool(() => new Explosion(), 75);
const gameResources = {
  bulletPool,
  explosionPool,
  audio: {
    shoot: shootSFXPool,
    death: deathSFXPool,
    turret: turretSFXPool,
    hit: hitSFXPool,
  },
};
async function preloadSprites() {
  await Bullet.prototype.initSprite("red");
  await Bullet.prototype.initSprite("blue");
  await Bullet.prototype.initSprite("player");
  await Explosion.initSprite();
}
window.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.toggle("mobile-mode", isMobileDevice);
  const canvas = document.getElementById("gameCanvas");
  let game,
    gameStarted = false;
  let gameReady = false;
  let levelCatalog = null;
  let heldScenario = null;
  const ctx = canvas.getContext("2d");
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const world = game?.world;
    if (world) {
      world.resize(canvas.width);
      const maxCameraY = Math.max(world.bounds.minY, world.bounds.maxY - canvas.height);
      world.camera.y = Math.max(world.bounds.minY, Math.min(world.camera.y, maxCameraY));
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

  function startGame(scenarioId = "frontline", useSuper = false) {
    gameStarted = true;
    const levelDefinition = resolveScenario(levelCatalog, scenarioId);
    const scenarioProvider = (currentId) => {
      const nextId = chooseRandomScenarioId(levelCatalog, currentId);
      return resolveScenario(levelCatalog, nextId);
    };
    game = new Game(
      canvas,
      useSuper,
      false,
      levelDefinition,
      scenarioProvider,
    );
    const instructionEl = document.getElementById("instruction");
    if (instructionEl) {
      instructionEl.style.display = game.isSpectatorMode ? "none" : "block";
    }
    const baseHealthEl = document.getElementById("base-health-ui");
    if (baseHealthEl) {
      baseHealthEl.style.display = "grid";
    }
    const itemToolbarEl = document.getElementById("item-toolbar");
    if (itemToolbarEl) {
      itemToolbarEl.style.display = game.isSpectatorMode ? "none" : "block";
    }
    document.body.classList.toggle("mobile-mode", game.isSpectatorMode);
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
  try {
    [levelCatalog] = await Promise.all([
      loadLevelCatalog(),
      preloadSprites().then(() => null),
    ]);
  } catch (error) {
    console.error("Asset loading failed", error);
    if (loadingTitleEl) loadingTitleEl.textContent = "Loading Failed";
    if (loadingStatusEl) {
      loadingStatusEl.textContent = "Check the console and asset paths.";
    }
    return;
  }
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
    if (gameStarted || !gameReady) return;
    const focusedScenarioButton = e.target.closest?.("[data-scenario]");
    const isHeldScenarioShortcut = e.code === "Enter" && heldScenario !== null;
    if (focusedScenarioButton && !isHeldScenarioShortcut) return;
    if (e.code === "Digit1" || e.code === "Space") startGame("frontline");
    if (e.code === "Digit2") startGame("siege");
    if (e.code === "Digit3") startGame("defense");
    if (e.code === "Digit4") startGame("breakthrough");
    if (e.code === "Enter") startGame(heldScenario ?? "frontline", true);
  });

  for (const button of document.querySelectorAll("[data-scenario]")) {
    button.addEventListener("pointerdown", (e) => {
      if (gameStarted || !gameReady) return;
      e.stopPropagation();
      heldScenario = button.dataset.scenario;
      button.classList.add("held");
      button.setPointerCapture?.(e.pointerId);
    });
    button.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      button.classList.remove("held");
      heldScenario = null;
    });
    button.addEventListener("pointercancel", () => {
      button.classList.remove("held");
      heldScenario = null;
    });
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!gameStarted && gameReady) startGame(button.dataset.scenario);
    });
  }

  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.("[data-scenario]")) return;
    if (!gameStarted && gameReady && e.isPrimary) {
      startGame("frontline");
    }
  });
});
