import { createContext, useContext } from "react";
import type { z } from "zod";
import type { Activity, updateActivityUserInput } from "./model";

type Changes = Omit<
  z.input<typeof updateActivityUserInput>,
  "requestId" | "expectedRevision" | "id"
>;
export type ActivityStore = {
  revision: number;
  currentRevision: () => number;
  retryPending: (() => Promise<void>) | null;
  activities: Activity[];
  loading: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<boolean>;
  change: (id: string, changes: Changes, expectedRevision?: number) => Promise<boolean>;
};
const Context = createContext<ActivityStore | null>(null);
export const ActivityStoreProvider = Context.Provider;
export function useActivityStore() {
  const store = useContext(Context);
  if (!store) throw new Error("ActivityStoreProvider is required");
  return store;
}
