# 技術リファレンス

[READMEのセットアップ導線](../README.md)へ戻る。

従来のREADMEにあった機能・実装状況・開発・運用の詳細をこのページにまとめています。初回導入はREADMEの番号順に進めてください。以下のコマンドは、特記がない限りリポジトリのルートから実行します。

## Personal workspace

A personal workspace with two main functions: supporting message replies and
daily execution through external AI agents, and tracing life across the person,
their environment, and the AI they interact with. External AI helps turn incoming
requests into editable replies and concrete next actions, keep progress current,
and support starting and resuming work. Life traces retain what happened, what
the person intended, what they did, and what followed. See the proposed
[architecture and vision](architecture.md) for scope and implementation stages.

The current app supports understanding the day, choosing the next action,
keeping context, and exploring information. Home brings together a short brief,
flexible tasks and routines, messages, notes, and reading. A shared sidebar opens
each dedicated workspace; its bottom avatar manages connected accounts.

The interface is in English. User-entered text and external posts retain their
original language.

Home uses a Tiimo-inspired day flow with expandable activities and direct
controls for routine steps, tasks, replies and weight entries. Messages uses
a Beeper conversation layout with real history, participant avatars, editable
drafts, quoted text replies and a contextual side panel. Tasks and reply activities share persistent
SQLite records across Home, Messages, and MCP. User edits and decisions survive
agent updates and reloads. Home keeps today's completed activities in place as compact
rows; older completions remain accessible through searchable completion history.
The board's Done column shows today by default, with an option to show past
completions. Both use the device's local date. Routines and Journal remain session-only prototypes.
Reply sending snapshots the saved draft into a durable operation; upstream send
success does not automatically complete the task.
Tasks and replies share permanent `#number` references, including existing records.
History (`/history`) shows activity changes and MCP write/event communication;
each activity also exposes its own history. Full activity text and drafts are
retained without automatic expiry. Communication payloads redact credentials and
explicitly truncate large bodies; read-only MCP calls are not logged.
See [activity numbers and audit history](activity-audit-and-numbers.md).
The headless Beeper listener can observe messages sent in the original chat apps;
Dots can update task progress and reply proposals through shared MCP tools.

Dots supplies rough task-duration estimates and recommends `Start here` or `If there's
room` for each activity. Home shows those recommendations as soon as they arrive; users
can set work aside without selecting every new item. AI-added activities have a subtle
AI marker. Focus opens as a sheet with a visual timer, a separate remaining-work estimate and a
conditional finish time. Sessions survive reloads, support pause/resume and extra time,
and record effort without automatically completing tasks when the timer reaches zero.
Manual estimate overrides and work-log corrections are optional. Calendar integration
is deferred. See [time and focus design](activity-time-and-calendar-design.md).

Home's greeting follows the device's local time: morning from 05:00, afternoon
from 12:00, and evening from 18:00 until 05:00. It refreshes while the page is
open and when returning to the app.

## Workspaces and current status

| Workspace | Route                | Current implementation                                                                                                 |
| --------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Home      | `/`                  | Persistent mixed task/reply inbox and action proposals; routine and measurement controls remain local prototypes.      |
| Messages  | `/support`           | Reply activities, Beeper history and avatars, persistent drafts, quoted text sending and operation status.             |
| Journal   | `/journal`           | Notes, resume points, medication and weight entries, append-only corrections, and summary previews. Local prototype.   |
| Reader    | `/inbox`             | Searchable sample articles and a responsive article reader. Recommendation from activity history is not connected yet. |
| Vitals    | `/vitals`            | Body and Environment dashboards with sample readings, charts, and simulated controls. No health or device connection.  |
| Research  | `/browse`, `/deck`   | Intentional search and user/list reading, Twitter/Mastodon/Reddit decks, and optional Codex research chat.             |
| Board     | `/board`             | Shared tasks and replies in Kanban columns, with AI handoff, execution chat, questions, and artifacts.                 |
| Focus     | `/focus/$activityId` | One task, visual timer, reply/source access, estimates and recorded effort.                                            |

