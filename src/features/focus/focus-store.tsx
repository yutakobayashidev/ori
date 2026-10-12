import { createContext, useContext } from "react";
import type { FocusContext } from "./model";
import type { ActivityFailure } from "#/features/activities/model";
import type { changeFocus, saveWorkLog } from "./server-functions";

type Changes = Omit<Parameters<typeof changeFocus>[0]["data"], "requestId" | "expectedRevision">;
type Log = Omit<Parameters<typeof saveWorkLog>[0]["data"], "requestId" | "expectedRevision">;
type FocusStore = {
  snapshot: FocusContext | null;
  busy: boolean;
  error: string;
  retry: (() => Promise<void>) | null;
  refresh: () => Promise<boolean>;
  loadWorkHistory: (activityId: string) => Promise<FocusContext | ActivityFailure>;
  start: (activityId: string, budgetSeconds?: number, switchCurrent?: boolean) => Promise<boolean>;
  change: (change: Changes) => Promise<boolean>;
  saveLog: (log: Log, expectedRevision?: number) => Promise<boolean>;
  deleteLog: (id: string, expectedRevision?: number) => Promise<boolean>;
};
const Context = createContext<FocusStore | null>(null);
export const FocusStoreProvider = Context.Provider;
export function useFocus() {
  return useContext(Context);
}
export function useRequiredFocus() {
  const focus = useFocus();
  if (!focus) throw new Error("FocusProvider is required");
  return focus;
}
