import { STARTING_AMMO, ROUND_AMMO_SUPPLY, EXPLOSIVE_AMMO_COST, getAmmoPerPoint } from './20-rogue-ammo.js';
import { ENEMY_DICE_FACES, ENEMY_DICE_MIN_BONUS, ENEMY_DICE_MAX_BONUS } from './21-rogue-dice.js';
import { ROGUE_RUN_METRICS } from './22-rogue-stats.js';
import { ROGUE_PLAYER_BASE, ROGUE_EXPLOSION_RULES, getRoguePlayerWeapon } from './40-rogue-balance.js';
import { ABILITIES, RARITIES, abilityRarity, ABILITY_CHOICE_COUNT } from './41-rogue-abilities.js';
import { ROUND_COUNT, ROUND_SECONDS, KILL_POINTS, UPGRADES, getRoundConfig } from './42-rogue-state.js';

import { renderProgressionGuide } from './23-progression.js';

const escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// One English manual for the selector and preparation screen. Balance values and
// ability descriptions come from the same data that drives actual combat.
export function renderRogueGuide() {
  const weapon = getRoguePlayerWeapon({}), first = getRoundConfig(1), last = getRoundConfig(ROUND_COUNT);
  const tiers = Object.keys(RARITIES);
  const abilities = Object.entries(ABILITIES).sort(([a], [b]) => tiers.indexOf(abilityRarity(a)) - tiers.indexOf(abilityRarity(b)));
  return `${renderProgressionGuide()}<section><h3>Survive, upgrade, and balance the risk</h3>
    <p>Control one tank through ${ROUND_COUNT} rounds of ${ROUND_SECONDS} seconds. Extract after completing Round 15 or survive the final round for VICTORY; destruction immediately ends the run with LOST. Music stops for either result. There are no allies, bases, or respawns, and no passive point income by default.</p>
    <p>Start with ${ROGUE_PLAYER_BASE.maxHP} HP, ${ROGUE_PLAYER_BASE.speed} move speed, and ${STARTING_AMMO} ammo. Your Standard Cannon deals ${weapon.damage} base damage, fires ${1 / weapon.reloadTime} times per second, and has ${weapon.projectileSpeed} shell speed and ${weapon.projectileLifetime}s shell life. Weapon switching is disabled.</p>
    <p><strong>Controls:</strong> WASD / arrow keys to move, mouse to aim, left click to fire. Direct play requires a keyboard and mouse.</p></section>
    <section><h3>Between rounds</h3><p>Round 1 starts immediately. Before rounds 2–${ROUND_COUNT}, choose one free ability or skip it, buy upgrades or ammo, then start the next round. An enemy die rolls once; acknowledge the card to enter combat. Rolling locks purchases and ability changes. HP, ammo, upgrades, and abilities carry over.</p></section>
    <section><h3>Points and upgrades</h3><p>Each credited kill earns ${KILL_POINTS} base points. Each upgrade has its own price: <strong>5 → 7 → 9 → 11… points</strong>, increasing by 2 after each purchase of that item.</p>
    <div class="rogue-guide-table"><table><thead><tr><th>Upgrade</th><th>Effect per purchase</th></tr></thead><tbody>${Object.values(UPGRADES).map(item => `<tr><td>${escapeHTML(item.name)}</td><td>${escapeHTML(item.description)}</td></tr>`).join('')}</tbody></table></div>
    <p>Repair restores HP to your current maximum and cannot be bought at full HP. Increasing maximum HP never heals instantly. Positive armor reduces damage with a minimum of 1 per hit; negative armor adds its absolute value to incoming damage.</p></section>
    <section><h3>Ammunition gets more expensive</h3><p>Start with ${STARTING_AMMO} ammo and receive <strong>${ROUND_AMMO_SUPPLY} free ammo before each later round</strong>, keeping leftovers. Purchases are available in preparation from Round 2. Each point buys one fewer shell each round, reaching 1 shell per point in Round 20 and staying there through Round ${ROUND_COUNT}.</p>
    <div class="rogue-guide-table"><table><thead><tr><th>Round</th><th>Ammo for 1 point</th></tr></thead><tbody>${[1, 2, 5, 10, 15, 19, 20, ROUND_COUNT].map(round => `<tr><td>${round}</td><td>${getAmmoPerPoint(round)}</td></tr>`).join('')}</tbody></table></div>
    <p>A standard shell costs 1 ammo; an additional explosive shell costs ${EXPLOSIVE_AMMO_COST}. Multishot spends ammo on every standard shell. With limited ammo, only affordable projectiles fire.</p></section>
    <section><h3>Abilities and rarity</h3><p>Each preparation offers ${ABILITY_CHOICE_COUNT} different cards. Each slot first rolls its rarity: ${Object.values(RARITIES).map(tier => `<strong>${tier.name} ${Math.round(tier.chance * 100)}%</strong>`).join(' / ')}, then selects an eligible ability from that tier. Choose at most one, or continue without choosing. Repeat picks stack both benefits and penalties. Max-level abilities are excluded.</p>
    <p>Most percentages add relative to base stats. Oversized Rounds multiplies shell size and speed; Devil’s Bargain multiplies points and damage taken. Maximum HP cannot fall below 25, the base damage and shell-speed multipliers cannot fall below 20%, and move/fire-rate multipliers cannot fall below 25%. Oversized Rounds applies its speed factor after the shell-speed floor.</p>
    <p><strong>Recalibration:</strong> choose an owned ability to lose one level, removing it at level 1. Both benefits and penalties are recalculated. This action does not stack, heal, revive, or refund discarded points. You may cancel before choosing a target or continue to forfeit it.</p>
    <p><strong>Pulse Shield:</strong> first activates 3 seconds into each round, then blocks all damage during seconds 3–4, 6–7, and so on. Its clock runs only during combat and resets each round.</p>
    <p>Wide Blast and Unstable Warheads require Explosive Payload or Death Cascade. Round Dividend pays only after a cleared round; Devil’s Bargain also multiplies this reward. The Dividend cap limits your held points, and only points actually received are counted.</p>
    <div class="rogue-guide-table"><table class="rogue-guide-abilities"><thead><tr><th>Ability</th><th>Rarity</th><th>Benefit and tradeoff per pick</th></tr></thead><tbody>${abilities.map(([id, ability]) => `<tr data-guide-ability="${id}"><td>${escapeHTML(ability.name)}</td><td>${RARITIES[abilityRarity(id)].name}</td><td>${escapeHTML(ability.description)}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>Enemies and the enemy die</h3><p>Simultaneous enemies increase from ${first.maxEnemies} to ${last.maxEnemies}, with defeated tanks continuously replaced. Before dice buffs, enemy HP increases from ${first.enemyMaxHP} to ${last.enemyMaxHP}; movement and fire rate start at half the team-mode base values. Later rounds shorten replacement delays and gently increase HP and damage.</p>
    <p>The ${ENEMY_DICE_FACES.length} equally likely die results are ${ENEMY_DICE_FACES.map(face => face.name).join(', ')}. Stat results add ${ENEMY_DICE_MIN_BONUS}–${ENEMY_DICE_MAX_BONUS}% of base permanently for the rest of the run. Pass adds nothing; Bomb adds the same rolled bonus to all five enemy stats. Repeated bonuses add rather than multiply.</p></section>
    <section><h3>Shells, explosions, and recovery</h3><p>Ricochet adds one arena-wall bounce per level without extending shell life; a corner uses one bounce. Standard-shell multishot and piercing do not multiply or pierce explosive payloads. Payload blast radius is capped at ${ROGUE_EXPLOSION_RULES.maxPayloadRadius}px, and Death Cascade at ${ROGUE_EXPLOSION_RULES.maxNovaRadius}px. Blast damage falls with distance. Player payloads and death blasts only hurt enemies; chained credited kills each award points and kill healing once. Healing cannot exceed maximum HP or revive a destroyed tank.</p></section>
    <section><h3>Results and round history</h3><p>The results area uses 80% of the layout, with compact current stats on the left. Totals show ${ROGUE_RUN_METRICS.map(metric => metric.label.toLowerCase()).join(', ')}. All six round trends share one graph, each normalized to its own peak of 100%. The totals, table, and tooltips show actual values. Toggle individual lines with the legend.</p>
    <p>Ammo per kill is ammo spent divided by kills, calculated separately for each round and for the whole run. A zero-kill result displays — and has no efficiency point. Shop repairs count toward the following round. Hover a round row or chart point to see its upgrade purchases, chosen ability, levels, and Recalibration changes. Results stay open until you choose Mode Select; a new run clears run upgrades and history, while the shared wallet and permanent unlocks remain.</p></section>`;
}

let guideDialog = null;
export function isRogueGuideOpen() { return !!guideDialog?.open; }

export function installRogueGuide() {
  if (guideDialog) return;
  guideDialog = document.createElement('dialog');
  guideDialog.className = 'rogue-guide-dialog'; guideDialog.setAttribute('aria-labelledby', 'rogue-guide-title');
  guideDialog.innerHTML = '<header><div><span>FIELD MANUAL</span><h2 id="rogue-guide-title">Roguelite Mode Guide</h2></div><button type="button" autofocus aria-label="Close mode guide">Close ×</button></header><div class="rogue-guide-content" tabindex="0"></div>';
  document.body.append(guideDialog);
  let opener = null;
  guideDialog.querySelector('button').addEventListener('click', () => guideDialog.close());
  guideDialog.addEventListener('close', () => opener?.isConnected && opener.focus());
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-rogue-guide], [data-progression-guide]');
    if (!trigger || guideDialog.open) return;
    opener = trigger;
    guideDialog.querySelector('#rogue-guide-title').textContent = trigger.hasAttribute('data-progression-guide') ? 'Progression Guide' : 'Roguelite Mode Guide';
    guideDialog.querySelector('.rogue-guide-content').innerHTML = trigger.hasAttribute('data-progression-guide') ? renderProgressionGuide() : renderRogueGuide();
    guideDialog.querySelector('.rogue-guide-content').scrollTop = 0;
    guideDialog.showModal();
  });
}