Home and Messages share activity IDs, user decisions, and drafts through a common
server service. Journal and routine prototype state resets on reload. The home
input uses a deterministic English/Japanese interpreter to preview an action
before confirmation, rather than an LLM. Research decks, connections, and chat
history also use server-side persistence.

See [execution support](execution-support.md) and the
[vitals preview](vitals-preview.md) for prototype scope.

## URL state

Reader search and article selection, Messages views and conversations, Home
previews, account management, Journal review/correction views, and Vitals
navigation are represented in search parameters. Research uses submitted Browse
source/account conditions, deck, run, citation IDs, and closed-tab IDs. Browse
updates its URL on submission; typing alone does not load posts. Reloading or browser Back/Forward restores the view while its
underlying data remains available. Login preserves the requested workspace URL.

Explicit selections and Browse submissions add browser history; other workspace search input replaces it after a
300 ms debounce using TanStack Pacer. Navigation cancels pending search updates,
and IME composition waits until confirmed. URL navigation never submits prompts,
sends messages, or repeats device actions. Drafts, secrets, results, and task
contents remain outside the URL. Unsaved mock records and manual temporary
decks still disappear on reload; a URL does not persist their contents.

## Direction: life traces, context and execution

External-AI reply assistance and executive-function support are core product
functions alongside life tracing. Messages, Home, Board, and Focus provide the
places to review drafts, choose a next action, delegate, start, resume, and follow
up. External agents use shared MCP tools and events to update proposals and
progress while preserving user edits and decisions. This support should remain
useful before comprehensive life-data collection is available.

The planned foundation connects physical and digital observations, conversations
with people and AI, source archives, intentions, execution, and outcomes through
time and evidence. Search, recollection, context handoff, and reflection are
valuable uses in their own right; not every record needs to become a task or an
improvement proposal. Explicit links and inferred relationships remain distinct.
OpenTelemetry is a metaphor for this vision, not a required technology.

The intended connection with the separate private `life` / Rensheng repository
is a loop: read relevant personal context, suggest useful next actions, record
what happened, and compile meaningful outcomes back into durable context.
This integration is planned; the app does not currently read or update life.

Rensheng would retain personal context, preferences, and the background of
ongoing matters. This workspace would own its execution state and interaction
history, and would archive available source records with provenance and collection
coverage. Original conversations and appointments can remain in their source
systems while retained copies support later inspection and reprocessing.
Context should carry source references and verification dates.

Interests are queries over activity history, not settings the user must maintain.
Routines provide optional guidance rather than a daily completion quota. Home
should help the user choose a manageable next step, with room to defer, dismiss,
or change direction.

## OwnTracks collector

OwnTracks can POST to `/api/collect/owntracks` using dedicated device Basic
credentials over HTTPS. The optional collector appends raw request bodies and
receipt metadata to UTC daily JSONL files, synchronizes them before acknowledging,
and preserves incomplete tails separately on recovery. It performs no location
normalization or analysis. Configure a private archive directory and credential
file to enable it; no browser session is required for this exact endpoint.
See [OwnTracks collector setup and limits](owntracks-collector-design.md).

## Research capabilities

- Multiple named decks with no column-count limit
- Browse with a large search entry and timeline on the left, filters and lists on the right
- Browse/Decks switching, explicit Add to deck, and Open in Browse column actions
- Twitter search, user timelines, and lists with independent relay accounts
- Mastodon OAuth, multiple accounts, search, user, list, and hashtag columns
- Public Reddit search through the configured read-only rdt-gateway
- Native X search syntax, Top/Latest ranking, and optional `filter:follows`
- List discovery for the account selected in the column editor
- Column editing, ordering, deletion/undo, manual refresh, and infinite scrolling
- SQLite-backed shared decks, revision conflicts, and URL-based selection
- Temporary views for exploration, with explicit saving
- Server-only encrypted Mastodon credentials and configurable Tailscale owner access
- Read-only post cards with source links, text, media, and quotes
- Experimental WebMCP tools to manage decks and read their columns
- Same-port HTTP MCP for SNS retrieval and saved-deck operations through a private tunnel
- Optional resident Codex research chat, cited host-side Markdown reports,
  and saved conversations with deck, account, and citation restoration

