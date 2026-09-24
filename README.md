# Twitter Lite

Twitter Lite is a personal research deck for Twitter and Mastodon. Create
multiple named decks and arrange up to six columns per deck. Each column is
bound to a connection account, so platforms and multiple accounts work side by side.

## Scope

- Multiple deck profiles with creation, selection, renaming, and deletion
- Twitter search, user timeline, and list columns with independent relay accounts
- Mastodon OAuth, multiple accounts, search, user, list, and hashtag columns
- Native X search syntax, Top/Latest ranking, and optional `filter:follows`
- List discovery for the profile selected in the column editor
- Column editing, ordering, deletion/undo, manual refresh, and cursor pagination
- SQLite-backed shared decks, revision conflicts, and device-local active selection
- Temporary views for AI exploration, with explicit save and temporary copies
- Server-only encrypted Mastodon credentials and Tailscale owner access
- Read-only cards with original-post links, text, media, and quotes
- Experimental WebMCP tools to manage decks and read or paginate their columns
- Prototype: chat with a resident home Codex beside a live deck, reuse existing
  decks and write cited Markdown research reports on the host

Both `/` and `/deck` open the deck workspace. The separate reader, search,
list, user-profile, and conversation routes have been removed. Original-post
links open their source site; conversations are not rendered inside the app.

Bluesky/Threads/Nostr connectors are not implemented yet. An external browser
agent can also create and read decks through WebMCP.

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
nix develop -c pnpm knip
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm test:live
nix develop -c pnpm build
nix develop -c pnpm start
nix develop -c pnpm db:generate
nix develop -c pnpm codex:serve
```

## Home Codex research prototype

Run `codex login` as the host user, then keep `pnpm codex:serve` running separately
from the web server. It starts a resident app-server at `ws://127.0.0.1:4500`
using that user's existing Codex login. The launcher passes a small environment
allowlist, without the app's database, relay or SNS secret settings. Configured
MCP servers are disabled for this process without changing the user's settings.
The prototype was developed against Codex CLI 0.156.1; its WebSocket and dynamic
tool APIs are experimental.

Configure the web app with these values in `.env.local` (absolute report path):

```dotenv
TWITTER_LITE_CODEX_URL=ws://127.0.0.1:4500
TWITTER_LITE_CODEX_MODEL=gpt-6-astra
TWITTER_LITE_REPORT_ROOT=/absolute/path/to/twitter-lite/.data/research
```

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
Use **新しいチャット** to clear the current conversation and start a fresh Codex
thread with your next message. The open deck and host reports remain available.
If a turn is running, stop it first. The conversation reset is shared across
open devices; previous conversations are not listed in this prototype.
Each turn is limited to 6 columns, 12 upstream requests shared between list
discovery and post retrieval (at most 20 posts per fetch), and 15 minutes.
The prototype accepts up to 100 messages per backend process.
SSE pushes conversation messages, tool activity and generated deck updates to
open browsers, without polling.
Reopening the page receives the latest state and restores the temporary deck.
Later updates modify the same temporary view; they do not overwrite saved decks
or switch away from another deck you are reading. Use the existing save button
to persist a deck. The agent and visible columns currently fetch posts separately.

Codex writes `<report root>/<run ID>/report.md` using its workspace file tools.
The UI displays its host path after validating the file. A conversation or deck
edit can finish without producing a report. Citation quality is model output,
not independently verified. No research-history or snapshot tables are added;
report contents are not stored in the app DB. Only the latest conversation is shown.

Browser disconnection does not cancel research; reconnecting restores the latest
state through `/api/research/events`, under the same owner access checks as the
rest of the app. The app keeps run state in
memory; backend/process restart recovery is not implemented. A backend failure
can leave Codex work unfinished and dynamic tools unavailable; files already
written remain. Cancellation is explicit. The launcher and report directory must
run under a user able to write those files. NixOS DynamicUser service integration
and dedicated service credentials are outside this prototype.

`test:e2e` uses the system Chromium supplied by the Nix dev shell. Playwright
integration and Axe accessibility tests live under `e2e/`. A standalone mock
HTTP relay exercises the production server-function boundary without contacting
X or a personal relay. Orval generates API fixture types from a pinned
[twitter-openapi specification](https://github.com/fa0311/twitter-openapi/commit/590dae5c9f8575abc91d3774946bfe6f23960aba).
Generated files are committed; run `generate:e2e-openapi` only when changing
the pin or selected operations. Runtime requests use Bird.

`test:live` is an explicit, opt-in smoke test that performs one read-only Top
search. For this standalone probe only, `BIRD_PROFILE_NAME` selects the account
and `TWITTER_LITE_LIVE_QUERY` overrides the search text.

## Deck workspace

The interface uses a full-height, dark TweetDeck-style workbench: a deck sidebar,
compact column headers, and independently scrolling post columns. On narrow
screens, the sidebar becomes a compact top bar. Add/edit forms open in native
dialogs; Escape closes them and returns focus. Column menus contain editing,
ordering, and deletion; refresh stays available directly in each header.

Create a deck for an investigation, then add columns for each perspective.
Choose a connected account and one of its supported sources. Account
changes affect only the edited column. Matching source conditions and accounts
share the query cache; different profiles never share posts or cursors.

Saved decks live on the server and refresh across devices on focus and while
visible. Conflicting revisions are rejected. Only the active deck is rendered
and fetched; posts and cursors are not archived. The active selection stays
local to the device.

AI-created decks start as temporary views in the current tab. Save a view to
share it across devices, or make a temporary copy of a saved deck to experiment.
Temporary views disappear on reload or navigation, including OAuth redirects.
Existing version-2 browser decks have an explicit import action; invalid older
data is left untouched. See [the deck model and persistence contract](docs/research-decks.md).

## WebMCP

A WebMCP-enabled browser exposes `list_connections`, `list_decks`, `get_deck`,
`set_deck`, `save_deck`, `select_deck`, `delete_deck`, `get_column_posts`, and
`load_more_column` on both deck routes. Discover connection IDs first.
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

Set `TWITTER_LITE_ORIGIN` to the exact Serve HTTPS origin (no trailing slash)
and `TWITTER_LITE_ALLOWED_LOGIN` to your Tailscale login. The app requires
Serve's `Tailscale-User-Login` header and rejects other users. Keep the backend
on localhost: the trusted Serve proxy supplies identity. Tagged clients do not
provide user identity. Missing configuration fails closed; direct browser access
to localhost does not supply the required identity. Playwright supplies an
explicit fixture identity to its isolated test server.

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
