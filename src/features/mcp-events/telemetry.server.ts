import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

/** Trace delivery metadata only; callback URLs, credentials and bodies stay private. */
export function traceEventDelivery<T extends { status: number; body: string }>(
  input: { name: string; eventId: string; subscriptionId: string; attempt: number },
  run: () => Promise<T>,
  validateResponse?: (response: T) => void,
): Promise<T> {
  return trace.getTracer("ori.mcp-events").startActiveSpan(
    `mcp.event ${input.name}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "mcp.event.name": input.name,
        "mcp.event.id": input.eventId,
        "mcp.subscription.id": input.subscriptionId,
        "mcp.delivery.attempt": input.attempt,
      },
    },
    async (span) => {
      let failure = "transport_error";
      try {
        const response = await run();
        span.setAttribute("http.response.status_code", response.status);
        failure = "validation_error";
        validateResponse?.(response);
        if (response.status < 200 || response.status >= 300) {
          span.setAttribute("error.type", String(response.status));
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        return response;
      } catch (error) {
        // Remote errors can contain callback credentials or response content.
        span.setAttribute("error.type", failure);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