Reddit Research uses the read-only HTTP gateway configured by `RDT_GATEWAY_URL`.
It appears as a public source rather than an account connection and supports
search, ranking, and time-range filters. The same source is available to the
Research chat and saved or temporary decks.

Original-post links open their source site; SNS reply threads are not rendered
inside the app. Bluesky, Threads, and Nostr connectors are not implemented.

## Login and onboarding

The workspace requires a single owner account with email and password. First
use opens account setup, followed by a short onboarding. Run
`nix develop -c pnpm account:setup` on the server to obtain the private setup
code. See [owner login](login.md) for configuration, sessions, and limits.

`GET /health` returns `{"status":"ok"}` without authentication or database access.

## Install as an app

The production build supports installation as **Personal Workspace** through
the browser's install menu (or Safari's **Add to Home Screen**). Open the app
over HTTPS, such as its Tailscale Serve origin; localhost also works for testing.
The installed app opens Home in a standalone window and uses the same owner
login as the browser. Access to the private network is still required.

A service worker displays a small offline page when a page cannot be reached.
Reconnect and select **Try again** to reopen the same URL. Only this generic
page is cached: personal data, authenticated pages, API responses, and mutations
are never stored by the service worker. Offline reading/editing and background
sync are not supported. Updates activate after existing app windows/tabs close,
so an update does not reload an active draft. When changing `public/offline.html`,
bump the cache version in `public/sw.js`.

Service worker registration is disabled in development. Verify the production
behavior with:

```bash
nix develop -c pnpm build
nix develop -c env TWITTER_LITE_E2E_PRODUCTION=1 pnpm test:e2e e2e/integrations/pwa.spec.ts
```

## Requirements and setup

Use Nix, or Node.js `>=22.12.0` with pnpm `11.9.0`. The committed `.npmrc`
routes the `@yuta` scope to the public Gitea Packages registry.

```bash
nix develop -c pnpm install --frozen-lockfile
cp .env.example .env.local
```

The Nix development shell installs Hallmark's agent skill for the supported
local agent targets. Set the runtime configuration in `.env.local` for Vite
development, or export it before running the production server. In addition to
the relay URL, configure the Serve origin, owner login, and an absolute SQLite
path from `.env.example`. Mastodon needs an allowed instance and a runtime
encryption key file; see [storage, OAuth and restore](storage-and-oauth.md).

```bash
export TWITTER_RELAY_BASE_URL=http://127.0.0.1:6900
```

The app discovers available account profiles through the relay's `/profiles`
endpoint. Select a profile for each column. There is no global account selector,
profile cookie, or application-level `BIRD_PROFILE_NAME` default. Requests
validate that the bound profile still exists before fetching posts or lists.
Bird and relay credentials stay on the server; saved deck definitions include
stable connection IDs. The connection metadata resolves Twitter IDs to relay
profiles; Mastodon credentials never go to the browser.

## Commands

```bash
nix develop -c pnpm dev
nix develop -c pnpm dev:tailscale
nix develop -c pnpm generate:e2e-openapi
nix develop -c pnpm lint
nix develop -c pnpm format
nix develop -c pnpm format:check
nix develop -c pnpm typecheck
nix develop -c pnpm check:code
nix develop -c pnpm check:cycles
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm test:docker # Build the Docker image first; see docs/docker.md.
nix develop -c pnpm test:live
nix develop -c pnpm build
nix develop -c pnpm start
nix develop -c pnpm account:setup
nix develop -c pnpm db:generate
```

