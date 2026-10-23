// Per-run totals; round cleanup and stat upgrades must never reset these.
export function createRogueRunStats() {
  return { damageTaken: 0, damageDealt: 0, healing: 0, ammoSpent: 0 };
}

export function healRoguePlayer(player, amount) {
  if (player.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return 0;
  const restored = Math.max(0, Math.min(amount, player.maxHP - player.hp));
  player.hp += restored;
  if (player.runStats) player.runStats.healing += restored;
  return restored;
}

export const ROGUE_RUN_METRICS = Object.freeze([
  { key: 'kills', label: 'Enemy tanks destroyed' },
  { key: 'damageTaken', label: 'Damage taken' },
  { key: 'damageDealt', label: 'Damage dealt' },
  { key: 'healing', label: 'HP restored' },
  { key: 'ammoSpent', label: 'Ammo spent' },
  { key: 'pointsEarned', label: 'Total points earned' },
  { key: 'ammoPerKill', label: 'Ammo per kill', decimals: 2 },
]);

export function getRogueRunMetricValues(state, stats) {
  return { ...stats, kills: state.kills, pointsEarned: state.pointsEarned,
    ammoPerKill: state.kills > 0 ? stats.ammoSpent / state.kills : null };
}

export function formatRogueMetric(value, decimals = 1) {
  if (value === null) return '—';
  return decimals === 2 ? value.toFixed(2) : Number(value.toFixed(decimals)).toLocaleString('en-US');
}

export function getRogueRunSummary(state, stats) {
  const values = getRogueRunMetricValues(state, stats);
  return ROGUE_RUN_METRICS.map(metric => ({ ...metric, value: formatRogueMetric(values[metric.key], metric.decimals) }));
}
