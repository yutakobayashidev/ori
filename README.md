# Personal Workspace

A personal workspace for understanding the day, choosing the next action,
keeping context, and exploring information. Home brings together a short brief,
flexible tasks and routines, messages, notes, and reading. A shared sidebar opens
each dedicated workspace; its bottom avatar manages connected accounts.

The interface is in English. User-entered text and external posts retain their
original language.

Home uses a Tiimo-inspired day flow with expandable activities and direct
controls for routine steps, tasks, replies and weight entries. Messages uses
a Beeper-inspired conversation layout with visible source messages, editable
drafts and a contextual side panel. Tasks and reply activities share persistent
SQLite records across Home, Messages, and MCP. User edits and decisions survive
agent updates and reloads. Routines and Journal remain session-only prototypes;
Beeper history synchronization and actual message sending remain unconnected.

## Workspaces and current status

| Workspace | Route      | Current implementation                                                                                                 |
| --------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Home      | `/`        | Persistent mixed task/reply inbox and action proposals; routine and measurement controls remain local prototypes.      |
| Messages  | `/support` | Published reply activities, source excerpts, persistent draft edits and deferral. No external sending.                 |
| Journal   | `/journal` | Notes, resume points, medication and weight entries, append-only corrections, and summary previews. Local prototype.   |
| Reader    | `/inbox`   | Searchable sample articles and a responsive article reader. Recommendation from activity history is not connected yet. |
| Vitals    | `/vitals`  | Body and Environment dashboards with sample readings, charts, and simulated controls. No health or device connection.  |
| Research  | `/deck`    | Twitter and Mastodon columns, connected accounts, persistent decks, and optional Codex research chat.                  |

Home and Messages share activity IDs, user decisions, and drafts through a common
server service. Journal and routine prototype state resets on reload. The home
input uses a deterministic English/Japanese interpreter to preview an action
before confirmation, rather than an LLM. Research decks, connections, and chat
history also use server-side persistence.

See [execution support](docs/execution-support.md) and the
[vitals preview](docs/vitals-preview.md) for prototype scope.

## URL state

Reader search and article selection, Messages views and conversations, Home
previews, account management, Journal review/correction views, and Vitals
navigation are represented in search parameters. Research uses deck, run, and
citation IDs. Reloading or browser Back/Forward restores the view while its
underlying data remains available. Login preserves the requested workspace URL.

Explicit selections add browser history; search input replaces it after a
300 ms debounce using TanStack Pacer. Navigation cancels pending search updates,
and IME composition waits until confirmed. URL navigation never submits prompts,
sends messages, or repeats device actions. Drafts, secrets, results, and task
contents remain outside the URL. Unsaved mock records and manual temporary
decks still disappear on reload; a URL does not persist their contents.

## Direction: personal context and execution

The intended connection with the separate private `life` / Rensheng repository
is a loop: read relevant personal context, suggest useful next actions, record
what happened, and compile meaningful outcomes back into durable context.
This integration is planned; the app does not currently read or update life.

Rensheng would retain personal context, preferences, and the background of
ongoing matters. This workspace would own its execution state and interaction
history, with original conversations and appointments remaining in their source
systems. Context should carry source references and verification dates.

Interests are queries over activity history, not settings the user must maintain.
Routines provide optional guidance rather than a daily completion quota. Home
should help the user choose a manageable next step, with room to defer, dismiss,
or change direction.

## Research capabilities

- Multiple named decks with up to six columns each
- Twitter search, user timelines, and lists with independent relay accounts
- Mastodon OAuth, multiple accounts, search, user, list, and hashtag columns
- Native X search syntax, Top/Latest ranking, and optional `filter:follows`
- List discovery for the account selected in the column editor
- Column editing, ordering, deletion/undo, refresh, and cursor pagination
- SQLite-backed shared decks, revision conflicts, and URL-based selection
- Temporary views for exploration, with explicit saving
- Server-only encrypted Mastodon credentials and configurable Tailscale owner access
- Read-only post cards with source links, text, media, and quotes
- Experimental WebMCP tools to manage decks and read their columns
- Same-port HTTP MCP for SNS retrieval and saved-deck operations through a private tunnel
- Optional resident Codex research chat, cited host-side Markdown reports,
  and saved conversations with deck, account, and citation restoration

Original-post links open their source site; SNS reply threads are not rendered
inside the app. Bluesky, Threads, and Nostr connectors are not implemented.

## Login and onboarding

