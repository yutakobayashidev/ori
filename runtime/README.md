# Workspace execution runtime

Run `mix deps.get` then `WORKSPACE_RUNTIME_TOKEN=<24+ bytes> mix run --no-halt`.
Loopback port defaults to 4318. All routes require Bearer authentication.
WORKSPACE_RUNTIME_PORT, WORKSPACE_RUNTIME_ROOT, WORKSPACE_RUNTIME_CONCURRENCY
(default 2), WORKSPACE_CODEX_PATH configure deployment.

POST /runs accepts {id,prompt,activityId?,cwd?,threadId?,config?:{model,developerInstructions,mcpServers}}.
GET /runs and /runs/:id return snapshots. GET /runs/:id/events streams SSE snapshot
events and starts with current state on reconnect. POST /runs/:id/messages accepts
{requestId,text,config?}; POST /runs/:id/stop cancels; POST /runs/:id/answers accepts
{requestId,answers}. Adjacent assistant message chunks should be concatenated.

A single GenServer serializes DETS writes and syncs before acknowledgement. Active
runs become interrupted on restart; explicit followup resumes the saved Codex
thread. Supply fresh scoped MCP config after a Research interruption. Pending
questions persist for inspection; answer via followup if the runtime restarted.
No automatic replay of side effects.

PathSafety is copied with formatting changes only from OpenAI Symphony commit
be10a1b79df723d6d7612b5651c8522704dafb2e under Apache-2.0 (vendor/symphony LICENSE
and NOTICE). One-for-all scheduler/worker supervision follows Symphony's
agent_runtime_supervisor.ex; Codex protocol follows codex/app_server.ex.

Production supports WORKSPACE_RUNTIME_TOKEN_FILE (preferred over token environment).
`package.nix` produces a self-contained OTP release; use `bin/workspace_runtime start`.
Set RELEASE_DISTRIBUTION=none and a RELEASE_COOKIE for local-only operation.
GET /runs/:id/artifacts?path=relative downloads an artifact up to 8MiB, rejecting
paths outside the canonical workspace, symlink escapes, and hidden files.
Snapshot artifacts have {path,size}; messages have stable {id,role,text}.
Questions use pendingInput {requestId,questions}; answer values are keyed by
question ID as {answers: string[]}. Requests must match the live pending request.

### Workspace MCP tools

Board and Research runs connect Codex to the signed HTTP workspace MCP endpoint.
Board runs use the same get_activity_context and update_activity_progress tools as
external agents. The server restricts progress writes to the delegated activity.
No dynamic tool callbacks are registered. Follow-ups resume the saved Codex thread
with fresh MCP configuration.

Codex item/started and item/completed MCP notifications persist full tool results
(including UI metadata) in toolCalls, with afterMessageId for conversation ordering.
Descriptor mcpAppUi presentation is retained for the embedded workspace app. MCP
execution and model-facing output are handled by Codex itself. Cancellation or
restart marks unfinished records failed; completed results survive restart.
