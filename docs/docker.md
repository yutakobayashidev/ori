# Running Ori with Docker

## Deployment boundaries

The default deployment is one web container and one persistent SQLite volume.
It supports owner login, Home, tasks, Board, Focus, and saved workspace state
without a Twitter relay, Tailscale, Beeper, Elixir, or a Codex account.
Reader and Vitals retain their existing prototype limitations.
Journal uses separate daily Markdown files. Set `TWITTER_LITE_JOURNAL_DIR` to a
mounted persistent directory to retain entries when replacing the container.

Routine definitions and executions use `TWITTER_LITE_ROUTINE_DIR` (default `~/.local/state/twitter-lite/routines`); mount that directory for persistence. Routine creation/editing needs the Codex runtime; saved forms execute without inference. See [Routine builder](routine-builder.md).

AI execution is a separate, optional process. The web service owns user sessions,
SQLite, activities, and MCP; the runtime owns Codex subprocesses, scheduling,
and execution state. External data sources remain independently configured
adapters, not prerequisites for starting the app.

| Component                      | Required for                        | Persistence / connection                                              |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| Web + SQLite                   | Core workspace                      | `workspace` volume at `/data`                                         |
| Elixir runtime + Codex CLI     | Board delegation and Research chat  | Optional AI Compose file; separate state and Codex credential volumes |
| Twitter relay                  | X reading                           | `TWITTER_RELAY_BASE_URL`                                              |
| Mastodon                       | Mastodon reading                    | Allowed origins and credential encryption key                         |
| Reddit gateway                 | Reddit reading                      | `RDT_GATEWAY_URL`                                                     |
| Beeper CLI + configured target | Message synchronization and sending | External CLI deployment; not bundled into the web image               |
| OwnTracks                      | Location collection                 | Optional archive and device credential files                          |

## Start the core workspace

Install Docker Engine/Desktop with Docker Compose, then run from this repository:

```sh
docker compose up -d --build --wait
docker compose exec web node .output/server/tools/account-setup.js
```

Open **http://localhost:3000**, enter the setup code, and create your owner
account. No host Node.js, pnpm, Nix, Elixir, or external account is required.
The setup code is only printed by the explicit setup command, never by the
public API or ordinary container logs. It cannot create a second owner.

The image runs as UID/GID 1000. The named volume stores SQLite, its WAL, and the
setup token. `docker compose down` preserves this data. `down --volumes` deletes
it. Account setup is needed only for a new volume.

The image is built locally as `ori:local`; no prebuilt registry release is
published by this change. The build installs locked dependencies, including
`@yuta/bird` from the public Gitea Packages registry configured in `.npmrc`.
Running an already built image does not contact that registry. Moving the Bird
package to an independent registry is a separate publication task; the X parser
and pagination behavior remain unchanged.

## Configuration

No environment file is needed for the default deployment. Optional Compose
settings can be exported or placed in a repository-root `.env`:

```dotenv
ORI_PORT=3000
ORI_ORIGIN=http://localhost:3000
# TWITTER_RELAY_BASE_URL=http://your-relay:6900
# RDT_GATEWAY_URL=https://your-reddit-gateway.example
# TWITTER_LITE_MASTODON_ORIGINS=https://mastodon.social
```

`ORI_ORIGIN` must exactly match the browser origin, without a trailing slash.
It defaults to `http://localhost:${ORI_PORT:-3000}`. For a reverse proxy, set it
to the public HTTPS origin. The host port is bound to loopback; route the proxy
to that port, or join a containerized proxy to the Compose network. Tailscale is
optional. The container explicitly disables only the outer Tailscale identity
gate; owner authentication and mutation-origin checks remain enforced.

The existing `/mcp` endpoint is for trusted agents and bypasses browser login.
Keep it on a private network or block it at the public reverse proxy; do not
publish it anonymously with the browser routes. The internal AI runtime uses
the Compose network, so blocking public `/mcp` does not prevent that integration.

Container `localhost` refers to the container itself. External service URLs
must be reachable from the container, not just from the host shell. Do not use
the host's `127.0.0.1` as a relay URL.

The existing `TWITTER_LITE_*` application environment names remain in use.
Use a Compose override to mount integration credentials and set additional
settings from `.env.example`. For Mastodon, mount an encryption key and set
`TWITTER_LITE_CREDENTIAL_KEY_FILE` to its **container path**; see
[storage and OAuth](storage-and-oauth.md). Never bake credentials into an image.

## Add AI execution

```sh
docker compose -f compose.yaml -f compose.ai.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.ai.yaml exec runtime codex login --device-auth
```

The runtime image includes Elixir/OTP and a pinned Codex CLI. Log in explicitly
to a Codex account; the deployment does not import host credentials. Its Codex
home persists in the `codex-home` volume. Set `ORI_CODEX_MODEL` to a model your
account can use; the default matches the existing app configuration.

The runtime creates a private shared authentication token on first startup.
Its HTTP port is exposed only inside the Compose network. The web container
reads that token through a read-only volume and connects to `http://runtime:4318`.
Codex calls the web service's signed MCP endpoint at `http://web:3000/mcp`.
Research reports use a shared `workspaces` volume mounted at the same absolute
path in both services. Runtime state and Codex credentials are not mounted into
the web container.

Use both `-f` arguments for subsequent AI deployment commands, including
`logs`, `exec`, `restart`, and `down`. The web service remains independently
deployable using only the base Compose file. The AI runtime being healthy means
the service is ready, not that Codex has authenticated or that a paid run has
been verified.

## Operations and verification

```sh
docker compose logs --tail=100 web
docker compose exec web node .output/server/tools/backup-database.js /data/backup.sqlite
docker compose cp web:/data/backup.sqlite ./backup.sqlite
docker compose up -d --build --wait
```

The health check requests `/api/auth`, exercising database initialization and
access configuration as well as HTTP readiness. `/health` remains a lightweight
liveness endpoint. Back up integration encryption keys and optional AI volumes
alongside the database if you use those features; see [storage](storage-and-oauth.md).

The Docker smoke test uses an isolated Compose project and fresh volume to
verify setup, login, origin enforcement, workspace pages, and persistence across
container recreation. It removes only that temporary project after the test.

```sh
docker compose build web
nix develop -c pnpm test:docker
```

Alternatively, run `node scripts/docker-smoke.mjs` with Node.js 22 or newer.
