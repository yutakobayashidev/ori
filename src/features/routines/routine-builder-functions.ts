import { createServerFn } from "@tanstack/react-start";
import { routineBuilderInputSchema } from "./routine-builder";

export const continueRoutineBuilder = createServerFn({ method: "POST" })
  .validator(routineBuilderInputSchema)
  .handler(async ({ data }) => {
    const { buildRoutineReply } = await import("./routine-builder.server");
    return buildRoutineReply(data);
  });
