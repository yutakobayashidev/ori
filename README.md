# Twitter Lite

Twitter Lite is a read-only research deck for X. Create multiple named decks,
and arrange up to six columns per deck for searches, user timelines, and lists.
Each column is bound to an explicit relay profile, so different accounts can
be used side by side.

## Scope

- Multiple deck profiles with creation, selection, renaming, and deletion
- Search, user timeline, and list columns with independent relay profiles
- Native X search syntax, Top/Latest ranking, and optional `filter:follows`
- List discovery for the profile selected in the column editor
- Column editing, ordering, deletion/undo, manual refresh, and cursor pagination
- Browser-local persistence of deck definitions and the active deck
- Read-only cards with original-post links, text, media, and quotes
- Experimental WebMCP tools to manage decks and read or paginate their columns

Both `/` and `/deck` open the deck workspace. The separate reader, search,
list, user-profile, and conversation routes have been removed. Original-post
links open X; conversations are not rendered inside the app.

Built-in AI planning, summaries, and the Mastodon/Bluesky/Threads/Nostr
connectors are not implemented yet. Twitter is the only supported platform.

## Requirements and setup

Use Nix, or Node.js `>=22.12.0` with pnpm `11.9.0`. The committed `.npmrc`
routes the `@yuta` scope to the public Gitea Packages registry.

```bash
nix develop -c pnpm install --frozen-lockfile
cp .env.example .env.local
```

The Nix development shell installs Hallmark's agent skill for the supported
local agent targets. Set `TWITTER_RELAY_BASE_URL` in `.env.local` for Vite
development, or export it before running the production server:

```bash
export TWITTER_RELAY_BASE_URL=http://127.0.0.1:6900
```

The app discovers available account profiles through the relay's `/profiles`
endpoint. Select a profile for each column. There is no global account selector,
profile cookie, or application-level `BIRD_PROFILE_NAME` default. Requests
validate that the bound profile still exists before fetching posts or lists.
Bird and relay credentials stay on the server; saved deck definitions include
the selected profile names.

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
```

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
Choose a relay profile and a source: search, user timeline, or list. Profile
changes affect only the edited column. Matching source conditions and profiles
share the query cache; different profiles never share posts or cursors.

The workspace saves multiple decks and the active selection in localStorage.
Only the active deck is rendered and fetched. Posts and cursors are not saved;
reloading fetches first pages. Devices and tabs do not synchronize edits.

Old single-deck data is not migrated automatically because it has no explicit
column profile binding. Invalid or older saved data remains untouched while
the app shows an empty workspace and an explanation. Saving a new edit replaces
that saved data. See [the deck model and persistence contract](docs/research-decks.md).

## WebMCP

A WebMCP-enabled browser exposes `list_decks`, `get_deck`, `set_deck`,
`select_deck`, `delete_deck`, `get_column_posts`, and `load_more_column` on
both deck routes. Start with `list_decks` to discover deck IDs and available
relay profiles. `set_deck` creates a new deck when `deckId` is omitted; supply
an existing ID to replace that deck's complete ordered columns and activate it.

Enable `chrome://flags/#enable-webmcp-testing`, restart Chrome, and open the
local app. Use the
[Model Context Tool Inspector](https://developer.chrome.com/docs/ai/webmcp#imitate_agent_chat_with_the_inspector_extension)
to invoke tools. Registration uses native `document.modelContext` through
`usewebmcp`; there is no polyfill or external MCP transport. Unsupported
browsers retain the manual deck UI. See [tool contracts and verification](docs/webmcp-prototype.md).

Development binds to `127.0.0.1` by default. `dev:tailscale` binds to
`0.0.0.0`, including LAN interfaces. Native WebMCP needs a secure context;
use a Tailscale Serve HTTPS origin for remote access, and allow its exact
hostname through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the Vite process
environment. HTTP and HTTPS origins have separate localStorage.

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
          };
        }
      ];
    };
  };
}
```

The service listens on `127.0.0.1:3000` by default. Set
`services.twitter-lite.host` or `services.twitter-lite.port` to change the
listener. Profiles are selected in column definitions, not service options.
The package can also be built directly with `nix build`.

## Reliability

Bird uses X's internal GraphQL operations through the configured relay. Query
IDs and response shapes can change without notice.
