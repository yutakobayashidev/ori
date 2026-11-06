import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

// Vite can reload server modules without restarting the process.
const state = globalThis as typeof globalThis & { oriTelemetry?: NodeSDK };

export function startTelemetry() {
  if (state.oriTelemetry || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const sdk = new NodeSDK({
    autoDetectResources: false,
    logRecordProcessors: [],
    resource: resourceFromAttributes({ "service.name": process.env.OTEL_SERVICE_NAME || "ori" }),
    textMapPropagator: new W3CTraceContextPropagator(),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
  });
  sdk.start();
  state.oriTelemetry = sdk;
}

export async function shutdownTelemetry() {
  const sdk = state.oriTelemetry;
  delete state.oriTelemetry;
  await sdk?.shutdown();
}
