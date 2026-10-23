import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveScenario } from "../src/js/11-level-config.js";
import { resolveWeaponProfile } from "../src/js/10-weapon-config.js";
import { Bullet, Tank, getEquilateralTriangleVertices } from "../src/js/30-entities.js";

Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "node-test" },
  configurable: true,
});

const {
  World,
  getPlayerScreenY,
  handleTankAI,
  selectStrategicTarget,
} = await import("../src/js/31-systems.js");
const catalog = JSON.parse(
  await readFile(new URL("../src/data/levels.json", import.meta.url), "utf8"),
);
const gameSource = await readFile(new URL("../src/js/90-game.js", import.meta.url), "utf8");
const indexSource = (await Promise.all(['index.template.html', 'html/body.html', 'styles/mode-select.css'].map(path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')))).join('\n');

test("mobile page uses the device viewport and content-sized scenario cards", () => {
  assert.match(
    indexSource,
    /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/,
  );

  const buttonRule = indexSource.match(
    /body\.mobile-mode \.scenario-button \{([\s\S]*?)\}/,
  )?.[1] ?? "";
  assert.match(indexSource, /id="scenario-buttons"/);
  assert.match(buttonRule, /height:\s*auto/);
  assert.match(buttonRule, /font-size:\s*14px/);
  assert.match(indexSource, /\.mode-name \{ font-size: 20px/);
});

test("long-press cleanup belongs to EventManager", () => {
  const eventManagerStart = gameSource.indexOf("export class EventManager");
  const eventManagerEnd = gameSource.indexOf("export class GameStateManager");
  const eventManagerSource = gameSource.slice(eventManagerStart, eventManagerEnd);

  assert.ok(eventManagerStart >= 0 && eventManagerEnd > eventManagerStart);
  assert.match(eventManagerSource, /\n  cancelLongPress\(\) \{/);
});

test("player bullets use the dedicated sprite while blue AI bullets stay blue", () => {
  const originalCache = Bullet.spriteCache;
  const playerSprite = { id: "player" };
  const blueSprite = { id: "blue" };
  Bullet.spriteCache = { player: playerSprite, blue: blueSprite };

  try {
    const bullet = new Bullet();
    const common = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      team: "blue",
      damage: 25,
      radius: 3,
      lifetime: 1,
      penRate: 1,
    };
    bullet.init({ ...common, isPlayerBullet: true });
    assert.equal(bullet.sprite, playerSprite);

    bullet.init({ ...common, isPlayerBullet: false });
    assert.equal(bullet.sprite, blueSprite);
  } finally {
    Bullet.spriteCache = originalCache;
  }
});

test("scatter tank vertices form an equilateral triangle", () => {
  const vertices = getEquilateralTriangleVertices(13);
  const sideLengths = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return Math.hypot(next.x - vertex.x, next.y - vertex.y);
  });
  assert.ok(Math.abs(sideLengths[0] - sideLengths[1]) < 1e-12);
  assert.ok(Math.abs(sideLengths[1] - sideLengths[2]) < 1e-12);
});

test("camera keeps the player above a tall bottom HUD", () => {
  assert.equal(getPlayerScreenY(800, 200, 110), 600);
  assert.equal(getPlayerScreenY(800, 200, 200), 568);
  assert.ok(getPlayerScreenY(800, 200, 200) + 32 <= 800 - 200);
});

function createWorld(scenarioId = "siege") {
  const canvas = { width: 1000, height: 800, getContext: () => ({}) };
  const inertPool = { pool: [], updateAll() {}, drawAll() {}, spawn() {} };
  const audio = Object.fromEntries(
    ["shoot", "death", "turret", "hit"].map((name) => [
      name,
      { playSpatial() {} },
    ]),
  );
  return new World(
    canvas,
    false,
    false,
    { bulletPool: inertPool, explosionPool: inertPool, audio },
    resolveScenario(catalog, scenarioId),
  );
}

test("spawn speed boost decays linearly from double speed over two seconds", () => {
  const tank = new Tank(500, 1000, "red");
  assert.equal(tank.applySpawnSpeedBoost({ multiplier: 2, duration: 2 }), true);
  assert.equal(tank.getMovementSpeed(), 200);

  tank.updateSpawnSpeedBoost(1);
  assert.equal(tank.getMovementSpeed(), 150);

  tank.updateSpawnSpeedBoost(1);
  assert.equal(tank.getMovementSpeed(), 100);
});

test("configured teams boost all AI and normal players but exclude Super Mode players", () => {
  const siege = createWorld("siege");
  const blueAI = new Tank(500, 4800, "blue");
  const redAI = new Tank(500, 200, "red");
  const normalPlayer = new Tank(500, 4800, "blue", true, false);
  const superPlayer = new Tank(500, 4800, "blue", true, true);
  siege.addTank(blueAI);
  siege.addTank(redAI);
  siege.addTank(normalPlayer);
  siege.addTank(superPlayer);

  assert.equal(blueAI.getMovementSpeed(), blueAI.speed * 2);
  assert.equal(redAI.getMovementSpeed(), redAI.speed);
  assert.equal(normalPlayer.getMovementSpeed(), normalPlayer.speed * 2);
  assert.equal(superPlayer.getMovementSpeed(), superPlayer.speed);

  normalPlayer.updateSpawnSpeedBoost(2);
  normalPlayer.respawn(500, 4800);
  siege.applySpawnSpeedBoost(normalPlayer);
  assert.equal(normalPlayer.getMovementSpeed(), normalPlayer.speed * 2);

  const defense = createWorld("defense");
  const defenseBlue = new Tank(500, 4800, "blue");
  const defenseRed = new Tank(500, 200, "red");
  defense.addTank(defenseBlue);
  defense.addTank(defenseRed);
  assert.equal(defenseBlue.getMovementSpeed(), defenseBlue.speed);
  assert.equal(defenseRed.getMovementSpeed(), defenseRed.speed * 2);

  const breakthrough = createWorld("breakthrough");
  const breakthroughBlue = new Tank(500, 4800, "blue");
  const breakthroughRed = new Tank(500, 200, "red");
  breakthrough.addTank(breakthroughBlue);
  breakthrough.addTank(breakthroughRed);
  assert.equal(breakthroughBlue.getMovementSpeed(), breakthroughBlue.speed * 2);
  assert.equal(breakthroughRed.getMovementSpeed(), breakthroughRed.speed * 2);
  assert.match(
    gameSource,
    /this\.world\.applySpawnSpeedBoost\(this\.playerTank\)/,
  );
});

test("breakthrough spawns 40-tank waves up to an 80-tank field limit", () => {
  const world = createWorld("breakthrough");
  world.addTank(new Tank(500, 4800, "blue", true));
  world.spawnWave();

  assert.equal(world.getAliveTankCount("blue"), 40);
  assert.equal(world.getAliveTankCount("red"), 40);
  assert.equal(world.strongholds.length, 0);
  assert.equal(world.turrets.length, 0);
  assert.deepEqual(world.baseHealth, { blue: 10000, red: 10000 });

  world.updateSpawning(12);
  assert.equal(world.getAliveTankCount("blue"), 80);
  assert.equal(world.getAliveTankCount("red"), 80);
});

test("breakthrough assigns its configured weapon mix to AI tanks", () => {
  const world = createWorld("breakthrough");
  assert.equal(world.chooseSpawnWeapon(() => 0), "standard");
  assert.equal(world.chooseSpawnWeapon(() => 0.7), "heavy");
  assert.equal(world.chooseSpawnWeapon(() => 0.99), "scatter");
});

test("AI weapon diversity remains exclusive to breakthrough", () => {
  for (const scenarioId of ["frontline", "siege", "defense"]) {
    const world = createWorld(scenarioId);
    assert.equal(world.chooseSpawnWeapon(() => 0.99), "standard");
  }
});

test("player weapon switching and its HUD are available in every desktop scenario", () => {
  const switchStart = gameSource.indexOf("  switchPlayerWeapon() {");
  const switchEnd = gameSource.indexOf("  useSelectedItem(e) {", switchStart);
  const switchSource = gameSource.slice(switchStart, switchEnd);
  const hudStart = gameSource.indexOf("  updatePlayerWeapon(player,");
  const hudEnd = gameSource.indexOf("  updateBarrierStatus(world)", hudStart);
  const hudSource = gameSource.slice(hudStart, hudEnd);

  assert.ok(switchStart >= 0 && switchEnd > switchStart);
  assert.doesNotMatch(switchSource, /mode\s*!==\s*["']attrition["']/);
  assert.match(switchSource, /getNextPlayerWeaponId\(this\.playerTank\.weaponId\)/);
  assert.ok(hudStart >= 0 && hudEnd > hudStart);
  assert.match(hudSource, /const visible = Boolean\(player\)/);
  assert.doesNotMatch(hudSource, /world\?\.mode/);
});

test("heavy cannon projectiles carry their configured splash damage", () => {
  const world = createWorld("breakthrough");
  const spawned = [];
  world.bulletPool.spawn = (projectile) => spawned.push(projectile);
  const tank = new Tank(500, 1000, "blue", false, false, "heavy");
  tank.turretAngle = 0;
  tank.tryShoot(world);

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].damage, 25);
  assert.equal(spawned[0].explosion.radius, 90);
  assert.ok(
    Math.abs(
      Math.hypot(spawned[0].vx, spawned[0].vy) -
      resolveWeaponProfile("heavy").projectileSpeed,
    ) < 1e-9,
  );
});

test("heavy cannon splash applies damage, knockback, kills, and ticket loss", () => {
  const world = createWorld("breakthrough");
  const target = new Tank(500, 1000, "red");
  target.hp = 25;
  world.addTank(target);
  const explosion = resolveWeaponProfile("heavy").explosion;

  world.causeWeaponExplosion(500, 1000, "blue", explosion);
  assert.ok(target.hp <= 0);
  assert.ok(target.vx > 0);
  assert.equal(world.killcount.blue, 1);
  assert.equal(world.baseHealth.red, 9995);
});

test("breakthrough reserves a slot for a destroyed player's respawn", () => {
  const world = createWorld("breakthrough");
  const player = new Tank(500, 4800, "blue", true);
  world.addTank(player);
  world.spawnWave();
  player.hp = 0;

  world.updateSpawning(12);
  assert.equal(world.getAliveTankCount("blue"), 79);
});

test("all modes reserve the player's slot and wave modes include it in the first wave", () => {
  const attackWorld = createWorld("siege");
  const attackPlayer = new Tank(500, 4800, "blue", true);
  attackWorld.addTank(attackPlayer);

  attackWorld.spawnWave("blue");
  assert.equal(attackWorld.getAliveTankCount("blue"), 32);
  attackWorld.spawnWave("blue");
  assert.equal(attackWorld.getAliveTankCount("blue"), 64);
  attackWorld.spawnWave("blue");
  assert.equal(attackWorld.getAliveTankCount("blue"), 96);

  attackPlayer.hp = 0;
  assert.equal(attackWorld.spawnWave("blue"), false);
  attackPlayer.respawn(500, 4800);
  assert.equal(attackWorld.getAliveTankCount("blue"), 96);

  const defenseWorld = createWorld("defense");
  const defensePlayer = new Tank(500, 4500, "blue", true);
  defenseWorld.addTank(defensePlayer);
  for (let index = 0; index < 31; index++) {
    defenseWorld.addTank(new Tank(500, 4500, "blue"));
  }
  defensePlayer.hp = 0;
  assert.equal(defenseWorld.spawnWave("blue"), false);
  defensePlayer.respawn(500, 4500);
  assert.equal(defenseWorld.getAliveTankCount("blue"), 32);
});

test("breakthrough Bases cannot be damaged by bullets", () => {
  const world = createWorld("breakthrough");
  const redBase = world.basePos.red;
  const bullet = new Bullet();
  bullet.init({
    x: redBase.x,
    y: redBase.y,
    vx: 0,
    vy: 0,
    team: "blue",
    damage: 25,
    radius: 3,
    lifetime: 1,
    penRate: 1,
  });
  world.bulletPool.pool.push(bullet);
  world.handleCollisions();
  assert.equal(world.baseHealth.red, 10000);
});

test("player deaths never consume team tickets while AI deaths still do", () => {
  const world = createWorld("breakthrough");
  const player = new Tank(400, 400, "blue", true);
  player.hp = 10;
  const aiTank = new Tank(600, 400, "blue", false);
  aiTank.hp = 10;
  world.addTank(player);
  world.addTank(aiTank);

  for (const target of [player, aiTank]) {
    const bullet = new Bullet();
    bullet.init({
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      team: "red",
      damage: 25,
      radius: 3,
      lifetime: 1,
      penRate: 1,
    });
    world.bulletPool.pool.push(bullet);
    world.handleCollisions();
  }

  assert.equal(player.hp <= 0, true);
  assert.equal(aiTank.hp <= 0, true);
  assert.equal(world.baseHealth.blue, 9995);
});

test("breakthrough ends when a team's 10,000 tickets are exhausted", () => {
  const world = createWorld("breakthrough");
  world.baseHealth.red = 0;
  world.update(0, { keys: {} });
  assert.equal(world.gameOver, true);
  assert.equal(world.winner, "blue");
});

test("siege world builds three walls, four Strongholds, and a final Base", () => {
  const world = createWorld();
  const lines = world.defenseLines;
  assert.equal(lines.length, 3);
  assert.equal(lines.filter((item) => item.wall.active).length, 3);
  assert.equal(world.strongholds.filter((item) => item.role === "defense").length, 4);
  const attackerSpawns = world.strongholds.filter((item) => item.role === "spawn");
  assert.equal(attackerSpawns.length, 2);
  assert.deepEqual(attackerSpawns.map((item) => item.x), [250, 750]);

  const wall = lines[0].wall;
  const tank = {
    hp: 125,
    radius: 11,
    y: wall.y - 100,
    vy: -10,
    wallSides: Object.create(null),
  };
  world.resolveWallCollisions(tank, wall.y + 100);
  assert.equal(tank.y, wall.y + wall.thickness / 2 + tank.radius);
  tank.y = wall.y - 1000;
  world.resolveWallCollisions(tank, tank.y);
  assert.equal(tank.y, wall.y + wall.thickness / 2 + tank.radius);
});

test("destroying a defense line removes its wall and advances defender spawn", () => {
  const world = createWorld();
  const lines = world.defenseLines;
  const strongholds = world.strongholds.filter((item) => item.role === "defense");
  assert.deepEqual(world.getSpawnPoints(world.level.defenderTeam), strongholds.slice(0, 2));

  world.destroyDefenseLine(strongholds[0]);
  assert.equal(lines[0].destroyed, false);
  assert.equal(lines[0].wall.active, true);
  world.destroyDefenseLine(strongholds[1]);
  assert.equal(lines[0].wall.active, false);
  assert.equal(lines[0].destroyed, true);
  assert.equal(strongholds[2].targetable, true);
  assert.equal(strongholds[3].targetable, true);
  assert.deepEqual(world.getSpawnPoints(world.level.defenderTeam), strongholds.slice(2, 4));
});

test("third defense line destruction ends the match for attackers", () => {
  const world = createWorld();
  const strongholds = world.strongholds.filter((item) => item.role === "defense");
  for (const stronghold of strongholds) world.destroyDefenseLine(stronghold);
  world.completeDefenseLine(world.getActiveDefenseLine(), world.basePos.red);
  assert.equal(world.gameOver, true);
  assert.equal(world.winner, world.level.attackerTeam);
});

test("attacker bullets damage walls while defender bullets pass through", () => {
  const world = createWorld();
  const wall = world.defenseLines[0].wall;
  const attackerBullet = {
    team: world.level.attackerTeam,
    previousY: wall.y + 20,
    y: wall.y - 20,
    damage: 25,
    active: true,
  };
  assert.equal(world.handleBulletWallCollision(attackerBullet), true);
  assert.equal(wall.hp, 49975);
  assert.equal(attackerBullet.active, false);

  const defenderBullet = { ...attackerBullet, team: world.level.defenderTeam, active: true };
  assert.equal(world.handleBulletWallCollision(defenderBullet), false);
  assert.equal(defenderBullet.active, true);
});

test("destroying a wall detonates and destroys both linked Strongholds", () => {
  const world = createWorld();
  const line = world.defenseLines[0];
  const strongholds = world.strongholds.filter((item) => item.lineId === line.id);
  const explosionPositions = [];
  world.causeSpecialExplosion = (x, y) => explosionPositions.push({ x, y });
  const bullet = {
    team: world.level.attackerTeam,
    previousY: line.wall.y + 20,
    y: line.wall.y - 20,
    damage: line.wall.hp,
    active: true,
  };

  world.handleBulletWallCollision(bullet);

  assert.deepEqual(
    explosionPositions,
    strongholds.map(({ x, y }) => ({ x, y })),
  );
  assert.equal(strongholds.every((stronghold) => stronghold.destroyed), true);
  assert.equal(line.destroyed, true);
  assert.equal(world.activeDefenseLineIndex, 1);
});

test("destroying the final wall does not destroy the Base", () => {
  const world = createWorld();
  const strongholds = world.strongholds.filter((item) => item.role === "defense");
  for (const stronghold of strongholds) world.destroyDefenseLine(stronghold);
  const finalLine = world.getActiveDefenseLine();
  finalLine.wall.hp = 0;
  finalLine.wall.active = false;
  world.collapseStrongholdsBehindWall(finalLine.id);
  assert.equal(world.gameOver, false);
  assert.equal(world.baseHealth[world.level.defenderTeam], 10000);
});

test("defense scenario mirrors line positions and keeps Blue as defender", () => {
  const world = createWorld("defense");
  assert.equal(world.level.playerTeam, "blue");
  assert.equal(world.level.defenderTeam, "blue");
  assert.deepEqual(world.defenseLines.map((line) => line.wall.y), [2500, 3500, 4500]);
  assert.equal(world.defenseLines.at(-1).objectiveType, "base");
});

test("player respawn clears stale wall-side state before moving to a new defense line", () => {
  const world = createWorld("defense");
  const tank = new Tank(500, 2650, "blue", true);
  for (const line of world.defenseLines) tank.wallSides[line.id] = -1;
  tank.vx = 20;
  tank.vy = -30;

  const nextLine = world.defenseLines[1];
  const [spawn] = world.strongholds.filter((item) => item.lineId === nextLine.id);
  tank.respawn(spawn.x, spawn.y);

  assert.deepEqual(Object.keys(tank.wallSides), []);
  assert.equal(tank.vx, 0);
  assert.equal(tank.vy, 0);
  world.resolveWallCollisions(tank, tank.y);
  assert.ok(tank.y > nextLine.wall.y);
});

test("time expiry ends the match for defenders", () => {
  const world = createWorld();
  world.remainingTime = 0.01;
  world.update(0.02, { keys: {} });
  assert.equal(world.gameOver, true);
  assert.equal(world.winner, world.level.defenderTeam);
});

test("regular players gain one passive point every five seconds", () => {
  const world = createWorld("frontline");
  assert.equal(world.point, 10);
  world.updatePassivePoints(4.99);
  assert.equal(world.point, 10);
  world.updatePassivePoints(0.01);
  assert.equal(world.point, 11);
  world.updatePassivePoints(10);
  assert.equal(world.point, 13);
});

test("tanks fire using the world weapon profile", () => {
  const world = createWorld("frontline");
  const spawned = [];
  world.bulletPool.spawn = (projectile) => spawned.push(projectile);
  const tank = new Tank(500, 1000, "blue", true);
  world.addTank(tank);
  tank.turretAngle = 0;
  tank.tryShoot(world);
  assert.equal(tank.weaponId, "standard");
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].damage, 25);
  assert.ok(Math.abs(Math.hypot(spawned[0].vx, spawned[0].vy) - 450) < 1e-9);
  assert.equal(spawned[0].lifetime, 1.5);
  assert.equal(tank.fireCooldown, 0.5);
});

