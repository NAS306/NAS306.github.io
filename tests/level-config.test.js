import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chooseRandomScenarioId, resolveScenario } from "../src/js/11-level-config.js";

const catalog = JSON.parse(
  await readFile(new URL("../src/data/levels.json", import.meta.url), "utf8"),
);

test("all shipped scenarios resolve", () => {
  for (const scenarioId of Object.keys(catalog.scenarios)) {
    const scenario = resolveScenario(catalog, scenarioId);
    assert.equal(scenario.id, scenarioId);
    assert.ok(scenario.title.length > 0);
    assert.ok(scenario.summary.length > 0);
    assert.ok(scenario.objective.length > 0);
  }
});

test("siege scenarios share one map, keep Blue player, and swap team roles", () => {
  const attack = resolveScenario(catalog, "siege");
  const defense = resolveScenario(catalog, "defense");
  assert.deepEqual(attack.mapDefinition, defense.mapDefinition);
  assert.equal(attack.playerTeam, "blue");
  assert.equal(defense.playerTeam, "blue");
  assert.equal(attack.playerTeam, attack.attackerTeam);
  assert.equal(defense.playerTeam, defense.defenderTeam);
});

test("siege attackers use identical wave rules in both player perspectives", () => {
  for (const scenarioId of ["siege", "defense"]) {
    const scenario = resolveScenario(catalog, scenarioId);
    const attacker = scenario.teams[scenario.attackerTeam];
    const defender = scenario.teams[scenario.defenderTeam];
    assert.equal(attacker.maxTanks, 96);
    assert.equal(attacker.spawnMode, "wave");
    assert.equal(attacker.waveSize, 32);
    assert.equal(attacker.spawnInterval, 12);
    assert.deepEqual(attacker.spawnSpeedBoost, { multiplier: 2, duration: 2 });
    assert.equal(defender.maxTanks, 32);
    assert.equal(defender.spawnInterval, 4);
    assert.notEqual(defender.spawnMode, "wave");
    assert.equal(defender.spawnSpeedBoost, undefined);
  }
  const scenario = resolveScenario(catalog, "siege");
  assert.equal(scenario.mapDefinition.defenseLines.length, 3);
  assert.deepEqual(
    scenario.mapDefinition.defenseLines.map((line) => line.wallY),
    [0.5, 0.3, 0.1],
  );
  assert.equal(scenario.mapDefinition.defenseLines.at(-1).objectiveType, "base");
  assert.equal(scenario.mapDefinition.wallHp, 50000);
  assert.equal(scenario.mapDefinition.timeLimit, 420);
  assert.deepEqual(scenario.mapDefinition.strongholdXs, [0.25, 0.75]);
  assert.deepEqual(scenario.mapDefinition.attackerSpawn.xs, [0.25, 0.75]);
});

test("random restart excludes the current scenario", () => {
  assert.equal(chooseRandomScenarioId(catalog, "frontline", () => 0), "siege");
  assert.equal(chooseRandomScenarioId(catalog, "frontline", () => 0.999), "breakthrough");
  for (let index = 0; index < 10; index++) {
    assert.notEqual(chooseRandomScenarioId(catalog, "siege"), "siege");
  }
});

test("breakthrough uses recurring 40-tank waves and 10,000 tickets", () => {
  const scenario = resolveScenario(catalog, "breakthrough");
  assert.equal(scenario.mode, "attrition");
  assert.equal(scenario.playerTeam, "blue");
  assert.equal(scenario.victoryCondition, "tickets");
  for (const team of ["blue", "red"]) {
    assert.equal(scenario.teams[team].maxTanks, 80);
    assert.equal(scenario.teams[team].waveSize, 40);
    assert.equal(scenario.teams[team].spawnInterval, 12);
    assert.equal(scenario.teams[team].spawnMode, "wave");
    assert.deepEqual(scenario.teams[team].spawnSpeedBoost, {
      multiplier: 2,
      duration: 2,
    });
  }
  assert.deepEqual(scenario.weaponDistribution, [
    { id: "standard", weight: 0.7 },
    { id: "heavy", weight: 0.1 },
    { id: "scatter", weight: 0.2 },
  ]);
});

test("scenario validation rejects rules that would stall runtime state", () => {
  const missingInterval = structuredClone(catalog);
  delete missingInterval.scenarios.breakthrough.teams.red.spawnInterval;
  assert.throws(
    () => resolveScenario(missingInterval, "breakthrough"),
    /spawnInterval for red must be a positive number/,
  );

  const invalidWave = structuredClone(catalog);
  invalidWave.scenarios.breakthrough.teams.blue.waveSize = 0;
  assert.throws(
    () => resolveScenario(invalidWave, "breakthrough"),
    /Invalid waveSize for blue/,
  );

  const missingTimeLimit = structuredClone(catalog);
  delete missingTimeLimit.maps.three_lines.timeLimit;
  assert.throws(
    () => resolveScenario(missingTimeLimit, "siege"),
    /Siege timeLimit must be a positive number/,
  );

  const invalidSpawnBoost = structuredClone(catalog);
  invalidSpawnBoost.scenarios.siege.teams.blue.spawnSpeedBoost.duration = 0;
  assert.throws(
    () => resolveScenario(invalidSpawnBoost, "siege"),
    /spawnSpeedBoost duration for blue must be a positive number/,
  );
});

test("siege map validation rejects malformed defense lines", () => {
  const invalidPosition = structuredClone(catalog);
  invalidPosition.maps.three_lines.defenseLines[0].wallY = 1.2;
  assert.throws(
    () => resolveScenario(invalidPosition, "siege"),
    /defenseLines\[0\]\.wallY must be between 0 and 1/,
  );

  const invalidFinalObjective = structuredClone(catalog);
  invalidFinalObjective.maps.three_lines.defenseLines[2].objectiveType = "stronghold";
  assert.throws(
    () => resolveScenario(invalidFinalObjective, "defense"),
    /must use objectiveType base/,
  );
});
