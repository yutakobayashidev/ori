import { z } from "zod";
import { executionIdInput } from "./model";

export const executionAppInput = executionIdInput.extend({
  toolCallId: z.string().min(1).max(256),
});
export const executionAppToolInput = executionAppInput.extend({
  name: z.enum(["get_activity_context", "update_activity"]),
  arguments: z.record(z.string(), z.json()),
});
