export const STARTING_AMMO = 300;
export const ROUND_AMMO_SUPPLY = 200;
export const EXPLOSIVE_AMMO_COST = 10;

export function getAmmoPerPoint(round) {
  if (!Number.isInteger(round) || round < 1) throw new RangeError('Round must be a positive integer');
  return Math.max(1, 21 - round);
}

export function supplyRoundAmmo(player, round) {
  const previous = player.ammoSuppliedThroughRound;
  if (round <= previous) return 0;
  const supply = (round - previous) * ROUND_AMMO_SUPPLY;
  player.ammo += supply;
  player.ammoSuppliedThroughRound = round;
  return supply;
}

export function planAmmoVolley(ammo, regularCount, explosiveCount = 0) {
  // Reserve complete 10-ammo payloads first, then fire affordable standard shells.
  // If fewer than 10 remain, standard fire can still use the remainder.
  const explosive = Math.min(explosiveCount, Math.floor(ammo / EXPLOSIVE_AMMO_COST));
  const regular = Math.min(regularCount, ammo - explosive * EXPLOSIVE_AMMO_COST);
  return {
    regular, explosive,
    cost: regular + explosive * EXPLOSIVE_AMMO_COST,
    fullCost: regularCount + explosiveCount * EXPLOSIVE_AMMO_COST,
  };
}
