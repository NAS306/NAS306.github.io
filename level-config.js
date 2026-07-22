import { resolveWeaponProfile } from "./weapon-config.js";

const VALID_TEAMS = new Set(["blue", "red"]);
const VALID_MODES = new Set(["frontline", "siege", "attrition"]);
const VALID_OBJECTIVE_TYPES = new Set(["stronghold", "base"]);

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function requireNormalizedPosition(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
}

function validateTeamRules(rules, team, { requireWave = false } = {}) {
  if (!rules || !Number.isInteger(rules.maxTanks) || rules.maxTanks <= 0) {
    throw new Error(`Invalid maxTanks for ${team}`);
  }
  requirePositiveNumber(rules.spawnInterval, `spawnInterval for ${team}`);
  if (requireWave && rules.spawnMode !== "wave") {
    throw new Error(`${team} must use wave spawning`);
  }
  if (rules.spawnMode !== undefined && rules.spawnMode !== "wave") {
    throw new Error(`Invalid spawnMode for ${team}`);
  }
  if (rules.spawnMode === "wave") {
    if (
      !Number.isInteger(rules.waveSize) ||
      rules.waveSize <= 0 ||
      rules.waveSize > rules.maxTanks
    ) {
      throw new Error(`Invalid waveSize for ${team}`);
    }
  }
  if (rules.spawnSpeedBoost !== undefined) {
    const boost = rules.spawnSpeedBoost;
    if (!boost || !Number.isFinite(boost.multiplier) || boost.multiplier <= 1) {
      throw new Error(`Invalid spawnSpeedBoost multiplier for ${team}`);
    }
    requirePositiveNumber(
      boost.duration,
      `spawnSpeedBoost duration for ${team}`,
    );
  }
}

export function resolveScenario(catalog, scenarioId) {
  const scenario = catalog?.scenarios?.[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const map = catalog?.maps?.[scenario.map];
  if (!map) throw new Error(`Unknown map: ${scenario.map}`);
  if (!VALID_MODES.has(scenario.mode)) {
    throw new Error(`Invalid scenario mode: ${scenario.mode}`);
  }
  requirePositiveNumber(map.worldHeight, `worldHeight for map ${scenario.map}`);
  if (!VALID_TEAMS.has(scenario.playerTeam)) {
    throw new Error(`Invalid player team: ${scenario.playerTeam}`);
  }
  if (scenario.playerTeam !== "blue") {
    throw new Error("The player team must always be blue");
  }
  for (const field of ["title", "summary", "objective"]) {
    if (typeof scenario[field] !== "string" || scenario[field].trim() === "") {
      throw new Error(`Scenario ${scenarioId} requires a non-empty ${field}`);
    }
  }
  if (scenario.mode === "siege") validateSiegeScenario(scenario, map);
  if (scenario.mode === "attrition") validateAttritionScenario(scenario);
  return structuredClone({ id: scenarioId, ...scenario, mapDefinition: map });
}

function validateAttritionScenario(scenario) {
  if (scenario.victoryCondition !== "tickets") {
    throw new Error("Attrition scenarios require the ticket victory condition");
  }
  if (!Array.isArray(scenario.weaponDistribution) || scenario.weaponDistribution.length === 0) {
    throw new Error("Attrition scenarios require a weapon distribution");
  }
  for (const entry of scenario.weaponDistribution) {
    resolveWeaponProfile(entry.id);
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      throw new Error(`Invalid attrition weapon weight: ${entry.id}`);
    }
  }
  for (const team of VALID_TEAMS) {
    const rules = scenario.teams?.[team];
    validateTeamRules(rules, team, { requireWave: true });
  }
}

function validateSiegeScenario(scenario, map) {
  if (!VALID_TEAMS.has(scenario.attackerTeam) || !VALID_TEAMS.has(scenario.defenderTeam)) {
    throw new Error("Siege teams must be blue or red");
  }
  if (scenario.attackerTeam === scenario.defenderTeam) {
    throw new Error("Siege attacker and defender must differ");
  }
  if (!Array.isArray(map.defenseLines) || map.defenseLines.length !== 3) {
    throw new Error("Siege maps require exactly three defense lines");
  }
  if (!Array.isArray(map.strongholdXs) || map.strongholdXs.length !== 2) {
    throw new Error("Siege maps require two Stronghold X positions");
  }
  if (!Array.isArray(map.attackerSpawn?.xs) || map.attackerSpawn.xs.length !== 2) {
    throw new Error("Siege maps require two attacker spawn X positions");
  }
  requirePositiveNumber(map.timeLimit, "Siege timeLimit");
  requirePositiveNumber(map.wallThickness, "Siege wallThickness");
  requirePositiveNumber(map.wallHp, "Siege wallHp");
  map.strongholdXs.forEach((value, index) =>
    requireNormalizedPosition(value, `strongholdXs[${index}]`),
  );
  map.attackerSpawn.xs.forEach((value, index) =>
    requireNormalizedPosition(value, `attackerSpawn.xs[${index}]`),
  );
  requireNormalizedPosition(map.attackerSpawn.y, "attackerSpawn.y");
  const lineIds = new Set();
  map.defenseLines.forEach((line, index) => {
    if (typeof line.id !== "string" || line.id.trim() === "" || lineIds.has(line.id)) {
      throw new Error(`Invalid or duplicate defense line id at index ${index}`);
    }
    lineIds.add(line.id);
    requireNormalizedPosition(line.wallY, `defenseLines[${index}].wallY`);
    requireNormalizedPosition(line.objectiveY, `defenseLines[${index}].objectiveY`);
    requirePositiveNumber(line.hp, `defenseLines[${index}].hp`);
    if (!VALID_OBJECTIVE_TYPES.has(line.objectiveType)) {
      throw new Error(`Invalid objectiveType at defense line ${line.id}`);
    }
    const expectedType = index === map.defenseLines.length - 1 ? "base" : "stronghold";
    if (line.objectiveType !== expectedType) {
      throw new Error(`Defense line ${line.id} must use objectiveType ${expectedType}`);
    }
  });
  for (const team of [scenario.attackerTeam, scenario.defenderTeam]) {
    const rules = scenario.teams?.[team];
    validateTeamRules(rules, team, {
      requireWave: team === scenario.attackerTeam,
    });
  }
}

export async function loadLevelCatalog(path = "./levels/levels.json") {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${path}`);
  return response.json();
}

export function chooseRandomScenarioId(catalog, currentId, random = Math.random) {
  const candidates = Object.keys(catalog?.scenarios ?? {}).filter(
    (scenarioId) => scenarioId !== currentId,
  );
  if (candidates.length === 0) return currentId;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}
