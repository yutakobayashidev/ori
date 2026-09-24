# Home-agent research

## Product boundary

The user starts a research task from the deck workspace. A home agent chooses
sources, opens a temporary deck, reads posts and writes a cited Markdown report
on the host. Twitter Lite provides the connected-account and deck tools; the
agent owns research and report writing.

Do not add research-history, snapshot or report tables. Existing SQLite storage
continues to own saved deck definitions and account credentials. Saving a
temporary deck remains an explicit user action.

## Proposed first implementation

1. Add a topic and connected-account selection form to the deck workspace.
2. Start one home Codex task with a dedicated output directory.
3. Supply tools for connection discovery, temporary deck creation and bounded
   post retrieval using the existing validators and platform services.
4. Keep execution status and the latest generated deck in process memory. SSE
   sends the current snapshot on connection and pushes subsequent changes.
   Reopened pages restore the temporary view; later definitions update the same
   view. Closing that view does not delete the report or stop the agent.
5. Have the agent write `report.md` in its per-task directory with original post
   URLs, collection limits and failed sources. Show progress and the output
   location in the app. No report-history UI or scheduled execution yet.

Following the user's WebSocket question, the proposed transport is a persistent
`codex app-server --listen ws://127.0.0.1:4500` connected to the Node backend,
with dynamic tools handled by that backend. WebSocket transport is currently
experimental in the official documentation. Native browser WebMCP is not a remote
MCP endpoint: reuse application operations rather than assuming that host Codex
can directly invoke a user's browser tools. No externally exposed Codex socket
is necessary.

## Decisions

- Confirmed: use home Codex, rather than a separate OpenAI API integration.
- Confirmed: report artifacts are host Markdown files written by the agent.
- Prototyping: resident app-server over loopback WebSocket, using the existing
  Codex login and model `gpt-6-astra`. No NixOS service migration in this step.
- Configure a dedicated report root and Codex authentication store. Preserve
  refreshed authentication for the service; do not put credentials in prompts
  or copy application secrets into the child environment.
- Keep manual execution bounded and cancellable. Process restarts end in-memory
  tasks; completed Markdown files remain on disk. No durable queue or automatic
  restart is required.

## Conversation workspace

The next iteration places a persistent chat beside the horizontally scrollable
deck. The browser displays user messages, public Codex agent messages and tool
activity from app-server events. Each follow-up continues the existing thread
and supplies the deck currently open in that browser. Internal reasoning is not
part of this transcript.

The agent can list and inspect saved decks within the selected account scope,
then reuse their columns in a temporary view. Saved definitions remain unchanged
until the user saves a view. Existing manual creation, selection, column editing
and saving stay available alongside the chat.

`list_lists(connectionId)` also exposes the manual editor's Twitter and Mastodon
list catalogs. Discovery is read-only and checks the selected connected account
before contacting either provider. Returned list IDs can be used directly in
list-column sources. Discovery and post retrieval share the per-turn budget of
12 upstream calls, including failures. Twitter requests up to 100 entries through
the existing catalog service; discovery has no pagination yet.
For Twitter, the agent prefers the selected connected account named `account2`
for new columns and retrieval, resolving its ID through `list_connections`.
It uses another selected account when `account2` is unavailable, lacks access
(for example to a private list), or the user explicitly requests it. Existing
columns retain their account bindings.

The default agent instructions require this discovery at the start of research,
before planning new searches. Relevant existing lists become candidate sources;
their posts are retrieved through the regular column tool. Catalogs already read
in the conversation can be reused, and explicit user instructions take priority.

A conversational turn need not produce a research report: discussing a query or
editing a deck is a valid completed turn. Reports, when requested, remain host
Markdown files. SSE snapshots include the conversation and latest generated
deck so reopening a page restores both without restarting work or polling.

The chat header can reset an idle conversation. The next message starts a new
Codex thread while retaining the browser's current deck as context. Reset pushes
an empty conversation to every subscriber, preserves host reports and does not
delete deck definitions. Active turns must be stopped first; a stale reset must
not clear a newer conversation started on another device. This does not add a
conversation-history UI.

## Markdown and source navigation

Assistant messages use react-markdown with remark-gfm. Public tool messages and
user input remain plain text. Markdown links retain their original URLs; a
regular click on a known post navigates within the deck, while modified clicks
and unrelated URLs retain external navigation.

