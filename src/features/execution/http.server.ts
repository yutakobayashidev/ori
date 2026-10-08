import { executionIdInput, executionRun } from "./model";
import { runtimeRequest } from "./runtime-client.server";

export async function executionEvents(request: Request, isAuthorized: () => boolean) {
  if (!isAuthorized()) return new Response(null, { status: 401 });
  const parsed = executionIdInput.safeParse({ id: new URL(request.url).searchParams.get("id") });
  if (!parsed.success) return new Response(null, { status: 400 });
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  let response: Response;
  try {
    response = await runtimeRequest(`/runs/${parsed.data.id}/events`, { signal });
  } catch {
    return new Response("AI runtime unavailable", { status: 503 });
  }
  if (!response.ok || !response.body)
    return new Response(null, { status: response.ok ? 502 : response.status });
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const encoder = new TextEncoder();
  let buffer = "";
  const timer = setInterval(() => {
    if (!isAuthorized()) abort.abort();
  }, 15_000);
  timer.unref?.();
  const clean = () => {
    clearInterval(timer);
    abort.abort();
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!signal.aborted) {
          if (!isAuthorized()) {
            clean();
            controller.close();
            return;
          }
          const boundary = buffer.indexOf("\n\n");
          if (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) {
              const run = executionRun.parse(JSON.parse(data));
              controller.enqueue(
                encoder.encode(`event: snapshot\ndata: ${JSON.stringify(run)}\n\n`),
              );
            } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            clean();
            controller.close();
            return;
          }
          buffer += value.replaceAll("\r", "");
          if (buffer.length > 8_000_000) throw new Error("Execution snapshot is too large");
        }
        clean();
        controller.close();
      } catch {
        clean();
        controller.close();
      }
    },
    async cancel() {
      clean();
      await reader.cancel();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function executionArtifact(request: Request, isAuthorized: () => boolean) {
  if (!isAuthorized()) return new Response(null, { status: 401 });
  const url = new URL(request.url);
  const parsed = executionIdInput.safeParse({ id: url.searchParams.get("id") });
  const path = url.searchParams.get("path");
  if (!parsed.success || !path || path.length > 2048) return new Response(null, { status: 400 });
  try {
    const response = await runtimeRequest(
      `/runs/${parsed.data.id}/artifacts?${new URLSearchParams({ path })}`,
      { signal: request.signal },
    );
    if (!response.ok) return new Response(null, { status: response.status });
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.split("/").at(-1) || "artifact")}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("AI runtime unavailable", { status: 503 });
  }
}
