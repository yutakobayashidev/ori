import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Activity, ActivityContext } from "./model";
import { changeActivity, createHomeActivity, loadActivities } from "./server-functions";

type Changes = Omit<
  Parameters<typeof changeActivity>[0]["data"],
  "requestId" | "expectedRevision" | "id"
>;
type NewTask = Omit<
  Parameters<typeof createHomeActivity>[0]["data"],
  "requestId" | "expectedRevision" | "id"
>;
type ActivityStore = {
  revision: number;
  currentRevision: () => number;
  retryPending: (() => Promise<void>) | null;
  activities: Activity[];
  loading: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<boolean>;
  change: (id: string, changes: Changes, expectedRevision?: number) => Promise<boolean>;
  create: (task: NewTask) => Promise<boolean>;
};
const Context = createContext<ActivityStore | null>(null);

export function ActivityStateProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState<ActivityContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryPending, setRetryPending] = useState<(() => Promise<void>) | null>(null);
  const revision = useRef(0);
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled) return false;
    try {
      const result = await loadActivities();
      if (!result.ok) throw new Error(result.error.message);
      if (result.revision >= revision.current) {
        revision.current = result.revision;
        setSnapshot(result);
      }
      if (!locked.current) setError("");
      return true;
    } catch {
      setError("Could not load your activities. Please retry.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    // The initial snapshot must not wait for an available streaming connection.
    // oxlint-disable-next-line react/set-state-in-effect -- refresh reads the server asynchronously.
    void refresh();
    const events = new EventSource("/api/activities/events");
    const reload = () => {
      void refresh();
    };
    // The stream emits change on connect/reconnect; read independently if it fails.
    events.addEventListener("error", reload);
    events.addEventListener("change", reload);
    return () => events.close();
  }, [enabled, refresh]);
  async function mutate(run: () => ReturnType<typeof changeActivity>) {
    if (!enabled || locked.current || !snapshot) return false;
    locked.current = true;
    setBusy(true);
    // Keep the original caller pending until the exact receipt is resolved.
    return new Promise<boolean>((resolve) => {
      let attempting = false;
      function finish(saved: boolean) {
        locked.current = false;
        setBusy(false);
        setRetryPending(null);
        resolve(saved);
      }
      async function attempt() {
        if (attempting) return;
        attempting = true;
        setRetryPending(null);
        setError("");
        try {
          const result = await run().catch(() => run());
          if (!result.ok) {
            await refresh();
            setError(
              result.error.code === "revision-conflict"
                ? "Your list changed. Review the latest activity and try again."
                : result.error.message,
            );
            finish(false);
            return;
          }
          if (!(await refresh()))
            setError("Saved, but could not refresh your activities. Please retry loading.");
          finish(true);
        } catch {
          setError("The save result is unknown. Retry to confirm this same change.");
          setRetryPending(() => attempt);
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
        revision: snapshot?.revision ?? 0,
        currentRevision: () => revision.current,
        retryPending,
        activities: snapshot?.activities ?? [],
        loading,
        busy,
        error,
        refresh,
        change: (id, changes, expectedRevision) => {
          const data = {
            ...changes,
            id,
            requestId: crypto.randomUUID(),
            expectedRevision: expectedRevision ?? revision.current,
          };
          return mutate(() => changeActivity({ data }));
        },
        create: (task) => {
          const data = {
            ...task,
            id: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            expectedRevision: revision.current,
          };
          return mutate(() => createHomeActivity({ data }));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useActivities() {
  const state = useContext(Context);
  if (!state) throw new Error("ActivityStateProvider is required");
  return state;
}