test("deployable barrier costs points, decays, and enforces its cooldown", () => {
  const world = createWorld("frontline");
  const placed = world.placeDeployableWall(500, 1500);
  assert.equal(placed.ok, true);
  assert.equal(world.point, 5);
  assert.equal(world.itemPointCost, 6);
  assert.equal(world.deployableWall.hp, 5000);
  assert.equal(world.deployableWallCooldown, 60);

  world.updateDeployableWall(10);
  assert.equal(world.deployableWall.hp, 4000);
  assert.equal(world.deployableWallCooldown, 50);
  world.updateDeployableWall(40);
  assert.equal(world.deployableWall.active, false);
  assert.equal(world.getDeployableWallPlacement(500, 1500).ok, false);
  world.updateDeployableWall(10);
  world.point = 10;
  assert.equal(world.getDeployableWallPlacement(500, 1500).ok, true);
});

test("all item uses consume and increase one shared point cost", () => {
  const world = createWorld("frontline");
  assert.equal(world.itemPointCost, 5);
  world.placeDeployableWall(500, 1500);
  assert.equal(world.point, 5);
  assert.equal(world.itemPointCost, 6);
  assert.equal(world.commitItemUse(), false);
  world.point = 20;
  assert.equal(world.commitItemUse(), true);
  assert.equal(world.point, 14);
  assert.equal(world.itemPointCost, 7);
});

