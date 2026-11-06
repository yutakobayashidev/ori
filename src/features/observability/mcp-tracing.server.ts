import {
  createContextKey,
  SpanKind,
  trace,
  type Context,
  type SpanContext,
  type TextMapPropagator,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { BatchSpanProcessor, type Span } from "@opentelemetry/sdk-trace";

const incomingParent = createContextKey("ori.mcp.incoming-parent");
const w3c = new W3CTraceContextPropagator();

// MCP server request extraction is the inbound trace boundary. Local child spans
// and W3C injection retain the new request trace for downstream work.
export const mcpRequestPropagator: TextMapPropagator = {
  inject: (ctx, carrier, setter) => w3c.inject(ctx, carrier, setter),
  fields: () => w3c.fields(),
  extract(ctx, carrier, getter) {
    const extracted = w3c.extract(ctx, carrier, getter);
    const parent = trace.getSpanContext(extracted);
    const root = trace.deleteSpan(extracted).deleteValue(incomingParent);
    return parent ? root.setValue(incomingParent, parent) : root;
  },
};

export class McpRequestSpanProcessor extends BatchSpanProcessor {
  override onStart(span: Span, parentContext: Context) {
    const parent = parentContext.getValue(incomingParent) as SpanContext | undefined;
    if (parent && span.kind === SpanKind.SERVER && !span.parentSpanContext)
      span.addLink({ context: parent });
    super.onStart(span, parentContext);
  }
}
