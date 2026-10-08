import { createServerFn } from "@tanstack/react-start";
import { executionAppInput, executionAppToolInput } from "./app-model";
import {
  handoffInput,
  executionIdInput,
  followupInput,
  answerInput,
  type ExecutionFailure,
} from "./model";

async function run<T>(
  operation: (service: typeof import("./service.server")) => Promise<T>,
): Promise<T | ExecutionFailure> {
  try {
    return await operation(await import("./service.server"));
  } catch (error) {
    const { ExecutionError } = await import("./runtime-client.server");
    return {
      ok: false,
      error: {
        message:
          error instanceof ExecutionError
            ? error.message
            : "The AI runtime is unavailable. Your accepted work will remain saved; refresh before retrying.",
      },
    };
  }
}

export const listExecutions = createServerFn({ method: "GET" }).handler(() =>
  run(async (service) => ({ ok: true as const, runs: await service.listExecutionRuns() })),
);
export const getExecution = createServerFn({ method: "GET" })
  .validator(executionIdInput)
  .handler(({ data }) =>
    run(async (service) => ({ ok: true as const, run: await service.getExecutionRun(data.id) })),
  );
export const handoffActivity = createServerFn({ method: "POST" })
  .validator(handoffInput)
  .handler(({ data }) =>
    run(async (service) => ({
      ok: true as const,
      run: await service.startActivityExecution(data),
    })),
  );
export const followupExecution = createServerFn({ method: "POST" })
  .validator(followupInput)
  .handler(({ data }) =>
    run(async (service) => ({
      ok: true as const,
      run: await service.followupActivityExecution(data),
    })),
  );
export const stopExecution = createServerFn({ method: "POST" })
  .validator(executionIdInput)
  .handler(({ data }) =>
    run(async (service) => ({
      ok: true as const,
      run: await service.stopActivityExecution(data.id),
    })),
  );
export const answerExecution = createServerFn({ method: "POST" })
  .validator(answerInput)
  .handler(({ data }) =>
    run(async (service) => ({
      ok: true as const,
      run: await service.answerActivityExecution(data),
    })),
  );

export const loadExecutionApp = createServerFn({ method: "GET" })
  .validator(executionAppInput)
  .handler(({ data }) =>
    run(async () => {
      const app = await import("./app.server");
      return { ok: true as const, ...(await app.loadExecutionApp(data)) };
    }),
  );
export const callExecutionAppTool = createServerFn({ method: "POST" })
  .validator(executionAppToolInput)
  .handler(({ data }) =>
    run(async () => {
      const app = await import("./app.server");
      return { ok: true as const, result: await app.callExecutionAppTool(data) };
    }),
  );
