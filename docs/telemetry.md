# MCP telemetry

Ori sends MCP traces and duration metrics to an OpenTelemetry Collector over
OTLP HTTP/protobuf. The collector can forward traces to Tempo and metrics to a
Prometheus-compatible backend such as VictoriaMetrics, with Grafana for viewing.
No collector or dashboard is bundled with Ori.

Set these variables on the web process and events worker:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
OTEL_SERVICE_NAME=ori
```

Use `ori-events` for the worker's service name. Without an endpoint, telemetry is
disabled. The exporters append `/v1/traces` and `/v1/metrics` to the base endpoint.
`OTEL_EXPORTER_OTLP_HEADERS` supports collectors that require authentication.
Keep credentials in the service's secret environment, never in source control.
The SDK batches exports and flushes them during graceful shutdown. Collector
outages do not change MCP results or event retry decisions; telemetry is best effort.

The MCP SDK records reads and writes, including method, tool name, duration and
error status. `tools/call` results with `isError: true` count as failures even when
HTTP returns 200. The histogram `mcp.server.operation.duration` has units of seconds.
Incoming W3C trace context in MCP `params._meta` links calls to instrumented clients.
It does not expose the client's conversation or reasoning. Callback verification
and each event delivery attempt get an outgoing span with event/subscription IDs,
attempt number and HTTP status. Callback URLs, credentials and bodies are omitted.

Tool arguments and results are not captured by the SDK. Its traces can contain
resource URIs and handler exception/error messages, so keep the collector and
viewing UI private and avoid credentials in errors. Baggage propagation and broad
HTTP auto-instrumentation are not enabled.

In Grafana Explore, choose Tempo and filter with:

```traceql
{ resource.service.name =~ "ori|ori-events" }
```

Narrow to a tool with `span.gen_ai.tool.name`, failures with `status = error`,
or slow calls with `duration > 2s`. Metric names and labels are normalized by the
collector's Prometheus exporter (for example,
`mcp_server_operation_duration_count` and `gen_ai_tool_name`).

## Database history

New MCP requests and event deliveries no longer write `communication_logs`.
Existing communication history remains readable through History and
`get_communication_logs`, and stays in normal database backups. Activity mutations
still write their transactional before/after history to `activity_audit`, including
changes made through MCP. No existing history is deleted or backfilled.

## SDK version

The MCP SDK's built-in instrumentation comes from merged
[PR #3115](https://github.com/modelcontextprotocol/typescript-sdk/pull/3115).
Until a published npm release includes it, the server package and its core
dependency use the immutable `5a07386` build from `pkg.pr.new`, pinned by the pnpm
lockfile integrity and Nix dependency hash. Its manifest says `2.4.0`, but it is a
snapshot, not the npm `2.4.0` release.

Refreshing that snapshot's lock entries requires
`pnpm --config.block-exotic-subdeps=false install` because the upstream build
references a fixed core tarball URL. Normal frozen installs use the existing lock;
the repository does not disable pnpm's policy globally. Replace the snapshot with
a released version once the instrumentation is published and tested.
