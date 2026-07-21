# ⚡ FORMATION BREAKER

### Stable Release — Control the Formation. Control the Battlefield.

You may enter expecting a simple shooter. You will quickly realize it is not.

**FORMATION BREAKER** is a large-scale top-down tactical shooter where victory depends on how armies move, spread, and reshape the battlefield. Dense formations bring overwhelming firepower, but one explosive shell or well-placed tactical item can tear them apart.

The desktop player always fights for the **Blue Team**. Each scenario changes Blue's role, force composition, and objective.

---

## 🎮 Large-Scale Bulletfield Warfare

- Battles ranging from a 36 vs 36 frontline clash to asymmetric 96 vs 32 sieges
- Independent AI movement, target selection, spacing, strafing, and evasive maneuvers
- Dense projectile patterns supported by pooled bullets, explosions, and audio
- A fixed-step 60 Hz simulation designed to remain stable under heavy unit counts
- Yellow player shells that remain visible inside red-and-blue crossfire

Aim matters, but formation decides how much firepower reaches the enemy—and how much survives the return volley.

---

## 🛡️ Four Ways to Break a Formation

### Frontline

The original 36 vs 36 battle. Capture and defend the central and twin Strongholds, move the spawn line forward, and destroy the enemy Base.

### Siege — Attack

Blue attacks with waves of 32 tanks and may field up to 96 units against 32 defenders. Break through three full-width defensive walls, collapse the twin Strongholds behind the first two lines, and destroy the final Red Base before the seven-minute limit.

Each wall has **50,000 HP**. Attacking shells cannot pass through it and damage the wall instead, while defending shells pass through it. AI never selects the wall itself as a target. When one of the first two walls falls, its linked Strongholds detonate and the defenders begin spawning from the next line.

### Siege — Defense

The same battlefield is reversed. Blue holds three layered defensive lines against Red's massed waves. Protect the final Blue Base for **seven minutes** to win; losing it ends the defense.

### Breakthrough

A pure ticket war with no Strongholds or turrets. Both teams deploy recurring 40-tank waves every 12 seconds and may field up to 80 tanks at once. The Bases at opposite ends cannot be attacked and serve only as formation anchors.

Each destroyed AI tank removes **5 tickets** from its team. Both sides begin with **10,000 tickets**, and the first team to run out loses. The player's death never consumes team tickets in any scenario.

To clear dense spawn formations, freshly spawned attackers—Blue in Siege Attack and Red in Siege Defense—and both Breakthrough teams begin at **2× movement speed**. The bonus decreases linearly to normal speed over two seconds. It applies to every AI tank and the normal player, but never to a Super Mode player.

---

## 💥 Player Weapons and Breakthrough Classes

The player can use all three data-driven weapon profiles in every desktop scenario. Breakthrough also assigns them to AI tanks in the following mix:

- **Standard Cannon — 70%:** circular tanks with accurate, sustained single-shot fire
- **Heavy Cannon — 10%:** square tanks with a three-times-longer reload, extended range, and 25–30 splash damage with strong knockback
- **Scatter Cannon — 20%:** equilateral-triangle tanks firing three standard shells across a 30-degree arc, spaced at 15-degree intervals

The player can cycle weapons with **Q** every 10 seconds in every scenario—or every 2 seconds in Super Mode. The current weapon, firing pattern, description, reload, and switch cooldown are shown in a dedicated HUD panel. AI tanks outside Breakthrough continue to use the Standard Cannon only.

---

## 🛰️ Points and Tactical Items

Normal play begins with **10 points**. The player gains 1 point per kill and another 1 point every 5 seconds.

Orbital Strike and Barrier share one escalating **Item Cost**. It begins at 5 points and rises by 1 whenever either item is used, so every deployment is a strategic commitment.

### Orbital Strike

- Five-second targeting warning in normal desktop play
- Up to 200 damage within a 250-unit blast radius
- Massive knockback with no friendly-fire protection
- 20-second desktop cooldown

Use it to break concentrations, reset a collapsing line, or create space for an advance.

### Barrier

- Places one short, horizontal 180-unit wall
- Starts with 5,000 HP and loses 100 HP per second
- Blocks tanks and every projectile from both teams
- Takes damage from every projectile it blocks
- Only one Barrier may exist at a time; placement has a 60-second cooldown

A Barrier survives for 50 seconds if it takes no battle damage, but concentrated fire can remove it much sooner.

---

## 🖱️ Desktop Controls

- **WASD:** Move
- **Mouse:** Aim
- **Left Click:** Fire
- **1 / 2:** Select Orbital Strike or Barrier
- **Right Click:** Deploy the selected item
- **Q:** Cycle player weapons
- **Space + Mouse Wheel:** Free camera
- **Esc:** Exit fullscreen
- **1–4 on the start screen:** Select a scenario
- **Hold a scenario button + Enter:** Start that scenario in Super Mode

---

## 📱 Mobile Spectator Mode

Mobile runs without a player tank, keeping direct controls simple and the battlefield readable.

- Drag the battlefield to move the camera
- Long-press the battlefield to deploy Orbital Strike
- Barrier placement and weapon switching remain desktop-only
- Mobile HUD text, scenario buttons, safe areas, and portrait/landscape layouts are handled separately from the game-world scale

---

## 🔁 A Battle That Keeps Moving

When a match ends, the game announces the next scenario and its one-line objective during a 10-second transition, then restarts with a different randomly selected scenario. The current scenario and objective remain visible during play.

Maps, scenarios, team rules, objectives, and weapon profiles are data-driven, while automated regression checks cover the major combat, spawning, collision, mobile-input, and scenario-validation rules.

---

## What Kind of Game Is This?

Shooter? Strategy? Tactical simulation?

**FORMATION BREAKER is not only about shooting better. It is about commanding chaos.**

Will you advance as a wall of fire, spread out to survive the bulletfield, or reshape the entire engagement with one perfectly timed strike?

**The battlefield is waiting.**
