# Owner login and onboarding

Ori uses OpenID Connect authorization code login through Pocket ID. Local
password login and setup codes are not supported. Pages, server functions,
and research streams require a workspace session; MCP has its separate
[OAuth access-token boundary](http-mcp.md).

## Configuration

Register a confidential client with PKCE enabled in Pocket ID. Its exact
callback URL is `<TWITTER_LITE_ORIGIN>/api/auth/callback`. Configure Ori with:

```sh
TWITTER_LITE_ORIGIN=https://home.example.com
WORKSPACE_OIDC_ISSUER=https://id.example.com
WORKSPACE_OIDC_CLIENT_ID=ori
WORKSPACE_OIDC_CLIENT_SECRET_FILE=/run/secrets/ori-oidc-client-secret
WORKSPACE_OIDC_OWNER_SUBJECT=<Pocket-ID-user-ID>
```

The secret file must be readable only by the service and its administrator.
For Docker, mount that file read-only at the configured container path and
pass these variables to the web service. The issuer must use HTTPS. The app
origin must use HTTPS, except for HTTP loopback during local development.

Access is restricted to the configured issuer and subject. Email matching
never links or authorizes an account. Registering another Pocket ID user does
not grant access to Ori. On a fresh database, the first successful login by
the configured owner creates the single local owner and opens onboarding.
The owner's ID token must contain an email address. Complete onboarding to
choose the display name and enter Home.

## Migrating an existing workspace

Back up SQLite before deployment. The schema migration removes the old
password hash and password-attempt table, keeping the existing owner ID,
name, email, onboarding completion, data, and sessions. Set the issuer and
subject to the intended existing owner's Pocket ID identity before starting
the new version. That identity signs in to the existing owner; profile claims
do not overwrite local profile data. There is no password fallback.

Old `.setup-token` files are unused and may be removed. Reverting to the old
password-based version requires restoring the pre-migration database backup.

## Sessions and authorization flow

The OIDC library validates issuer, audience, expiry, nonce, and ID-token
signature. Every login uses PKCE S256 and a random state value. A short-lived
HttpOnly cookie binds the browser to a one-use login transaction stored in
SQLite, which expires after ten minutes. Callback URLs come from the fixed
public-origin configuration; return destinations are limited to local app
routes. Provider access/refresh tokens are not retained by browser login.

Workspace session cookies are HttpOnly, SameSite=Lax, host-only, and Secure
for an HTTPS public origin. Only session token hashes are stored in SQLite;
sessions expire after 30 days. Signing in replaces the current browser's old
session. **Sign out** revokes the current Ori session; it does not sign out
of Pocket ID or other devices. Open research streams stop sending updates
when the session is revoked or expires, with an idle check every 15 seconds.
Authenticated responses are not cached.

The optional Tailscale identity check remains an outer boundary;
`TWITTER_LITE_AUTH_MODE=none` disables only that check, not app login.
Origin checks still protect mutations.

Back up the database and external Journal files as described in
[storage](storage-and-oauth.md) and [Journal](home-task-composer.md).

## Implementation

- `src/features/auth/oidc.server.ts`: discovery, PKCE login, callback validation.
- `src/features/auth/auth.server.ts`: pinned owner, sessions, onboarding.
- `src/features/auth/gate.server.ts` and root route guard: request/navigation protection.
- `/api/auth/login`, `/api/auth/callback`: OIDC redirect and callback.
- `/api/auth`: session state, onboarding, sign-out.
- `/login`, `/onboarding`: sign-in and onboarding pages.

Unit tests exercise signed tokens, rejected issuer/audience/nonce/signature,
owner restriction, transaction expiry/replay, sessions, and migration.
Browser tests use an isolated HTTPS test identity provider.
