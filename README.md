# Twitter Lite

Twitter Lite is an intentional, read-only X reader. It stays empty until you
enter a user handle, profile URL, or search query.

## Scope

- User timelines and raw X search syntax
- Popular (`Top`) and chronological (`Latest`) search
- Optional `filter:follows` search
- Infinite cursor pagination with explicit retry
- Deliberate post detail pages with the visible conversation
- Infinite conversation loading with explicit continuation retry
- Read-only cards for text, media, quotes, articles, and quiet engagement counts

It intentionally has no home feed, recommendations, trends, notifications,
history, account directory, or write actions.

Post detail pages show only the selected post and its visible conversation;
they do not add related-post recommendations or an account-discovery surface.

## Requirements and setup

Use Nix, or Node.js `>=22.12.0` with pnpm `11.9.0`. The package link also
requires a local Bird checkout at `../bird`, exactly at unpublished commit
`81921226f099e7f7a2107be15fc9783218a6f400`.

A fresh clone of the remote Bird repository alone does **not** contain that
local Top/Latest commit yet. Obtain the supplied checkout; do not assume the
commit or a compatible package has been published.

```bash
cd ../bird
git rev-parse HEAD
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm run build:dist

cd ../twitter-lite
nix develop -c pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `TWITTER_RELAY_BASE_URL` in `.env.local` for Vite development, and set
`BIRD_PROFILE_NAME` when the relay has multiple profiles. Export the same
values in the process environment before `start` or `test:live`:

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
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm test:live
nix develop -c pnpm build
nix develop -c pnpm start
```

`test:e2e` is intentionally Nix-only and uses the system Chromium supplied by
the dev shell. `test:live` is an explicit, opt-in smoke test that performs
exactly one read-only Top search using the configured relay.

Development binds to `127.0.0.1` by default. `dev:tailscale` binds to
`0.0.0.0`, so it exposes the app on LAN interfaces as well as Tailscale. Use it
only on a trusted network and obtain the Tailscale address with
`tailscale ip -4`.

## Reliability

Bird uses X's internal GraphQL operations through the configured relay. Query
IDs and response shapes can change without notice.

Conversation pages use Bird's current per-page chronological ordering. Keeping
X's original ranked branch order is deferred until Bird exposes that order
without expanding the relay surface.
