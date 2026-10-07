/** Invalidate browser snapshots after a commit, including on reconnect. */
export function activityEvents(
  request: Request,
  subscribe: (listener: () => void) => () => void,
  isAuthorized: () => boolean,
) {
  if (!isAuthorized()) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  let dispose = () => {};
  let flush = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let dirty = true;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (closed) return;
        dispose();
        controller.close();
      };
      dispose = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", close);
      };
      flush = () => {
        if (closed) return;
        if (!isAuthorized()) return close();
        if (dirty && (controller.desiredSize ?? 0) > 0) {
          dirty = false;
          controller.enqueue(encoder.encode("event: change\ndata: {}\n\n"));
        }
      };
      if (request.signal.aborted) return close();
      unsubscribe = subscribe(() => {
        dirty = true;
        flush();
      });
      request.signal.addEventListener("abort", close, { once: true });
      heartbeat = setInterval(() => {
        flush();
        if (!closed && !dirty && (controller.desiredSize ?? 0) > 0)
          controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15_000);
      heartbeat.unref?.();
      flush();
    },
    pull() {
      flush();
    },
    cancel() {
      dispose();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
