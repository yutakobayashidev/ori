import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useActivities } from "../activities/activity-state";
import { localDay, type DaySelectionChange } from "./model";
import { changeDayPlan, loadDayPlan } from "./server-functions";

export function useDayPlan() {
  const { revision, refresh } = useActivities();
  const [day, setDay] = useState(() => localDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = localDay();
      setDay((current) =>
        current.date === next.date && current.timeZone === next.timeZone ? current : next,
      );
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["day-plan", day.date, day.timeZone, revision],
    queryFn: async () => {
      const result = await loadDayPlan({ data: day });
      if (!result.ok) throw new Error(result.error.message);
      return result;
    },
  });
  async function update(changes: DaySelectionChange[], reason: string) {
    if (busy || !query.data) return;
    const data = {
      ...day,
      changes,
      reason,
      expectedRevision: query.data.revision,
      requestId: crypto.randomUUID(),
    };
    setBusy(true);
    async function attempt() {
      setRetry(null);
      setError("");
      try {
        const result = await changeDayPlan({ data }).catch(() => changeDayPlan({ data }));
        if (!result.ok) setError(result.error.message);
        await Promise.all([refresh(), query.refetch()]);
        setBusy(false);
      } catch {
        setError("The save result is unknown. Retry this same change to confirm it.");
        setRetry(() => attempt);
      }
    }
    await attempt();
  }
  return {
    plan: query.data,
    loading: query.isPending,
    busy,
    error: error || (query.error ? "Could not load today's choices." : ""),
    retry,
    reload: () => void query.refetch(),
    update,
  };
}
