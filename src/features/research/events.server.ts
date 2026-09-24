import type { ResearchRun } from './model'

type Snapshot = { configured: boolean; run: ResearchRun | null }
type Subscribe = (listener: (snapshot: Snapshot) => void) => () => void

/** Subscribe to current state and subsequent changes; disconnect only this viewer. */
export function researchEvents(request: Request, subscribe: Subscribe) {
  const encoder = new TextEncoder()
  let dispose = () => {}
  let flushPending = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let pending: string | undefined
      let closed = false
      let unsubscribe = () => {}
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const flush = () => {
        if (
          !closed &&
          pending !== undefined &&
          (controller.desiredSize ?? 0) > 0
        ) {
          controller.enqueue(encoder.encode(pending))
          pending = undefined
        }
      }
      flushPending = flush
      dispose = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        request.signal.removeEventListener('abort', abort)
      }
      const abort = () => {
        dispose()
        controller.close()
      }
      if (request.signal.aborted) {
        abort()
        return
      }
      unsubscribe = subscribe((snapshot) => {
        if (closed) return
        // Keep only the latest full snapshot when a viewer cannot read fast enough.
        pending = `data: ${JSON.stringify(snapshot)}\n\n`
        flush()
      })
      heartbeat = setInterval(() => {
        if (
          !closed &&
          pending === undefined &&
          (controller.desiredSize ?? 0) > 0
        )
          controller.enqueue(encoder.encode(': keepalive\n\n'))
      }, 15_000)
      heartbeat.unref?.()
      request.signal.addEventListener('abort', abort, { once: true })
    },
    pull() {
      flushPending()
    },
    cancel() {
      dispose()
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
