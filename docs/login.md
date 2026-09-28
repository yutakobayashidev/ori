# Owner login and onboarding

This is a single-owner workspace. App login is mandatory for all workspace
pages, server functions, and research streams. The existing Tailscale identity
check is an optional outer boundary; `TWITTER_LITE_AUTH_MODE=none` disables only
that outer check, not app login. Origin checks still protect mutations.

## First use

Start the server with its usual database and public-origin configuration, then
run this on the server using the same database:

```bash
nix develop -c pnpm account:setup
```

The Nix package also provides `twitter-lite-setup`; run it with the service
database path and filesystem permissions.

The command loads `.env.local` when present. An exported `TWITTER_LITE_DB_PATH`
takes precedence. It prints a setup code for `/setup`; keep that code private.
The code is created in `<database path>.setup-token` with mode 0600, or supplied
through `WORKSPACE_SETUP_TOKEN` (at least 32 characters). It is never returned
by the app's public API. The owner account can be created only once, including
when two setup requests arrive together. The code cannot register another
account or reset an existing password after setup.

Visit the app, enter the setup code, your name, email, and a password of 15–128
characters. The email is a login identifier; this prototype does not verify it
or send email. Choose your display name and finish the short onboarding to
open Home. Onboarding completion and the name persist in SQLite. Home greets
you by that name.

## Sessions

Passwords use salted scrypt hashes (N=2^17, r=8, p=1). Session cookies are
HttpOnly, SameSite=Lax, host-only, and Secure for an HTTPS public origin.
Only token hashes are stored in SQLite; sessions expire after 30 days.
Setup and login share a persistent limit of 10 attempts per 15 minutes;
successful authentication clears that limit.

Open the avatar menu and choose **Sign out** to revoke the current session.
Open research streams stop sending updates when the session is revoked or
expires, with an idle check every 15 seconds. Other logged-in devices retain
their own sessions. Authenticated responses are not cached.

Account registration is closed once the owner exists. Multiple users,
email-based password recovery, and account management are not implemented.
Back up the SQLite database as described in [storage](storage-and-oauth.md).
Home tasks, messages, and journal entries remain session-local prototypes;
onboarding does not make those records persistent.

## Implementation

- `src/features/auth/auth.server.ts`: owner, password hashing, throttling, sessions.
- `src/features/auth/gate.server.ts` and `src/start.ts`: request-level protection.
- `/api/auth`: session state, setup, sign-in, onboarding, and sign-out.
- Root route guard: client navigation and onboarding redirects.
- `/setup`, `/login`, `/onboarding`: English forms using the existing UI system.

Password and session handling follow the relevant
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
and [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
guidance. Tests cover invalid credentials, bootstrap ownership, expiry,
revocation, request protection, and onboarding persistence.
