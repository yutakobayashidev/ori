import { useEffect, useState } from "react";
import type { Activity } from "./model";

export function isCompletedToday(activity: Activity, now: Date) {
  return (
    activity.userState === "completed" &&
    activity.completedAt !== null &&
    new Date(activity.completedAt).toDateString() === now.toDateString()
  );
}

/** Use the viewer's local day, including when a tab stays open overnight. */
export function useLocalDay() {
  const [day, setDay] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setDay((previous) => (previous.toDateString() === now.toDateString() ? previous : now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return day;
}
