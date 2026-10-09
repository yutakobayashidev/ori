import type { FocusSession } from "./model";
export function sessionActiveSeconds(session: FocusSession, now: number): number {
  return (
    session.elapsedActiveSeconds +
    (session.state === "running" && session.runningSince !== null
      ? Math.max(0, Math.floor((now - session.runningSince) / 1000))
      : 0)
  );
}
export function projectedRemainingSeconds(
  minutes: number | null,
  activeSeconds: number,
  baseline = 0,
): number | null {
  return minutes === null
    ? null
    : Math.max(0, minutes * 60 - Math.max(0, activeSeconds - baseline));
}
export function defaultFocusBudget(remainingSeconds: number | null): number {
  return remainingSeconds === null || remainingSeconds <= 0
    ? 900
    : Math.min(1500, Math.ceil(remainingSeconds / 60) * 60);
}
