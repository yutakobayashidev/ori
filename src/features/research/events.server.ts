import { z } from "zod";
import type { ResearchRun } from "./model";

type Snapshot = { configured: boolean; run: ResearchRun | null };
type Subscribe = (id: string | undefined, listener: (snapshot: Snapshot) => void) => () => void;

/** Subscribe to current state and subsequent changes; disconnect only this viewer. */
export function researchEvents(
  request: Request,
  subscribe: Subscribe,
  isAuthorized: () => boolean = () => true,
) {
  const query = new URL(request.url).searchParams;
  const run = z
    .uuid()
    .optional()
    .safeParse(query.get("run") ?? undefined);
  if (!run.success || query.getAll("run").length > 1)
    return new Response("Invalid research run.", { status: 400 });
  const encoder = new TextEncoder();
  let dispose = () => {};
  let flushPending = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let pending: string | undefined;
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const checkSession = () => {
        if (closed) return false;
        if (isAuthorized()) return true;
        dispose();
        controller.close();
        return false;
      };
      const flush = () => {
        if (!checkSession()) return;
        if (!closed && pending !== undefined && (controller.desiredSize ?? 0) > 0) {
          controller.enqueue(encoder.encode(pending));
          pending = undefined;
        }
      };
      flushPending = flush;
      dispose = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        dispose();
        controller.close();
      };
      if (request.signal.aborted) {
        abort();
        return;
      }
      unsubscribe = subscribe(run.data, (snapshot) => {
        if (closed) return;
        // Keep only the latest full snapshot when a viewer cannot read fast enough.
        pending = `data: ${JSON.stringify(snapshot)}\n\n`;
        flush();
      });
      if (closed) {
        unsubscribe();
        return;
      }
      heartbeat = setInterval(() => {
        if (!checkSession()) return;
        if (!closed && pending === undefined && (controller.desiredSize ?? 0) > 0)
          controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15_000);
      heartbeat.unref?.();
      request.signal.addEventListener("abort", abort, { once: true });
    },
    pull() {
      flushPending();
    },
    cancel() {
      dispose();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