test("deployable barrier blocks shots from both teams and blocks tanks", () => {
  const world = createWorld("frontline");
  world.point = 20;
  world.placeDeployableWall(500, 1500);
  const blueBullet = {
    team: "blue", previousX: 500, previousY: 1480, x: 500, y: 1520,
    radius: 3, damage: 25, active: true,
  };
  assert.equal(world.handleBulletWallCollision(blueBullet), true);
  assert.equal(blueBullet.active, false);
  assert.equal(world.deployableWall.hp, 4975);

  const redBullet = { ...blueBullet, team: "red", active: true };
  assert.equal(world.handleBulletWallCollision(redBullet), true);
  assert.equal(redBullet.active, false);
  assert.equal(world.deployableWall.hp, 4950);

  const tank = new Tank(500, 1520, "red");
  world.resolveWallCollisions(tank, 1480);
  assert.equal(tank.y, 1500 - 5 - tank.radius);
});

test("fast turret-sized projectiles use swept collision against tanks", () => {
  const world = createWorld("frontline");
  const target = new Tank(500, 1000, "red");
  world.addTank(target);
  const bullet = new Bullet();
  bullet.init({
    x: 480,
    y: 1000,
    vx: 2400,
    vy: 0,
    team: "blue",
    damage: 25,
    radius: 8,
    lifetime: 1,
    penRate: 1,
  });
  bullet.x = 520;
  world.bulletPool.pool.push(bullet);

  world.handleCollisions();

  assert.equal(target.hp, 100);
  assert.equal(bullet.active, false);
});

