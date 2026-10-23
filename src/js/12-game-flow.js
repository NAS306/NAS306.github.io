// One shared end-of-game destination for every mode.

let modeSelectionHandler = null;

export function setModeSelectionHandler(handler) {
  modeSelectionHandler = handler;
}

export function returnToModeSelection() {
  // The application owns session disposal; shared assets stay loaded in memory.
  modeSelectionHandler?.();
}
