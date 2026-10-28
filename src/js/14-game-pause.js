// Shared modal pause freezes both game loops without changing match state.
const tokens = new Set(), listeners = new Set();
export const isGamePaused = () => tokens.size > 0;
export function subscribeGamePause(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function acquireGamePause() {
  const token = {}; tokens.add(token);
  if (tokens.size === 1) for (const listener of listeners) listener(true);
  let released = false;
  return () => {
    if (released) return;
    released = true; tokens.delete(token);
    if (!tokens.size) for (const listener of listeners) listener(false);
  };
}