Successful agent post fetches capture the exact column definition and a public
post projection in the in-memory conversation. The projection excludes raw
provider responses, HTML, media and account credentials. References are retained
across turns, updated per source/account/post identity and cleared by new chat.
The agent is instructed to cite exact returned post URLs in Markdown.

Navigation prefers a loaded card, then a workspace column with the same source
and connection. Missing sources open a one-column temporary deck. An unloaded
reference is displayed as a labeled research-time post without altering the
query cache or pagination. Cards receive focus, scroll into view and briefly
highlight; reduced-motion settings are respected and sensitive content stays
collapsed.

## Verification

- Protocol tests for dynamic-tool requests, failures, cancellation and process
  exit, with no real model usage in ordinary tests.
- Tool tests for selected connection scope, source validation, pagination limits
  and temporary-only deck creation.
- Browser test: start task, show generated temporary deck, retain manual save,
  display progress and completion or failure.
- Opt-in real home Codex run: retrieve real posts and verify a readable report
  exists at the reported host location with original-source links.

## Deployment boundary

The currently used UM790-Pro runs the development server. The existing dotnix
Twitter Lite service is configured on B450M-Pro4 with obsolete options and a
different public route. Do not apply that configuration to this task implicitly.
Service migration and backup scheduling need a concrete host configuration;
they are separate from validating this first agent workflow.

## References

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Existing WebMCP contract](../webmcp-prototype.md)

## Web-to-resident-Codex examples inspected

Research on 2026-09-24; README and implementation inspection only, not runtime
validation or adoption of these projects.

