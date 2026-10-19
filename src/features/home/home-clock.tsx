import { useEffect, useState } from "react";

export function HomeClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <time
      dateTime={now?.toISOString()}
      aria-label="Current local time"
      className="text-xl font-medium tabular-nums tracking-tight"
    >
      {now
        ? now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })
        : "--:--:--"}
    </time>
  );
}
