import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_TASK_INPUT_LENGTH, type TaskIntentResult } from "./task-intent";

export type HomeTaskPreview =
  | TaskIntentResult
  | {
      status: "unavailable";
      tasks: [];
      notice: string;
    };

// The application's owner session and CSRF middleware protect this server function.
export const classifyHomeTasks = createServerFn({ method: "POST" })
  .validator(
    z.strictObject({
      text: z.string().max(MAX_TASK_INPUT_LENGTH),
      today: z.iso.date(),
    }),
  )
  .handler(async ({ data }): Promise<HomeTaskPreview> => {
    const { interpretTaskInput } = await import("./task-intent.server");
    try {
      const { listRoutines } = await import("../routines/routine-repository.server");
      const routines = (await listRoutines()).map(({ id, name, aliases, description }) => ({
        id,
        name,
        aliases,
        description,
      }));
      return await interpretTaskInput(data, { routines });
    } catch {
      return {
        status: "unavailable",
        tasks: [],
        notice: "Preview unavailable.",
      };
    }
  });
