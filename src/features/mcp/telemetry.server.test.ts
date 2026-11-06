// @vitest-environment node
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import {
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { handleMcpRequest, registerResearchTools } from "./http.server";
import { traceEventDelivery } from "../mcp-events/telemetry.server";

vi.mock("./oauth.server", () => ({ authorizeMcpRequest: async () => null }));
const spans = new InMemorySpanExporter();
const processor = new SimpleSpanProcessor({ exporter: spans });
const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter: metricExporter });
const sdk = new NodeSDK({
  autoDetectResources: false,
  textMapPropagator: new W3CTraceContextPropagator(),
  spanProcessors: [processor],
  metricReaders: [reader],
  logRecordProcessors: [],
});
beforeAll(() => sdk.start());
afterEach(() => spans.reset());
afterAll(() => sdk.shutdown());

async function callTool(run: () => Promise<unknown>) {
  const registration = registerResearchTools({
    definitions: [{ name: "test_tool", description: "Test", inputSchema: { type: "object" } }],
    execute: run,
  });
  try {
    return await handleMcpRequest(
      new Request(`http://workspace.invalid/mcp?research=${registration.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${registration.token}`,
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "test_tool",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "test_tool",
            arguments: { text: "private argument" },
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
              traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
            },
          },
        }),
      }),
    );
  } finally {
    registration.dispose();
  }
}

it("exports upstream MCP spans, duration metrics and remote parent context without payloads", async () => {
  const response = await callTool(async () => ({ ok: true, text: "private result" }));
  expect(await response.json()).toMatchObject({ result: { isError: false } });
  await processor.forceFlush();
  await reader.forceFlush();
  const span = spans.getFinishedSpans().find((item) => item.name === "tools/call test_tool");
  expect(span?.kind).toBe(SpanKind.SERVER);
  expect(span?.spanContext().traceId).toBe("11111111111111111111111111111111");
  expect(span?.parentSpanContext?.spanId).toBe("2222222222222222");
  expect(span?.attributes).toMatchObject({
    "mcp.method.name": "tools/call",
    "gen_ai.tool.name": "test_tool",
  });
  expect(span?.status.code).not.toBe(SpanStatusCode.ERROR);
  expect(JSON.stringify(span?.attributes)).not.toContain("private");
  const duration = metricExporter
    .getMetrics()
    .flatMap((item) => item.scopeMetrics)
    .flatMap((item) => item.metrics)
    .find((item) => item.descriptor.name === "mcp.server.operation.duration");
  expect(duration?.descriptor.unit).toBe("s");
  expect(duration?.dataPoints).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attributes: expect.objectContaining({ "gen_ai.tool.name": "test_tool" }),
      }),
    ]),
  );
});

it("marks a tool failure as an error even when HTTP succeeds", async () => {
  const response = await callTool(async () => ({ ok: false, text: "private failure payload" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ result: { isError: true } });
  await processor.forceFlush();
  expect(spans.getFinishedSpans()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attributes: expect.objectContaining({ "error.type": "tool_error" }),
        status: { code: SpanStatusCode.ERROR },
      }),
    ]),
  );
});

it("marks unexpected handler exceptions as MCP errors", async () => {
  const response = await callTool(async () => {
    throw new Error("Test handler failure");
  });
  expect(await response.json()).toMatchObject({ error: { code: -32603 } });
  await processor.forceFlush();
  expect(spans.getFinishedSpans()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attributes: expect.objectContaining({ "error.type": "-32603" }),
        status: expect.objectContaining({ code: SpanStatusCode.ERROR }),
      }),
    ]),
  );
});

it("traces event retry metadata while preserving responses, validation and thrown errors", async () => {
  const input = { name: "activity.created", eventId: "event", subscriptionId: "sub", attempt: 1 };
  const failure = new Error("private callback credential");
  await expect(
    traceEventDelivery(input, async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await expect(
    traceEventDelivery({ ...input, attempt: 2 }, async () => ({
      status: 503,
      body: "private body",
    })),
  ).resolves.toEqual({ status: 503, body: "private body" });
  await expect(
    traceEventDelivery(
      { ...input, attempt: 3 },
      async () => ({ status: 200, body: "wrong challenge" }),
      () => {
        throw failure;
      },
    ),
  ).rejects.toBe(failure);
  await expect(
    traceEventDelivery({ ...input, attempt: 4 }, async () => ({ status: 204, body: "" })),
  ).resolves.toEqual({ status: 204, body: "" });
  await processor.forceFlush();
  const attempts = spans.getFinishedSpans();
  expect(attempts.map((span) => span.attributes["mcp.delivery.attempt"])).toEqual([1, 2, 3, 4]);
  expect(attempts.map((span) => span.attributes["error.type"])).toEqual([
    "transport_error",
    "503",
    "validation_error",
    undefined,
  ]);
  expect(attempts.map((span) => span.status.code)).toEqual([
    SpanStatusCode.ERROR,
    SpanStatusCode.ERROR,
    SpanStatusCode.ERROR,
    SpanStatusCode.UNSET,
  ]);
  expect(
    JSON.stringify(
      attempts.map((span) => ({
        attributes: span.attributes,
        events: span.events,
        status: span.status,
      })),
    ),
  ).not.toContain("private");
});
