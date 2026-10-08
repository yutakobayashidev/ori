import { z } from "zod";
import { activityToolFailure, executeActivityTool } from "./activity-tools.server";
import { executionScopeIsValid, getExecutionRun } from "./service.server";

const callInput = z.strictObject({
  toolCallId: z.string().min(1).max(256),
  name: z.string().min(1).max(128),
  arguments: z.record(z.string(), z.unknown()),
});

export async function handleExecutionTool(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const id = url.searchParams.get("execution") || "";
  const proof = url.searchParams.get("proof") || "";
  try {
    if (!(await executionScopeIsValid(id, proof))) return new Response(null, { status: 403 });
    const text = await request.text();
    if (text.length > 64_000) return new Response(null, { status: 413 });
    const call = callInput.parse(JSON.parse(text));
    const run = await getExecutionRun(id);
    if (!run.activityId || !["running", "waiting_input"].includes(run.status))
      return new Response(null, { status: 403 });
    return Response.json(executeActivityTool({ id, activityId: run.activityId }, call), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(activityToolFailure("invalid-input", "Invalid task tool call."), {
        status: 400,
      });
    return Response.json(activityToolFailure("unavailable", "The task tool is unavailable."), {
      status: 503,
    });
  }
}
