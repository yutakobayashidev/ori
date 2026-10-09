import { useEffect, useState } from "react";

/** A local display clock. Persistence is only changed by explicit user actions. */
export function useFocusClock(serverNow?: number) {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (serverNow) {
      // oxlint-disable-next-line react/set-state-in-effect -- Align the display with each server snapshot.
      setOffset(serverNow - Date.now());
    }
  }, [serverNow]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now + offset;
}

export function formatCountdown(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function FocusClock({
  remainingSeconds,
  budgetSeconds,
  paused,
}: {
  remainingSeconds: number;
  budgetSeconds: number;
  paused: boolean;
}) {
  const circumference = 2 * Math.PI * 134;
  const progress = Math.min(1, Math.max(0, remainingSeconds / budgetSeconds));
  return (
    <div className="relative mx-auto my-7 size-[min(72vw,320px)]" aria-label="Focus timer">
      <svg viewBox="0 0 300 300" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="150"
          cy="150"
          r="134"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-muted"
        />
        <circle
          cx="150"
          cy="150"
          r="134"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="text-activity-lilac"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <span
          className="text-5xl leading-none font-medium tracking-tight tabular-nums sm:text-6xl"
          role="timer"
          aria-label="Time left in this session"
        >
          {formatCountdown(remainingSeconds)}
        </span>
        <span className="text-sm text-muted-foreground">
          {paused
            ? "Paused"
            : remainingSeconds <= 0
              ? "A moment to take a breath"
              : `${Math.ceil(budgetSeconds / 60)} minutes for now`}
        </span>
      </div>
    </div>
  );
}
