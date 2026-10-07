type Listener = () => void;
const state = globalThis as typeof globalThis & { workspaceActivityListeners?: Set<Listener> };
const listeners = (state.workspaceActivityListeners ??= new Set<Listener>());
export function subscribeActivities(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function notifyActivities() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A disconnected viewer cannot fail a committed write. */
    }
  }
}
