# Research runtime

Research sends each turn to the shared Elixir execution service. The web app
owns accepted requests, account-scoped MCP tools, UI snapshots, and report
validation. Elixir owns the Codex subprocess, queue, interruption and persistent
execution records. There is no local TypeScript Codex subprocess fallback.

Set `WORKSPACE_RUNTIME_URL` (default `http://127.0.0.1:4318`) and
`WORKSPACE_RUNTIME_TOKEN` or `WORKSPACE_RUNTIME_TOKEN_FILE` to match the runtime service. Configure the Codex binary
in the service, not in the web application. Runtime and web process must share
the report directory and the runtime must reach the scoped MCP URL.

## Tools and lifecycle

Each turn registers only its account-scoped research tools at the shared HTTP
MCP endpoint. Validation, request budgets and evidence tracking remain in
`agent-tools.server.ts`. Registration is removed when the turn ends. Execution
uses a fresh runtime UUID for each turn, while the durable Codex thread ID is
passed on followup. The runtime disables inherited MCP servers and restricts
Codex execution. Legacy dynamic tools in resumed threads are bridged by the
runtime to this same scoped endpoint.

Runtime snapshot SSE is converted to incremental assistant text without
repeating previous snapshots. `review` means the model turn finished; failures,
interruptions and input requests are surfaced to Research. Stop or a stream
failure calls the runtime stop endpoint before disposing tools. Closing a
browser only detaches its viewer and does not stop a turn.

SQLite retains Research messages, thread IDs, generated decks and citations.
Unfinished Research conversations are marked interrupted after a web backend
restart, requiring explicit followup. Runtime execution records persist
independently; scoped tools do not survive a web restart. Reports stay under
the configured report root. Research does not automatically replay failed turns.

## Presentation

Streamdown displays partial Markdown and animates only the latest live answer.
Completed messages render immediately. Reduced-motion preferences disable
animation. HTML is skipped, unsafe link protocols are rejected, images remain
links, and post citations preserve deck navigation.
