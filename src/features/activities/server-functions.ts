import { createServerFn } from "@tanstack/react-start";
import {
  createHomeActivityInput,
  updateActivityUserInput,
  type ActivityContext,
  type ActivityFailure,
  type ActivityReceipt,
} from "./model";

async function run<T>(
  operation: (repository: typeof import("./repository.server")) => T,
): Promise<T | ActivityFailure> {
  const repository = await import("./repository.server");
  try {
    return operation(repository);
  } catch (error) {
    if (error instanceof repository.ActivityPersistenceError)
      return { ok: false, error: { code: error.code, message: error.message } };
    return {
      ok: false,
      error: {
        code: "internal-error",
        message: "Unable to save or load activities. Please try again.",
      },
    };
  }
}
export const loadActivities = createServerFn({ method: "GET" }).handler(
  (): Promise<ActivityContext | ActivityFailure> =>
    run((repository) => repository.getAllActivities()),
);
export const changeActivity = createServerFn({ method: "POST" })
  .validator(updateActivityUserInput)
  .handler(({ data }): Promise<ActivityReceipt | ActivityFailure> =>
    run((repository) => repository.updateActivityUser(data)),
  );
export const createHomeActivity = createServerFn({ method: "POST" })
  .validator(createHomeActivityInput)
  .handler(({ data }): Promise<ActivityReceipt | ActivityFailure> =>
    run((repository) => repository.createUserActivity(data)),
  );
export const markActivityRead = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }): Promise<boolean | ActivityFailure> =>
    run((repository) => repository.markActivityRead(data)),
  );
