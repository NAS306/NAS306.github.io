// Persistent victory currency is separate from spendable combat/run points.
export const PROGRESSION_KEY = 'tank-battle.progression.v1';
export const SUPER_UNLOCK_COST = 100000;
export const VICTORY_POINTS_PER_KILL = 20;
export const EXTRACTION_ROUND = 15;
export const PROGRESSION_MODES = Object.freeze(['frontline', 'siege', 'defense', 'breakthrough', 'roguelite']);

const empty = () => ({ version: 1, points: 0, unlocked: [], receipts: [] });
const amount = value => Number.isSafeInteger(value) && value >= 0;
export function parseProgression(raw) {
  if (!raw) return empty();
  const data = JSON.parse(raw);
  if (data.version !== 1 || !amount(data.points) || !Array.isArray(data.unlocked) || !Array.isArray(data.receipts)) throw new Error('Unsupported or damaged save');
  if (data.unlocked.some(id => !PROGRESSION_MODES.includes(id)) || data.receipts.some(id => typeof id !== 'string')) throw new Error('Invalid save');
  return { version: 1, points: data.points, unlocked: [...new Set(data.unlocked)], receipts: data.receipts.slice(-128) };
}
export function getVictoryReward({ mode, won, superMode = false, spectator = false, kills = 0, runPoints = 0 }) {
  if (!won || superMode || spectator || !PROGRESSION_MODES.includes(mode)) return 0;
  if (mode === 'roguelite' ? !Number.isFinite(runPoints) || runPoints < 0 : !amount(kills)) return 0;
  const value = mode === 'roguelite' ? Math.floor(runPoints) : kills * VICTORY_POINTS_PER_KILL;
  return amount(value) ? value : 0;
}

export class ProgressionStore {
  constructor(storage) { this.storage = storage; this.data = empty(); this.error = ''; this.blocked = false; this.dirty = false; this.reload(); }
  reload() {
    if (this.dirty) return; // Keep an unsaved reward available for a later retry.
    try { this.data = parseProgression(this.storage.getItem(PROGRESSION_KEY)); this.error = ''; this.blocked = false; }
    catch (error) { this.error = 'Progress could not be loaded. Existing saves will not be overwritten.'; this.blocked = true; }
  }
  save() {
    try { this.storage.setItem(PROGRESSION_KEY, JSON.stringify(this.data)); this.error = ''; this.dirty = false; return true; }
    catch { this.dirty = true; this.error = 'Progress is in memory only. Enable browser storage and retry saving before closing.'; return false; }
  }
  isUnlocked(mode) { return this.data.unlocked.includes(mode); }
  unlock(mode) {
    this.reload();
    if (this.blocked || !PROGRESSION_MODES.includes(mode) || this.isUnlocked(mode) || this.data.points < SUPER_UNLOCK_COST) return false;
    const previous = this.data;
    this.data = { ...previous, points: previous.points - SUPER_UNLOCK_COST, unlocked: [...previous.unlocked, mode] };
    if (this.save()) return true;
    this.data = previous; // Never spend currency on an unlock that cannot be saved.
    return false;
  }
  settle(id, result) {
    this.reload();
    if (this.blocked || this.data.receipts.includes(id)) return 0;
    const reward = Math.min(getVictoryReward(result), Number.MAX_SAFE_INTEGER - this.data.points);
    this.data = { ...this.data, points: this.data.points + reward, receipts: [...this.data.receipts, id].slice(-128) };
    this.save();
    return reward;
  }
}

let singleton;
export function getProgression() {
  if (!singleton) {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Report unavailable storage in the UI. */ }
    singleton = new ProgressionStore(storage);
  }
  return singleton;
}
export function createRewardSession(mode, superMode = false, spectator = false) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  let settled = false, reward = 0;
  return {
    settle(result) {
      if (!settled) { reward = getProgression().settle(id, { ...result, mode, superMode, spectator }); settled = true; }
      return reward;
    },
  };
}
export function victoryRewardText(reward, superMode = false) {
  const store = getProgression();
  return `${superMode ? 'SUPER MODE: no victory points' : `Victory points +${reward.toLocaleString('en-US')}`} | Wallet ${store.data.points.toLocaleString('en-US')}${store.error ? ` | ${store.error}` : ''}`;
}
export function renderProgressionGuide() {
  return `<section><h3>Victory points and permanent Super Modes</h3><p>Normal-mode victories add to one shared wallet. In Frontline, Siege Attack, Siege Defense, and Breakthrough, each personal kill is worth ${VICTORY_POINTS_PER_KILL} victory points, paid only if your team wins. Combat item points are separate. Defeat or leaving a match pays nothing.</p><p>In Roguelite, complete Round ${EXTRACTION_ROUND} to unlock Extract &amp; Win in preparation for Round ${EXTRACTION_ROUND + 1} and later. Extraction or surviving Round 30 counts as victory and banks only the run points remaining at the end, with no extra kill-based reward. Death is defeat and pays nothing. Spending run points lowers the possible payout.</p><p>Spend ${SUPER_UNLOCK_COST.toLocaleString('en-US')} shared victory points to permanently unlock Super Mode for one chosen mode; all five cost 500,000 total. Unlocking does not start a match. Use that mode's Play Super button afterward. Enter no longer bypasses locks. Every Super Mode awards zero victory points.</p><p>Roguelite Super Mode has unlimited run points and shows every ability during preparation. Select any ability repeatedly without the normal one-pick, rarity, prerequisite, or level restrictions. Recalibration still needs an owned ability; Pulse Shield remains a single timed shield when stacked. Ability tradeoffs and combat survival still apply.</p><p>The wallet and unlocks are saved in this browser on this site, independently of each run. Clearing site data removes them; another browser or the offline HTML has its own save. If saving fails, a visible status and Retry Save button appear.</p></section>`;
}
