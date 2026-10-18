import { createServerFn } from "@tanstack/react-start";
import { getActivityAuditInput } from "./audit-model";
import { getCommunicationLogsInput } from "./communication-model";
import {
  createHomeActivityInput,
  createHomeActivitiesInput,
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
    const { withActivityAuditContext } = await import("./audit.server");
    return withActivityAuditContext({ actor: "user", channel: "browser" }, () =>
      operation(repository),
    );
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
export const createHomeActivities = createServerFn({ method: "POST" })
  .validator(createHomeActivitiesInput)
  .handler(({ data }): Promise<ActivityReceipt | ActivityFailure> =>
    run((repository) => repository.createUserActivities(data)),
  );
export const markActivityRead = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data }): Promise<boolean | ActivityFailure> =>
    run((repository) => repository.recordActivityRead(data)),
  );

export const loadActivityAudit = createServerFn({ method: "GET" })
  .validator(getActivityAuditInput)
  .handler(async ({ data }) => {
    const { getActivityAudit } = await import("./audit.server");
    return run(() => getActivityAudit(data));
  });

export const loadCommunicationLogs = createServerFn({ method: "GET" })
  .validator(getCommunicationLogsInput)
  .handler(async ({ data }) => {
    const { getCommunicationLogs } = await import("./communication.server");
    return run(() => getCommunicationLogs(data));
  });
