# Twitter Lite

Twitter Lite is an intentional, read-only X reader. It shows content only after
you enter a user handle, profile URL, search query, or list URL, follow a
deliberate post detail link, or manually open a valid
`/:handle/status/:tweetId` URL.

## Scope

- User timelines and raw X search syntax
- Button-driven search filters for author, period, language, content type, replies, and reposts
- Popular (`Top`) and chronological (`Latest`) search
- Optional `filter:follows` search
- Authenticated account list selection and list timelines from a deliberate URL or ID
- Relay profile switching from the profiles exposed by the relay
- Infinite cursor pagination with explicit retry
- Deliberate post detail pages with the visible conversation
- Infinite conversation loading with explicit continuation retry
- Read-only cards for text, media, quotes, articles, and quiet engagement counts

It intentionally has no home feed, recommendations, trends, notifications,
history, account directory, or write actions.

Post detail pages show only the selected post and its visible conversation;
they do not add related-post recommendations or an account-discovery surface.

## Routes

- `/` shows the empty user input.
- `/:handle` shows a user timeline.
- `/search` shows search results. Its typed query parameters preserve the query,
  author, period, language, content type, exclusions, ranking, and follows filter
  so filtered searches can be reloaded or shared.
- `/i/lists` shows the authenticated account's lists.
- `/i/lists/:listId` shows a list timeline.
- `/:handle/status/:tweetId` shows one selected post and its visible conversation.

## Requirements and setup

Use Nix, or Node.js `>=22.12.0` with pnpm `11.9.0`. The committed `.npmrc`
routes the `@yuta` scope to the public Gitea Packages registry, where Bird
`0.10.0` provides the required Top and Latest search interface.

```bash
nix develop -c pnpm install --frozen-lockfile
cp .env.example .env.local
```

The Nix development shell installs Hallmark's agent skill for the supported
local agent targets.

Set `TWITTER_RELAY_BASE_URL` in `.env.local` for Vite development.
`BIRD_PROFILE_NAME` optionally selects the initial relay profile; the header
selector can switch between the profiles returned by the relay's `/profiles`
endpoint. Export the same values in the process environment before `start` or
`test:live`:

```bash
export TWITTER_RELAY_BASE_URL=http://127.0.0.1:6900
export BIRD_PROFILE_NAME=
```

Both values are read by server-only code at runtime; neither value nor Bird is
sent to the browser.

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

`test:e2e` is intentionally Nix-only and uses the system Chromium supplied by
the dev shell. Browser tests are organized under `e2e/`: page object models
and fixtures are shared by integration flows and Axe checks for WCAG 2.0/2.1
A and AA. The tests keep a standalone HTTP relay so TanStack Start server
functions and SSR requests exercise the same network boundary as production.
The API client and fixture types are generated with Orval from a pinned
[twitter-openapi specification](https://github.com/fa0311/twitter-openapi/commit/590dae5c9f8575abc91d3774946bfe6f23960aba);
run `generate:e2e-openapi` only when updating that pin or the selected
operations. Generated files are committed, so normal E2E runs do not require
network access. E2E fixtures use the generated response types but stay
deterministic. Runtime requests continue through Bird because its transport
differs from the upstream OpenAPI client. Relay-only endpoints, request
transport differences, cursors, and stateful failure scenarios remain in the
handwritten mock server.
`test:live` is an explicit, opt-in smoke test that performs exactly one
read-only Top search using the configured relay.

Development binds to `127.0.0.1` by default. `dev:tailscale` binds to
`0.0.0.0`, so it exposes the app on LAN interfaces as well as Tailscale. Use it
only on a trusted network and obtain the Tailscale address with
`tailscale ip -4`.

## NixOS service

The flake provides both a production package and a NixOS module. Import the
module and configure the relay:

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
            # profileName = "default";
          };
        }
      ];
    };
  };
}
```

The service listens on `127.0.0.1:3000` by default. Set
`services.twitter-lite.host` or `services.twitter-lite.port` to change the
listener. The package can also be built directly with `nix build`.

## Reliability

Bird uses X's internal GraphQL operations through the configured relay. Query
IDs and response shapes can change without notice.

Conversation pages use Bird's current per-page chronological ordering. Keeping
X's original ranked branch order is deferred until Bird exposes that order
without expanding the relay surface.