`check:code` runs [Fallow](https://fallow.tools/docs/cli/dead-code/) for unused
code, dependencies, and circular imports; `check:cycles` runs only the circular
import check. Both exit nonzero when findings remain. `.fallowrc.jsonc` adds the
service worker, worker process, MCP iframe, and E2E entry points, keeps generated
E2E code in the dependency graph without reporting its dead-code findings, and allows
the shared UI components' exports. No architecture boundary rules are configured.
The config documents scoped exceptions for dynamic service calls, Playwright
fixtures, intentional export names, and framework-managed dependencies. Keep
exceptions tied to verified consumers rather than disabling checks globally.

## AI execution and Research

Board, Home, and Messages share the same Activity IDs and user decisions. In Board,
open a task in the right-hand Sheet, describe the requested outcome, and choose
**Hand off to AI**. The execution conversation supports followups, questions,
stopping, and downloading artifacts. Codex uses the same Activity MCP tools as Dots
to read tasks, update their progress, and propose reply drafts. Their results
embed the existing MCP App so drafts can be edited and saved inside the conversation.
Tool results survive reload; reopened cards read the latest shared Activity state.
AI completion enters review; it does not automatically complete the task.
Saving a draft does not send it. Explicit owner-authorized sending uses the shared
Beeper tools and a durable send operation. Replies handled in other apps can be marked complete.

The Elixir/OTP service in `runtime/` owns Codex subprocesses for both Board and
Research. It persists accepted work and thread IDs, limits concurrency, and marks
unfinished work interrupted on restart. Explicit followups resume the saved thread.
The TypeScript web backend owns Activities, sessions, scoped MCP tools, and SSE
presentation. Browser disconnection does not stop a job.

Task runs use a signed, run-scoped HTTP MCP connection. Activity progress writes
are restricted to the delegated Activity; Dots uses the shared workspace endpoint.
The browser's MCP App host uses AppBridge with the bundled UI in an opaque-origin
sandbox. Its session-authenticated actions are restricted to the selected Activity,
including its conversation, avatars and reply sends,
including after execution ends. Agent mutations emit Activity events with `origin: agent`;
edits made in the card emit `origin: user`. Both use the same revision checks and
retry receipts. Followups resume their existing Codex thread with the current MCP configuration.

Run `codex login` as the runtime host user. Use Codex CLI 0.156.0 or
newer; set `WORKSPACE_CODEX_PATH` if it is not on PATH.
The child receives an environment allowlist; inherited MCP servers, hooks,
web search and multi-agent execution are disabled for these research turns.
The user's Codex settings are not changed.

Configure the web app in `.env.local`:

```dotenv
TWITTER_LITE_CODEX_MODEL=gpt-6-astra
TWITTER_LITE_REPORT_ROOT=/absolute/path/to/twitter-lite/.data/research
WORKSPACE_RUNTIME_URL=http://127.0.0.1:4318
WORKSPACE_RUNTIME_TOKEN_FILE=/absolute/path/outside/git/runtime-token
# Optional:
```

Create a random token file with permissions `0600` outside Git, then start the
runtime with the same `WORKSPACE_RUNTIME_TOKEN_FILE` and a private
`WORKSPACE_RUNTIME_ROOT`. From `runtime/`, run `mix deps.get` followed by
`mix run --no-halt`; the private HTTP listener defaults to `127.0.0.1:4318`.
Set `CODEX_HOME` in the runtime service to the same directory used by the signed-in
CLI. The runtime and web app must share the report directory. A Nix release is
available as `nix build .#workspace-runtime`; UM790-Pro services are managed in dotnix.
See [the handoff design](ai-handoff-design.md) and [runtime operations](../runtime/README.md).

The validated, selected-source-scoped research functions are exposed through the app's
own HTTP `/mcp` endpoint. Each turn has a separate registration that is removed
when it finishes or is cancelled. Set `TWITTER_LITE_MCP_URL` when the app is not
reachable at `http://127.0.0.1:${PORT:-3000}/mcp`. The app-server control connection
is owned by Elixir and uses stdio; its MCP calls use HTTP. Runtime snapshots stream
to the web backend over SSE, which forwards Research text and deck progress.
Streamdown renders the Markdown and animates new text only while the final
assistant message is live; completed history is immediate and reduced-motion
preferences are respected. `@shadcn/helpers/ai-sdk` supplies deterministic
streaming fixtures for renderer tests.

Research chat and its history are hidden by default. Open **Research chat** to
use the chat on the left while browsing horizontally scrollable deck columns on
the right. Messages continue the same Codex thread and include the currently
open deck as context. The source selector controls which connections and public
gateways Codex can use. It can inspect saved deck definitions and reuse them as temporary views,
as well as create new views. `list_lists(connectionId)` discovers existing
Twitter and Mastodon lists for a selected connected account; Reddit uses the
configured public gateway and has no account lists. Returned list IDs
can be reused in list columns. It uses the same catalog as the manual editor
(Twitter requests up to 100 lists; list discovery is not paginated).
The default prompt asks Codex to inspect existing decks and the selected
accounts' lists before planning new searches, then read relevant list columns
for evidence. Follow-ups can reuse catalogs already fetched in the conversation.
Manual deck creation and column editing remain
available. The backend handles tools even when the browser is closed.
Use **New chat** to leave the current conversation and start a fresh Codex
thread with your next message. The open deck and host reports remain available.
A running turn continues in the background when you open another chat.
Selection belongs to the current URL; another browser does not change it. **Chat history** appears as a horizontally scrollable tab strip above the chat and deck, to the right of the workspace navigation. Use **+** for a new chat or **×** to close a tab. Closing a tab keeps its conversation and running research; the history menu reopens it. Tab clicks have no animation. Tabs reopen saved conversations with their account
selection, deck and citations; the next message resumes the same Codex thread.
SQLite stores conversation snapshots. Active selection is not stored globally.
Each turn is limited to 12 upstream requests shared between list
discovery and post retrieval (at most 20 posts per fetch), and 15 minutes.
The prototype accepts up to 100 messages per backend process.
SSE pushes messages, tool activity and deck updates for the requested conversation
ID, without polling. Separate conversations have independent executions.
Codex replies render as Markdown, including tables, lists and code. Clicking a
cited post link scrolls to its card and briefly highlights it. Loaded cards take
priority; otherwise the app shows the post captured during research in a column
with matching source and account settings, creating a temporary citation deck
when needed. These captured posts are labeled and do not change feed pagination
or reveal sensitive content automatically. Other links still open externally;
Ctrl/Cmd-click on a citation also opens the original site.
Citation metadata stays with the saved conversation across reconnects,
follow-up messages and server restarts. Markdown HTML is not executed and
Markdown images are rendered as links.
Reopening the page receives the latest state and restores the temporary deck.
Later updates modify the same temporary view; they do not overwrite saved decks
or switch away from another deck you are reading. Use the existing save button
to persist a deck. The agent and visible columns currently fetch posts separately.

Codex writes `<report root>/<run ID>/report.md` using its workspace file tools.
The UI displays its host path after validating the file. A conversation or deck
edit can finish without producing a report. Citation quality is model output,
not independently verified. Report contents remain on the host filesystem;
the app DB stores the conversation, thread ID, deck context and citation metadata.

Browser disconnection does not cancel research; reconnecting restores the latest
state through `/api/research/events?run=<id>`, under the same owner access checks as the
rest of the app. After a backend restart, unfinished turns appear as interrupted;
sending another message explicitly resumes the same thread through the provider.
It does not automatically rerun interrupted requests. Files already written remain.
Cancellation is explicit. The backend and report directory must
run under a user able to write those files. NixOS DynamicUser service integration
and dedicated service credentials are outside this prototype.

`test:e2e` uses the system Chromium supplied by the Nix dev shell. Playwright
integration and Axe accessibility tests live under `e2e/`. A standalone mock
HTTP relay exercises the production server-function boundary without contacting
X or a personal relay. Orval generates API fixture types from a pinned
[twitter-openapi specification](https://github.com/fa0311/twitter-openapi/commit/590dae5c9f8575abc91d3774946bfe6f23960aba).
Generated files are committed; run `generate:e2e-openapi` only when changing
the pin or selected operations. Runtime requests use Bird.

Browser scenarios use the Page Object Model, following the
[web-app-template E2E structure](https://github.com/hiroppy/web-app-template/tree/main/e2e).
`e2e/models/` owns page-specific locators and user actions; `WorkspacePage`
owns shared navigation and sidebar behavior. `e2e/fixtures.ts` supplies these
objects per test, alongside the isolated database, session, and accessibility
fixtures. Specs in `e2e/integrations/` retain scenario assertions, network mocks,
API checks, and browser history/viewport controls. For a new screen, add its
model and fixture instead of duplicating selectors across specs. A model can
also be constructed with another browser page to test multiple sessions.

`test:live` is an explicit, opt-in smoke test that performs one read-only Top
search. For this standalone probe only, `BIRD_PROFILE_NAME` selects the account
and `TWITTER_LITE_LIVE_QUERY` overrides the search text.

## Deck workspace

The interface uses shadcn/ui's Base UI components and Tailwind CSS v4, with a
collapsible sidebar based on
[sidebar-09](https://github.com/shadcn-ui/ui/tree/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/bases/base/blocks/sidebar-09).
The workspace retains compact column headers and independently scrolling post
columns. On narrow screens, the sidebar opens as a sheet. Add/edit forms use
shadcn dialogs with Escape handling and focus restoration. Column menus contain
editing, ordering, and deletion; refresh stays available directly in each header.

Shared UI components live in `src/components/ui`; `components.json` configures
the registry and theme entrypoint. Research and Messages follow the
[shadcn chatbot template](https://github.com/shadcn-ui/chatbot-template), composing
MessageScroller, Message, Bubble and InputGroup without separate chat primitives.
Research uses Marker and Streamdown for tool progress and streamed Markdown,
with reconnectable snapshot SSE and saved conversations. Enter sends a research
message; Shift+Enter inserts a line break and IME composition does not submit. The icon rail switches between chat and deck management;
closing the mobile sheet or crossing the desktop breakpoint preserves chat
drafts, selected accounts and live deck updates. All application styling uses Tailwind utilities in the components.
`src/styles.css` contains the Tailwind imports, shared theme tokens, and base
utilities; there are no feature stylesheets. Named pixel spacing tokens preserve
the compact layouts alongside the existing rem scale. Tests use accessible
roles and explicit data attributes rather than styling classes.

`pnpm lint` runs Oxlint with type-aware linting and TypeScript checking through
`oxlint-tsgolint`, including the
[@shadcn/lint](https://github.com/shadcn-ui/lint) UI checks. The
`shadcn/no-raw-colors` rule in `.oxlintrc.json` requires theme colors in JSX and
class helpers, including shared UI components. Layout values remain available
for the sidebar and deck. Component contracts allow only the required shared-component treatments; Next.js-specific rules are omitted because this app uses TanStack Start.
`pnpm format` formats files with Oxfmt defaults, and
`pnpm format:check` checks formatting without changing files. Knip checks application usage while retaining the public exports
of registry components for composition. Additional design rules can be configured
in `.oxlintrc.json`;
see the [available rules](https://github.com/shadcn-ui/lint#rules).

The database and OpenAPI generators format their output with Oxfmt. TanStack
Router owns the formatting of `src/routeTree.gen.ts`, which is excluded from
formatting; `pnpm check:routes` verifies that regeneration leaves it unchanged.

Create a deck for an investigation, then add columns for each perspective.
Choose a connected account and one of its supported sources. Account
changes affect only the edited column. Matching source conditions and accounts
share the query cache; different profiles never share posts or cursors.

Saved decks live on the server and refresh across devices on focus and while
visible. Conflicting revisions are rejected. Only the active deck is rendered
and fetched; posts and cursors are not archived. The active selection stays
local to the device.

AI-created decks open as temporary views reconstructed from their saved chat
on another device or after reload. Save a view to add it to the independent deck
library, or make a temporary copy of a saved deck to experiment.
Other unsaved temporary edits disappear on reload or navigation, including OAuth redirects.
Existing version-2 browser decks have an explicit import action; invalid older
data is left untouched. See [the deck model and persistence contract](research-decks.md).

## HTTP MCP

The app serves Streamable HTTP MCP at `/mcp` on its existing port. External
clients can list connections and SNS lists, read saved decks, create/replace/delete
saved decks, and fetch posts from a source or saved column. These operations
share the web UI's SQLite and SNS services; no resident Codex run is required.
`get_activity_context` reads the shared task/reply inbox and user decisions;
it flags newly agent-created activities as unread until opened from Home or the board;
`publish_activities` creates or updates proposals with stable IDs, retry receipts,
and revision checks. Publication preserves user edits and never sends messages.
`get_activity_context` accepts conversation and state filters for event reconciliation.
`update_activity_progress` changes state and/or a proposed reply draft with a reason
and evidence references, without replacing the whole task. Incoming and outgoing
messages or external observations can support the decision; no in-app send or
delivery receipt is required. Owner edits are preserved. Updates use revision
checks and retry receipts and are recorded as agent actions. The result contains
current context and the saved mutation receipt; context exposes the latest assessment.
It also accepts `remainingMinutes` with the same reason/evidence requirements.
`publish_activities` accepts `timeEstimate: {estimatedMinutes, reason}` on each proposal.
`get_day_plan` and `update_day_plan` read and select a small set of activities for a date
and time zone independently of inbox publication. Focus timers and work-log edits are
owner-facing browser operations, not autonomous agent tools.
See the [Activity MCP contract](activity-mcp-design.md) for inputs and examples.
An OpenAI Secure MCP Tunnel client can forward to this private endpoint.

ChatGPT/MCP Apps can render research decks, post feeds, activities and reply drafts
inside the conversation. These views reuse the web app's React columns, cards,
activity controls, reply editor and stylesheet. UI actions call the same MCP
endpoint; `update_activity` exposes revision-checked user edits to the app.
Chapplin provides the client bridge. A separate Vite build embeds the single-file
UI in the existing server, preserving its MCP 2.0 tools and events. See
[MCP Apps UI](http-mcp.md#mcp-apps-ui) for supported tools and verification.

`read_activity_conversation`, `send_activity_reply` and `get_message_send` share the
web reply service with Dots and Codex. Read the saved draft hash/revision before
sending; monitoring and draft generation do not authorize external messages.
The app-only `get_beeper_asset` resolves opaque avatar IDs without exposing tokens
or upstream paths. The events worker processes send operations independently of
subscriptions and never automatically retries an unknown submission outcome.
See [Beeper messaging](beeper-messaging-design.md) for data and send semantics.

`list_beeper_chats` and `read_beeper_chat` provide read-only conversation context
from the configured headless Beeper Server. MCP 2.0 clients can subscribe to
`beeper.message.received` and `beeper.message.sent` for explicit chat IDs. The separate
`twitter-lite-events-worker` process reconciles observed messages and delivers
signed webhooks from a durable SQLite queue. ChatGPT Work/dots can use these
events to create task/reply proposals through the existing activity tools.
The sent event observes owner-authored messages synced from Discord or other
original apps; it does not send anything or prove recipient delivery. Existing
incoming subscriptions are unchanged: completion monitors subscribe separately
to sent events for the same selected chats and judge whether each specific task
was fulfilled before calling `update_activity_progress`.
Clients can also subscribe to `activity.created`, `activity.status_changed`, and `activity.time_changed`
for the shared task/reply inbox. Activity saves enqueue notifications in the same
SQLite transaction; retries and unchanged statuses do not create duplicates.
Activity subscriptions default to user actions, with explicit opt-in for agent
publications to avoid self-triggering monitors.
See [Workspace MCP Events](beeper-mcp-events.md) for setup and verification.

MCP authentication is currently deferred: `/mcp` bypasses browser login and
Tailscale identity checks. Keep the app on the private network. Browser routes
retain their existing access checks. See [HTTP MCP and tunnel operation](http-mcp.md).

## WebMCP

A WebMCP-enabled browser exposes `list_connections`, `list_decks`, `get_deck`,
`set_deck`, `save_deck`, `select_deck`, `delete_deck`, `get_column_posts`, and
`load_more_column` on `/deck`. Discover connection IDs first.
`set_deck` creates a temporary view when `deckId` is omitted. `save_deck`
persists it. Replacing or deleting a saved deck requires its `expectedRevision`.

Enable `chrome://flags/#enable-webmcp-testing`, restart Chrome, and open the
local app. Use the
[Model Context Tool Inspector](https://developer.chrome.com/docs/ai/webmcp#imitate_agent_chat_with_the_inspector_extension)
to invoke tools. Registration uses native `document.modelContext` through
`usewebmcp`; there is no polyfill or external MCP transport. Unsupported
browsers retain the manual deck UI. See [tool contracts and verification](webmcp-prototype.md).

Development and `dev:tailscale` both bind to `127.0.0.1`. Native WebMCP needs a secure context;
use a Tailscale Serve HTTPS origin for remote access, and allow its exact
hostname through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the Vite process
environment. HTTP and HTTPS origins have separate localStorage.

Set `TWITTER_LITE_ORIGIN` to the exact public HTTPS origin (no trailing slash).
The default `TWITTER_LITE_AUTH_MODE=tailscale` requires
`TWITTER_LITE_ALLOWED_LOGIN` to be your Tailscale login. The app requires
Serve's `Tailscale-User-Login` header and rejects other users. Keep the backend
on localhost: the trusted Serve proxy supplies identity. Tagged clients do not
provide user identity. Missing configuration fails closed; direct browser access
to localhost does not supply the required identity. Playwright supplies an
explicit fixture identity to its isolated test server.

For a private, tailnet-only reverse proxy such as Traefik, explicitly set
`TWITTER_LITE_AUTH_MODE=none` to disable the Tailscale identity check. This mode
does not require `TWITTER_LITE_ALLOWED_LOGIN` or Tailscale identity headers.
App login remains mandatory, including access to connected accounts and Codex.
Bind the backend to loopback or its Tailscale address and restrict proxy
access to the tailnet.
Both modes require the exact configured `Origin` for state-changing requests,
including chat and deck mutations. Missing origin or an unknown auth mode
fails closed. Mastodon OAuth uses the configured public origin for its callback.

## NixOS service

The flake provides a production package and a NixOS module:

```nix
{
  inputs.twitter-lite.url =
    "git+https://git.yutakobayashi.com/yuta/twitter-lite";

  outputs = { nixpkgs, twitter-lite, ... }: {
    nixosConfigurations.example = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        twitter-lite.nixosModules.default
        {
          services.twitter-lite = {
            enable = true;
            relayBaseUrl = "http://127.0.0.1:6900";
            publicOrigin = "https://home.example-tailnet.ts.net";
            allowedLogin = "your-tailscale-login";
            mastodonOrigins = [ "https://fedi.yutakobayashi.com" ];
            credentialKeyFile = "/var/lib/secrets/twitter-lite-key";
          };
        }
      ];
    };
  };
}
```

The service listens on `127.0.0.1:3000`. Set
`services.twitter-lite.port` to change the port; the host remains loopback.
The module reserves `/var/lib/twitter-lite` with mode 0700 for persistent state.
`credentialKeyFile` can reference a runtime secret file for SNS credentials;
systemd loads it as a credential, separate from the database and Nix store.
Profiles are selected in column definitions, not service options.
The package can also be built directly with `nix build`.

## Reliability

Bird uses X's internal GraphQL operations through the configured relay. Query
IDs and response shapes can change without notice.
The pinned Bird patch in `patches/@yuta__bird@0.10.1.patch` preserves bottom
cursors returned as `TimelineReplaceEntry.entry` on subsequent pages. Without
it, searches can incorrectly stop after the second page. Regression tests cover
multiple pages through the actual Bird search, user, and list clients.
