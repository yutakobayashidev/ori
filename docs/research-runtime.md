# Research runtime

Research uses Vercel AI SDK 7 `streamText` with
`ai-sdk-provider-codex-cli` 2.3's app-server provider. The provider owns its local
stdio child, thread resumption, protocol decoding, and abort handling. The app
owns accepted requests, account-scoped tools, snapshots, and report validation.
The separate WebSocket launcher is removed.

## Tools

The provider does not register AI SDK `tools` as Codex dynamic tools. Existing
research definitions and executors are exposed with `createSdkMcpServer` instead.
Validation, connected-account scope, request budgets, evidence tracking, and
read-only SNS behavior remain in `agent-tools.server.ts`. Provider execution is
one agent turn; there is no second AI SDK tool loop replaying those calls.
Resumed threads that already registered dynamic tools route their calls through
`onDynamicToolCall` to the same validated executor.

## Lifecycle and selection

The background runner is keyed by conversation ID. Acceptance saves the user
message before starting the model. A request ID identifies a new conversation
and deduplicates retries within the process. Overlapping turns of the same
conversation are rejected, while different conversations can run independently.

The URL selects a conversation. GET status and SSE subscribe to that ID;
selecting history never starts or cancels a turn. Reconnection sends the latest
complete snapshot. Closing a browser or changing its URL only detaches a viewer.
Only Stop, the execution timeout, or a server-side failure aborts generation.
Authentication expiry or logout closes the viewer's stream.

SQLite retains messages, thread IDs, generated decks, and citations. It no
longer stores a global active conversation pointer. Browser views cannot change
another browser's selection. After a backend restart, unfinished conversations
are marked interrupted and require an explicit follow-up. No turn is replayed
automatically. Reports remain files under the configured report root.

## Streaming presentation

The model stream uses `smoothStream` with 15 ms pacing and the supplied chunking
pattern `/[\u3040-\u309F\u30A0-\u30FF]|\S+\s+/`. The trailing buffer flushes at the
text-end event. The existing snapshot SSE remains the UI's reconnectable data
channel; an HTTP request's lifetime never owns the model execution.

Streamdown displays partial Markdown and animates only the latest live answer.
Completed messages render immediately. Reduced-motion preferences disable the
animation. HTML is skipped, unsafe link protocols are rejected, images remain
links, and retrieved post citations keep their deck navigation behavior.
`@shadcn/helpers/ai-sdk` provides deterministic streaming fixtures for UI tests.

References: [Codex provider](https://github.com/ben-vargas/ai-sdk-provider-codex-cli),
[AI SDK smoothing](https://ai-sdk.dev/docs/reference/ai-sdk-core/smooth-stream),
[Streamdown animation](https://streamdown.ai/docs/animation),
[shadcn AI SDK helpers](https://ui.shadcn.com/docs/helpers/ai-sdk).
