/**
 * Commits a value that is still being typed into a text field before the app
 * reads the store (save, leave, window close). Chart-info fields write to the
 * store on blur, so a value typed right before Ctrl+S or a window close was
 * otherwise saved without it, or lost.
 */
export function commitFocusedField(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.blur();
    return true;
  }
  return false;
}

/**
 * The blur above updates the store, but the Editor's leave guard is registered
 * in an effect that runs after React re-renders. Callers that check the guard
 * right after a commit wait one turn so the new state is in place.
 */
export function waitForStoreUpdate(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
