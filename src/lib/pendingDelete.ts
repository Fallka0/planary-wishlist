// Remove with Undo: the item leaves the list at once, but the API call waits until the Undo
// window has passed. Undo cancels it, so nothing has to be re-created (and a friend's reservation
// on it isn't lost). Timers live outside React, so leaving the page doesn't cancel a removal.

export const UNDO_MS = 5000;

const timers = new Map<string, number>();

export function scheduleDelete(key: string, run: () => void, ms = UNDO_MS) {
  cancelDelete(key);
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      run();
    }, ms),
  );
}

/** Returns whether there was still something to cancel. */
export function cancelDelete(key: string): boolean {
  const t = timers.get(key);
  if (t === undefined) return false;
  window.clearTimeout(t);
  timers.delete(key);
  return true;
}
