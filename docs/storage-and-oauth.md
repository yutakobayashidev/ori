# Shared storage and Mastodon OAuth

Personal Workspace runs as a single personal server behind Tailscale Serve. The
backend binds to loopback. The configured Tailscale identity is an outer access
check; a separate [owner login](login.md) is required in every deployment mode.
Browser requests that change state must have the configured Origin. OAuth
callbacks also pass the owner check; the browser must be able to reach the
tailnet HTTPS address after Mastodon authorization.

## Runtime configuration

| Variable                           | Value                                                     |
| ---------------------------------- | --------------------------------------------------------- |
| `TWITTER_LITE_ORIGIN`              | Exact Serve HTTPS origin, without a trailing slash        |
| `TWITTER_LITE_ALLOWED_LOGIN`       | Owner's Tailscale login                                   |
| `TWITTER_LITE_DB_PATH`             | Absolute path to the SQLite database on local disk        |
| `TWITTER_LITE_MASTODON_ORIGINS`    | Comma-separated approved HTTPS instance origins           |
| `TWITTER_LITE_CREDENTIAL_KEY_FILE` | Runtime file containing 32 random bytes encoded as base64 |

The credential key is required for Mastodon, but not for Twitter-only use.
Generate it once, keep it outside Git and the Nix store, and retain it when
updating the application. For example, with an existing private directory:

```sh
umask 077
nix develop -c node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {writeFileSync} from "node:fs"; writeFileSync("/absolute/private/credential-key", randomBytes(32).toString("base64") + "\n", {flag: "wx", mode: 0o600})'
```

The command refuses to replace an existing file. Losing the key makes saved
SNS credentials unreadable. A separate protected backup of the key is needed
alongside database backups.

## Database and migrations

Drizzle ORM 0.45.3, Drizzle Kit 0.31.11 and better-sqlite3 13.0.3 are pinned.
The driver ships native prebuilds; dependency install scripts remain disabled.
Both the actual Nix Node runtime and the built Nix package have been exercised
with SQLite operations and the packaged backup command.

`drizzle/` contains generated SQL and metadata. `pnpm db:generate` generates
SQL and bundles it into TypeScript for the server. Commit both artifacts with
schema changes. The server applies pending migrations under an immediate
transaction before serving an authorized application request. It enables WAL,
foreign keys and a five-second busy timeout. Deployment does not depend on a
particular working directory or a separate migration command.

Deck definitions, ordered columns, connection metadata, OAuth applications
and short-lived OAuth attempts live in SQLite. Tokens, client secrets and
PKCE verifiers are authenticated encrypted envelopes in separate fields.
Their associated data binds each secret to its record and purpose. Public
connection responses never select those fields.

## Backups and restore

Use the live SQLite backup API instead of copying only the main file while WAL
is active. The destination must be an absolute path that does not already
exist; backups are mode 0600 and pass a SQLite integrity check.

```sh
TWITTER_LITE_DB_PATH=/absolute/workspace.sqlite \
  nix develop -c pnpm db:backup /absolute/backups/workspace-2026-09-24.sqlite
```

The Nix package exposes the same operation as `twitter-lite-backup`:

```sh
TWITTER_LITE_DB_PATH=/var/lib/twitter-lite/workspace.sqlite \
  twitter-lite-backup /absolute/backups/workspace-2026-09-24.sqlite
```

Run it as an identity that can read the database and write the backup directory.
On NixOS the application uses `DynamicUser`, `StateDirectory=twitter-lite` and
mode 0700. The runtime key is passed with systemd `LoadCredential`.

For restore, stop the service first. Preserve the current state directory as
a separate recovery copy, then restore the verified backup as
`workspace.sqlite` in a clean state directory with the service's ownership and
permissions. Do not leave old `-wal` or `-shm` sidecars beside a restored main
database. Restore the matching credential key separately, then start the
service and verify decks and account access. Do not attempt to restore a newer
schema into an older application version.

## OAuth and instance support

Initial support targets Mastodon 4.3+ with PKCE S256. The first configured
instance, `https://fedi.yutakobayashi.com`, reported 4.5.3 and S256 on 2026-09-24.
Only configured HTTPS origins with public DNS addresses are accepted; server
requests pin the resolved address and refuse redirects.

Each instance/callback/scope combination has an OAuth application. Authorization
uses `read:accounts read:statuses read:lists read:search`, PKCE, a ten-minute
one-use state and an HttpOnly browser-binding cookie. Tokens are exchanged and
account identity is verified on the server. The callback URL never contains an
access token. Same-instance accounts remain separate; reconnecting preserves
the connection ID only for the same account.

An expired token marks its connection unavailable until reconnected. Disconnect
first revokes the token using the original OAuth application, then removes the
local credential while retaining the connection reference used by saved decks.

Search results depend on the instance's backend and indexing. A successful
empty response does not prove full-text search is enabled: Mastodon 4.5.3 also
returns empty status results when its search backend is disabled.
