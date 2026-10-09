import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useActivityStore } from "#/features/activities/activity-store";
import type { ActivityFailure, ActivityReceipt } from "#/features/activities/model";
import type { FocusContext } from "./model";
import { loadFocus, startFocus, changeFocus, saveWorkLog, deleteWorkLog } from "./server-functions";

type Changes = Omit<Parameters<typeof changeFocus>[0]["data"], "requestId" | "expectedRevision">;
type Log = Omit<Parameters<typeof saveWorkLog>[0]["data"], "requestId" | "expectedRevision">;
type FocusStore = {
  snapshot: FocusContext | null;
  busy: boolean;
  error: string;
  retry: (() => Promise<void>) | null;
  refresh: () => Promise<boolean>;
  start: (activityId: string, budgetSeconds?: number, switchCurrent?: boolean) => Promise<boolean>;
  change: (change: Changes) => Promise<boolean>;
  saveLog: (log: Log, expectedRevision?: number) => Promise<boolean>;
  deleteLog: (id: string, expectedRevision?: number) => Promise<boolean>;
};
const Context = createContext<FocusStore | null>(null);
export function useFocus() {
  return useContext(Context);
}
export function useRequiredFocus() {
  const focus = useFocus();
  if (!focus) throw new Error("FocusProvider is required");
  return focus;
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const activities = useActivityStore();
  const [snapshot, setSnapshot] = useState<FocusContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  const locked = useRef(false);
  const latestRevision = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const result = await loadFocus({ data: {} });
      if (!result.ok) throw new Error(result.error.message);
      if (result.revision >= latestRevision.current) {
        latestRevision.current = result.revision;
        setSnapshot(result);
      }
      return true;
    } catch {
      setError("Could not load your focus session. Try again.");
      return false;
    }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Read persistent state when activity events arrive.
    void refresh();
  }, [activities.revision, refresh]);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", reload);
    return () => document.removeEventListener("visibilitychange", reload);
  }, [refresh]);
  function identity() {
    return {
      requestId: crypto.randomUUID(),
      expectedRevision: Math.max(activities.currentRevision(), latestRevision.current),
    };
  }
  async function mutate(operation: () => Promise<ActivityReceipt | ActivityFailure>) {
    if (locked.current || !snapshot || activities.busy) return false;
    locked.current = true;
    setBusy(true);
    return new Promise<boolean>((resolve) => {
      let attempting = false;
      async function attempt() {
        if (attempting) return;
        attempting = true;
        setError("");
        setRetry(null);
        try {
          const result = await operation().catch(() => operation());
          if (result.ok) latestRevision.current = Math.max(latestRevision.current, result.revision);
          const [loaded] = await Promise.all([refresh(), activities.refresh()]);
          if (!result.ok)
            setError(
              result.error.code === "revision-conflict"
                ? "Your workspace changed. Review the latest state and try again."
                : result.error.message,
            );
          else if (!loaded) setError("Saved. Reload to see the latest session.");
          locked.current = false;
          setBusy(false);
          resolve(result.ok);
        } catch {
          setError("The result is unknown. Retry to confirm this same action.");
          setRetry(() => attempt);
        } finally {
          attempting = false;
        }
      }
      void attempt();
    });
  }
  return (
    <Context.Provider
      value={{
        snapshot,
        busy: busy || activities.busy,
        error,
        retry,
        refresh,
        start: (activityId, budgetSeconds, switchCurrent) => {
          const data = {
            ...identity(),
            activityId,
            budgetSeconds,
            switchCurrent,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
          return mutate(() => startFocus({ data }));
        },
        change: (changes) => {
          const data = { ...identity(), ...changes };
          return mutate(() => changeFocus({ data }));
        },
        saveLog: (log, expectedRevision) => {
          const data = { ...identity(), ...log };
          if (expectedRevision !== undefined) data.expectedRevision = expectedRevision;
          return mutate(() => saveWorkLog({ data }));
        },
        deleteLog: (id, expectedRevision) => {
          const data = { ...identity(), id };
          if (expectedRevision !== undefined) data.expectedRevision = expectedRevision;
          return mutate(() => deleteWorkLog({ data }));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
