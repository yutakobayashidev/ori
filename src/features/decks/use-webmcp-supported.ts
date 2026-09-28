import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => Boolean(document.modelContext);
const getServerSnapshot = () => false;

export function useWebMCPSupported() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
