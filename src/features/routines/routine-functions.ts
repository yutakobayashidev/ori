import { createServerFn } from "@tanstack/react-start";
import { routineRunInputSchema, saveRoutineInputSchema } from "./routine-model";

// Protected by the application's owner-session and CSRF middleware.
export const listRoutines = createServerFn({ method: "GET" }).handler(async () => {
  const repository = await import("./routine-repository.server");
  return repository.listRoutines();
});
export const saveRoutine = createServerFn({ method: "POST" })
  .validator(saveRoutineInputSchema)
  .handler(async ({ data }) => {
    const repository = await import("./routine-repository.server");
    return repository.saveRoutine(data);
  });
export const recordRoutineRun = createServerFn({ method: "POST" })
  .validator(routineRunInputSchema)
  .handler(async ({ data }) => {
    const repository = await import("./routine-repository.server");
    return repository.recordRoutineRun(data);
  });
export const loadRoutineRuns = createServerFn({ method: "GET" }).handler(async () => {
  const repository = await import("./routine-repository.server");
  return repository.loadRoutineRuns();
});
export const loadRoutineHistory = createServerFn({ method: "GET" }).handler(async () => {
  const repository = await import("./routine-repository.server");
  return repository.loadRoutineHistory();
});