test("turret splash scales from base damage without crediting friendly deaths", () => {
  const world = createWorld("breakthrough");
  const friendly = new Tank(500, 1000, "blue");
  const enemy = new Tank(500, 1000, "red");
  friendly.hp = 10;
  enemy.hp = 10;
  world.addTank(friendly);
  world.addTank(enemy);

  world.causeTurretOrbitalStrike(500, 1000, "blue", 100);

  assert.ok(friendly.hp <= 0);
  assert.ok(enemy.hp <= 0);
  assert.equal(world.killcount.blue, 1);
  assert.equal(world.baseHealth.blue, 9995);
  assert.equal(world.baseHealth.red, 9995);

  const lowerDamageWorld = createWorld("breakthrough");
  const lowerDamageTarget = new Tank(500, 1000, "red");
  lowerDamageTarget.hp = 30;
  lowerDamageWorld.addTank(lowerDamageTarget);
  lowerDamageWorld.causeTurretOrbitalStrike(500, 1000, "blue", 50);
  assert.equal(lowerDamageTarget.hp, 5);
  assert.equal(lowerDamageWorld.killcount.blue, 0);
});

test("tanks can round a barrier end without being pushed back to the old side", () => {
  const world = createWorld("frontline");
  world.point = 20;
  world.placeDeployableWall(500, 1500);
  const wall = world.deployableWall;
  const tank = new Tank(500, 1480, "red");

  world.resolveWallCollisions(tank, 1480);
  assert.equal(tank.wallSides[wall.id], -1);

  tank.x = wall.x - wall.width / 2 - tank.radius;
  tank.y = 1520;
  world.resolveWallCollisions(tank, 1520);
  assert.equal(tank.wallSides[wall.id], undefined);

  tank.x += 1;
  world.resolveWallCollisions(tank, 1520);
  assert.equal(tank.wallSides[wall.id], 1);
  assert.equal(tank.y, 1520);
});