- [Redex](https://github.com/ladnir/redex/tree/a8032c49d1c9cc79db9679ad06b94a72defe3ec7):
  its Python HTTP/SSE bridge connects to a standalone Codex app-server through
  WebSocket. `src/redex/app_server.py` initializes the connection and sends
  `thread/resume` then `turn/start`; `src/redex/bridge.py` has a long-lived
  `LiveEventHub` separate from browser SSE connections. Desktop shared-runtime
  integration in this project's README requires its Codex fork; standalone
  WebSocket usage does not. The bridge suppresses the Origin header on its
  server-side connection because Codex rejects browser-style Origin headers.
- [Pedregoneric/codex-webui](https://github.com/Pedregoneric/codex-webui/blob/5cbc718004c77657812f7151ae708e68cc6b398c/server.js):
  a small personal/Tailscale-oriented example. One `CodexBridge` owns a long-lived
  stdio child. Browser SSE close removes that subscriber, without killing Codex;
  gateway shutdown does kill the child. This demonstrates that browser lifetime
  independence is not itself a WebSocket feature. Its authentication is separate
  from the existing Tailscale identity boundary used by Twitter Lite.
- [OpenAI's Codex Web architecture](https://openai.com/index/unlocking-the-codex-harness/):
  the February 2026 engineering article describes HTTP/SSE from browser to
  backend, and a worker maintaining a long-lived app-server connection. The
  backend owns task state so browser disconnection does not stop work. This is an
  architectural reference, not evidence of today's exact hosted implementation.
- [nathan-chappell/codex_web_ui](https://github.com/nathan-chappell/codex_web_ui/tree/79be149c427040d7fbb94246d841f705ab53ce9e):
  the launcher starts a detached app-server on a private Unix socket. Its
  TypeScript bridge performs a WebSocket upgrade over that socket. Browser
  commands use HTTP RPC and events use SSE. Disconnecting an SSE subscriber does
  not stop the bridge or Codex. Relevant files: `bin/codex-web-ui.js`,
  `server/codexBridge.ts`, `server/appApi.ts`, `server/eventHub.ts`.
- [seo-rii/codex-webui](https://github.com/seo-rii/codex-webui/tree/2619d78c55c6095aa8b9a7a1412fd0c7abf5e564):
  the Rust gateway connects directly over Unix-socket WebSocket in current code,
  despite older docs mentioning a proxy. It separates browser disconnect from
  gateway-restart handoff and normal shutdown. Request-ID deduplication avoids
  executing replayed mutations twice. Its dynamic-tool response handling is a
  useful reference, but we did not find custom SNS-style tool registration to
  reuse. Relevant files: `backend/src/codex_app_server.rs`,
  `backend/src/ws_transport_support.rs`, `backend/src/runtime_request_support.rs`.

The implementation should distinguish three events: browser disconnection,
Twitter Lite backend restart, and Codex process restart. A WebSocket connection
alone does not guarantee recovery across any of them. Agent tool requests should
be handled by the backend so research can continue without the initiating tab.

## Prototype verification

- Implemented a loopback WebSocket client, background run controller, bounded
  account/deck/post tools, and a sidebar research dialog. No schema migrations.
- 261 unit/component tests passed (one existing opt-in live test skipped).
- Relevant Playwright coverage: 17 desktop cases, 6 mobile WebMCP cases, and
  11 mobile deck/research cases passed. The new sidebar action initially
  overlapped another mobile control; it now uses the existing compact pattern.
- Typecheck, lint, knip, and production build passed.
- A real Codex 0.156.1 / gpt-6-astra run started from the browser. The browser
  was closed, reopened, and observed the task continuing to completion.
  Local verification supplied the trusted Serve identity and origin headers;
  the tagged host cannot authenticate as the owner through Serve itself.
- Codex generated two temporary columns, retrieved 20 Twitter posts and zero
  Mastodon results, and wrote a Japanese report with original post links and
  explicit limits on interpreting the empty Mastodon search. The report is
  under the ignored `.data/research/<run ID>/report.md` directory.
- Reopening the run's generated deck produced two temporary columns. Saved
  user decks were not replaced, and the report was not inserted into SQLite.
- After replacing polling with SSE, six desktop/mobile E2E cases passed for
  initial snapshots, reconnect snapshots, owner checks and the unconfigured UI.
- A second real run pushed a one-column deck to the page. After closing and
  reopening the browser, the latest deck restored automatically and grew to two
  columns through SSE. Codex then completed `report.md`. Same-view updates,
  preserving saved decks, ordered asynchronous updates and late start responses
  are also covered by component/controller tests.
- The actual Codex launcher was restarted successfully with configured MCP
  servers disabled; WebSocket `config/read` confirmed all seven disabled. Nix
  wrapper config overrides must precede the `app-server` subcommand.

## Conversation workspace verification

- 270 unit/component tests and 40 desktop/mobile Playwright cases passed.
  Typecheck, lint, knip and production build passed.
- Browser coverage includes conversation/deck restoration from SSE snapshots,
  manual deck editing and saving, narrow viewports and existing WebMCP tools.
  Readiness checks wait for usable controls rather than network idleness because
  the event stream intentionally stays connected.
- A real three-message Codex conversation called `list_decks`, reused a manually
  created column from the current-deck context, and edited that column after the
  browser was closed and reopened. The app-server thread ID and generated deck
  ID stayed unchanged; the deck advanced from version 1 to 2.
- The live database had no saved decks, which Codex reported correctly. Saved
  deck discovery/reuse with populated records is covered by isolated tool tests.
  The live check did not add or change saved deck records or create a report.

## List discovery verification

- 279 unit/component tests passed (one opt-in live test skipped), with typecheck,
  lint and production build passing. Tool tests cover both platforms, selected
  account scope, empty lists, upstream failures, shared request limits and using
  discovered IDs to create and fetch list columns.
- A real browser-initiated Codex run discovered 54 lists for Twitter account1
  and zero for Mastodon, then opened a temporary list column. Reopening the page
  restored that deck and the conversation. Twitter account2 initially returned
  an upstream `Dependency: Unspecified` error; a direct retry through the same
  Bird catalog API returned three lists. A follow-up message in the same Codex
  conversation then retried `list_lists` successfully and also reported three.

## New-chat verification

- 284 unit/component tests and eight desktop/mobile research E2E cases passed,
  along with typecheck, lint and production build.
- A real Codex check on a separate development server reset a completed chat
  across two browser pages, cleared the draft and retained the current deck.
  The next message used a different thread ID, contained only the new user
  message and received the current deck context. The separate server avoided
  interrupting research already running in the public workspace.

## Markdown citation verification

- The full suite passed 306 unit/component tests, with one opt-in test skipped.
  Typecheck, lint, knip and production build passed. Follow-up card tests verify
  re-scrolling when a captured post is replaced by its loaded feed result.
- 42 desktop/mobile E2E cases passed, including Markdown tables and emphasis,
  navigating to an offscreen column, captured-post display, focus/highlight,
  accessibility and existing manual deck/WebMCP operations.
- A real Codex run on a separate development server fetched 20 Twitter posts,
  cited two in a Markdown response, and navigated from a citation to its card.
  Closing and reopening the page preserved working citation navigation.
- react-markdown 10.1.0 and remark-gfm 4.0.1 were added with the user's approval.
  The pnpm dependency hash was updated and the x86_64-linux Nix package built.