The workspace requires a single owner account with email and password. First
use opens account setup, followed by a short onboarding. Run
`nix develop -c pnpm account:setup` on the server to obtain the private setup
code. See [owner login](docs/login.md) for configuration, sessions, and limits.

`GET /health` returns `{"status":"ok"}` without authentication or database access.

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
encryption key file; see [storage, OAuth and restore](docs/storage-and-oauth.md).

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
nix develop -c pnpm knip
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm test:live
nix develop -c pnpm build
nix develop -c pnpm start
nix develop -c pnpm account:setup
nix develop -c pnpm db:generate
```

## Home Codex research prototype

Run `codex login` as the host user. The backend uses Vercel AI SDK 7 and
`ai-sdk-provider-codex-cli` 2.3 to manage a local Codex app-server over stdio.
A separate WebSocket service is no longer required. Use Codex CLI 0.156.0 or
newer; set an explicit executable path if it is not on PATH.
The child receives an environment allowlist; inherited MCP servers, hooks,
web search and multi-agent execution are disabled for these research turns.
The user's Codex settings are not changed.

Configure the web app in `.env.local`:

```dotenv
TWITTER_LITE_CODEX_MODEL=gpt-6-astra
TWITTER_LITE_REPORT_ROOT=/absolute/path/to/twitter-lite/.data/research
# Optional:
# TWITTER_LITE_CODEX_PATH=/absolute/path/to/codex
# CODEX_HOME=/absolute/path/to/codex-home
```

If your CLI sets `CODEX_HOME`, set the same path in the server environment
(`.env.local` for development). A systemd service does not inherit your shell's
environment. Without it, research uses `~/.codex`, which may have different or
expired credentials. Authentication failures appear separately in chat; the
underlying error and conversation ID are logged on the server.

This provider does not register AI SDK `tools` as Codex dynamic tools.
The validated, account-scoped research functions are exposed through the app's
own HTTP `/mcp` endpoint. Each turn has a separate registration that is removed
when it finishes or is cancelled. Set `TWITTER_LITE_MCP_URL` when the app is not
reachable at `http://127.0.0.1:${PORT:-3000}/mcp`. The app-server control connection
still uses stdio; its MCP calls use HTTP. Streaming uses `streamText`
and `smoothStream` with 15 ms pacing and Japanese-aware chunking:
`/[\u3040-\u309F\u30A0-\u30FF]|\S+\s+/`.
Streamdown renders the Markdown and animates new text only while the final
assistant message is live; completed history is immediate and reduced-motion
preferences are respected. `@shadcn/helpers/ai-sdk` supplies deterministic
streaming fixtures for renderer tests.

Use the chat on the left while browsing horizontally scrollable deck columns on
the right. Messages continue the same Codex thread and include the currently
open deck as context. The account selector controls which connections Codex can
use. It can inspect saved deck definitions and reuse them as temporary views,
as well as create new views. `list_lists(connectionId)` discovers existing
Twitter and Mastodon lists for a selected connected account; returned list IDs
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
Selection belongs to the current URL; another browser does not change it. **Chat history** appears as a horizontally scrollable tab strip above the chat and deck, with a **+** button for a new chat. Tabs reopen saved conversations with their account
selection, deck and citations; the next message resumes the same Codex thread.
SQLite stores conversation snapshots. Active selection is not stored globally.
Each turn is limited to 6 columns, 12 upstream requests shared between list
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
data is left untouched. See [the deck model and persistence contract](docs/research-decks.md).

## HTTP MCP

The app serves Streamable HTTP MCP at `/mcp` on its existing port. External
clients can list connections and SNS lists, read saved decks, create/replace/delete
saved decks, and fetch posts from a source or saved column. These operations
share the web UI's SQLite and SNS services; no resident Codex run is required.
`get_activity_context` reads the shared task/reply inbox and user decisions;
`publish_activities` creates or updates proposals with stable IDs, retry receipts,
and revision checks. Publication preserves user edits and never sends messages.
See the [Activity MCP contract](docs/activity-mcp-design.md) for inputs and examples.
An OpenAI Secure MCP Tunnel client can forward to this private endpoint.

MCP authentication is currently deferred: `/mcp` bypasses browser login and
Tailscale identity checks. Keep the app on the private network. Browser routes
retain their existing access checks. See [HTTP MCP and tunnel operation](docs/http-mcp.md).

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
browsers retain the manual deck UI. See [tool contracts and verification](docs/webmcp-prototype.md).

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