test("resizing preserves siege objective X proportions", () => {
  const world = createWorld();
  world.placeDeployableWall(500, 1900);
  const originalXs = world.strongholds.map((stronghold) => stronghold.x);
  world.canvas.width = 1600;
  world.resize(1600);
  assert.deepEqual(
    world.strongholds.map((stronghold) => stronghold.x),
    originalXs.map((x) => x * 1.6),
  );
  assert.equal(world.deployableWall.x, 800);
});

test("Frontline twin Strongholds use quarter-width positions", () => {
  const world = createWorld("frontline");
  const twinStrongholdXs = [...new Set(
    world.strongholds
      .filter((stronghold) => stronghold.x !== world.canvas.width / 2)
      .map((stronghold) => stronghold.x),
  )].sort((a, b) => a - b);
  assert.deepEqual(twinStrongholdXs, [250, 750]);
});

test("siege attackers spawn in configured waves", () => {
  const world = createWorld("siege");
  world.spawnWave(world.level.attackerTeam);
  const attackers = world.tanks.filter((tank) => tank.team === world.level.attackerTeam);
  assert.equal(attackers.length, 32);
  assert.equal(world.getSpawnBatchSize(world.level.attackerTeam), 32);
  assert.ok(new Set(attackers.map((tank) => tank.x < 500 ? "left" : "right")).size === 2);
});

