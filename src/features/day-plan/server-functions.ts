import { createServerFn } from "@tanstack/react-start";
import type { ActivityFailure } from "../activities/model";
import { getDayPlanInput, updateDayPlanInput } from "./model";

async function run<T>(
  operation: (repository: typeof import("./repository.server")) => T,
): Promise<T | ActivityFailure> {
  const repository = await import("./repository.server");
  const { ActivityPersistenceError } = await import("../activities/repository.server");
  try {
    return operation(repository);
  } catch (error) {
    if (error instanceof ActivityPersistenceError)
      return { ok: false, error: { code: error.code, message: error.message } };
    return {
      ok: false,
      error: { code: "internal-error", message: "Unable to save or load today's choices." },
    };
  }
}
export const loadDayPlan = createServerFn({ method: "GET" })
  .validator(getDayPlanInput)
  .handler(({ data }) => run((repository) => repository.getDayPlan(data)));
export const changeDayPlan = createServerFn({ method: "POST" })
  .validator(updateDayPlanInput)
  .handler(({ data }) => run((repository) => repository.updateDayPlan(data, "user")));