test("attacker wave waits until all 32 slots are available", () => {
  const world = createWorld("siege");
  const attacker = world.level.attackerTeam;
  world.spawnWave(attacker);
  world.spawnWave(attacker);
  assert.equal(world.tanks.filter((tank) => tank.team === attacker).length, 64);

  for (let index = 0; index < 20; index++) {
    world.addTank(new (world.tanks[0].constructor)(0, 0, attacker, false));
  }
  assert.equal(world.getSpawnCount(attacker, 84), 0);
  assert.equal(world.spawnWave(attacker), false);
  assert.equal(world.tanks.filter((tank) => tank.team === attacker).length, 84);

  world.tanks.splice(-20, 20);
  assert.equal(world.getSpawnCount(attacker, 64), 32);
  assert.equal(world.spawnWave(attacker), true);
  assert.equal(world.tanks.filter((tank) => tank.team === attacker).length, 96);
});

test("attackers use normal strafe until they pass an objective, then navigate back", () => {
  const world = createWorld("siege");
  world.spawnWave(world.level.attackerTeam);
  const tank = world.tanks.find((item) => item.team === world.level.attackerTeam);
  tank.x = 0;
  tank.y = 4500;
  tank.strafeDir = 1;
  tank.strafeTimer = 1;

  assert.equal(selectStrategicTarget(tank, world), null);
  const previousX = tank.x;
  const previousY = tank.y;
  handleTankAI(tank, 0.5, world);
  assert.ok(tank.x > previousX);
  assert.ok(tank.y < previousY);

  tank.x = 0;
  tank.y = 1000;
  const target = selectStrategicTarget(tank, world);
  assert.equal(target.x, 250);
  assert.ok(target.y > tank.y);
  const recoveryX = tank.x;
  const recoveryY = tank.y;
  const targetDx = target.x - recoveryX;
  const targetDy = target.y - recoveryY;
  handleTankAI(tank, 0.5, world);
  const moveDx = tank.x - recoveryX;
  const moveDy = tank.y - recoveryY;
  const forwardProgress = moveDx * targetDx + moveDy * targetDy;
  assert.ok(forwardProgress > 0);
  assert.ok(tank.y > recoveryY);
  assert.equal(tank.fireCooldown, 0);
});

test("breakthrough tanks return toward the enemy Base after passing it", () => {
  const world = createWorld("breakthrough");
  const tank = new Tank(100, world.basePos.red.y - 100, "blue");
  world.addTank(tank);

  assert.equal(selectStrategicTarget(tank, world), world.basePos.red);
  const previousX = tank.x;
  const previousY = tank.y;
  handleTankAI(tank, 0.25, world);
  assert.ok(tank.x > previousX);
  assert.ok(tank.y > previousY);
});
