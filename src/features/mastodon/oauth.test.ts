// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decryptCredential } from "../connections/credentials.server";
import { type AppDatabase, openDatabase } from "../storage/database.server";
import { connectionCredentials, connections, oauthApps, oauthAttempts } from "../storage/schema";
import { beginMastodonOAuth, completeMastodonOAuth, disconnectMastodon } from "./oauth.server";

let database: AppDatabase;
let directory: string;
let accountId: string;
const origin = "https://mastodon.invalid";
const token = "private-access-token";
const clientSecret = "private-client-secret";
const send = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(
  async (url: URL, _init?: RequestInit): Promise<Response> => {
    if (url.pathname === "/.well-known/oauth-authorization-server")
      return Response.json({ code_challenge_methods_supported: ["S256"] });
    if (url.pathname === "/api/v1/apps")
      return Response.json({ client_id: "client", client_secret: clientSecret });
    if (url.pathname === "/oauth/token")
      return Response.json({
        access_token: token,
        token_type: "Bearer",
        scope: "read:accounts read:statuses read:lists read:search",
      });
    if (url.pathname === "/api/v1/accounts/verify_credentials")
      return Response.json({ id: accountId, acct: `user${accountId}` });
    if (url.pathname === "/oauth/revoke") return Response.json({});
    throw new Error("Unexpected mock endpoint");
  },
);

beforeEach(() => {
  database = openDatabase(":memory:");
  directory = mkdtempSync(join(tmpdir(), "twitter-lite-oauth-"));
  const key = join(directory, "key");
  writeFileSync(key, randomBytes(32).toString("base64"), { mode: 0o600 });
  vi.stubEnv("TWITTER_LITE_CREDENTIAL_KEY_FILE", key);
  vi.stubEnv("TWITTER_LITE_ORIGIN", "https://deck.invalid");
  vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", "owner@deck.invalid");
  vi.stubEnv("TWITTER_LITE_MASTODON_ORIGINS", `${origin},https://second.invalid`);
  accountId = "1";
  send.mockClear();
});
afterEach(() => {
  database.$client.close();
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllEnvs();
});

it("registers once and uses force-login, state and PKCE while storing only encrypted secrets", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const url = new URL(attempt.authorizationUrl);
  expect(url.origin).toBe(origin);
  expect(url.searchParams.get("redirect_uri")).toBe("https://deck.invalid/oauth/mastodon/callback");
  expect(url.searchParams.get("force_login")).toBe("true");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe(attempt.state);
  const id = await completeMastodonOAuth(
    { ...attempt, code: "authorization-code" },
    database,
    send,
  );
  const credentials = database.select().from(connectionCredentials).get();
  expect(credentials?.connectionId).toBe(id);
  expect(
    decryptCredential(credentials?.encryptedToken ?? "", `connection:${id}:access-token`),
  ).toBe(token);
  const saved = JSON.stringify({
    apps: database.select().from(oauthApps).all(),
    attempts: database.select().from(oauthAttempts).all(),
    credentials,
  });
  expect(saved).not.toContain(token);
  expect(saved).not.toContain(clientSecret);
  expect(saved).not.toContain(attempt.state);
  expect(saved).not.toContain(attempt.browserCookie);
  const exchange = send.mock.calls.find(([request]) => request.pathname === "/oauth/token");
  const fields = exchange?.[1]?.body as URLSearchParams;
  expect(
    createHash("sha256")
      .update(fields.get("code_verifier") ?? "")
      .digest("base64url"),
  ).toBe(url.searchParams.get("code_challenge"));
  await beginMastodonOAuth({ origin }, database, send);
  expect(send.mock.calls.filter(([request]) => request.pathname === "/api/v1/apps")).toHaveLength(
    1,
  );
});

it("supports two accounts per instance and accounts on another instance without changing reconnect IDs", async () => {
  const first = await beginMastodonOAuth({ origin }, database, send);
  const firstId = await completeMastodonOAuth({ ...first, code: "first" }, database, send);
  accountId = "2";
  const second = await beginMastodonOAuth({ origin }, database, send);
  const secondId = await completeMastodonOAuth({ ...second, code: "second" }, database, send);
  expect(secondId).not.toBe(firstId);
  const another = await beginMastodonOAuth({ origin: "https://second.invalid" }, database, send);
  const anotherId = await completeMastodonOAuth({ ...another, code: "another" }, database, send);
  expect(anotherId).not.toBe(secondId);
  const reconnect = await beginMastodonOAuth({ origin, connectionId: secondId }, database, send);
  expect(await completeMastodonOAuth({ ...reconnect, code: "reconnect" }, database, send)).toBe(
    secondId,
  );
  expect(database.select().from(connections).all()).toHaveLength(3);
});

it("rejects mismatched reconnect accounts without replacing the existing credential", async () => {
  const first = await beginMastodonOAuth({ origin }, database, send);
  const id = await completeMastodonOAuth({ ...first, code: "first" }, database, send);
  const before = database.select().from(connectionCredentials).get();
  const reconnect = await beginMastodonOAuth({ origin, connectionId: id }, database, send);
  accountId = "different";
  await expect(
    completeMastodonOAuth({ ...reconnect, code: "other" }, database, send),
  ).rejects.toThrow("does not match");
  expect(database.select().from(connectionCredentials).get()).toEqual(before);
});

it("rejects browser mismatch and unknown state before exchanging a code", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const calls = send.mock.calls.length;
  await expect(
    completeMastodonOAuth(
      { ...attempt, browserCookie: "another-browser", code: "code" },
      database,
      send,
    ),
  ).rejects.toThrow("invalid, expired, or already used");
  await expect(
    completeMastodonOAuth({ ...attempt, state: "unknown-state", code: "code" }, database, send),
  ).rejects.toThrow("invalid, expired, or already used");
  expect(send).toHaveBeenCalledTimes(calls);
});

it("consumes rejected authorization attempts so they cannot be retried", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  await expect(
    completeMastodonOAuth({ ...attempt, error: "access_denied" }, database, send),
  ).rejects.toThrow("not completed");
  await expect(completeMastodonOAuth({ ...attempt, code: "code" }, database, send)).rejects.toThrow(
    "already used",
  );
  expect(database.select().from(connections).all()).toHaveLength(0);
});

it("rejects expired attempts without exchanging the code", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  database
    .update(oauthAttempts)
    .set({ expiresAt: Date.now() - 1 })
    .run();
  await expect(completeMastodonOAuth({ ...attempt, code: "code" }, database, send)).rejects.toThrow(
    "expired",
  );
  expect(send.mock.calls.filter(([request]) => request.pathname === "/oauth/token")).toHaveLength(
    0,
  );
});

it("allows exactly one exchange when callbacks race", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const results = await Promise.allSettled([
    completeMastodonOAuth({ ...attempt, code: "code" }, database, send),
    completeMastodonOAuth({ ...attempt, code: "code" }, database, send),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(send.mock.calls.filter(([request]) => request.pathname === "/oauth/token")).toHaveLength(
    1,
  );
});

it("rejects instances outside the configured allowlist without network requests", async () => {
  await expect(
    beginMastodonOAuth({ origin: "https://unconfigured.invalid" }, database, send),
  ).rejects.toThrow("not configured");
  expect(send).not.toHaveBeenCalled();
});

it("revokes with the original app, erases credentials, and retains the column binding ID", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const id = await completeMastodonOAuth({ ...attempt, code: "code" }, database, send);
  vi.stubEnv("TWITTER_LITE_ORIGIN", "https://new-deck.invalid");
  await disconnectMastodon(id, database, send);
  expect(database.select().from(connectionCredentials).all()).toHaveLength(0);
  expect(database.select().from(connections).where(eq(connections.id, id)).get()?.status).toBe(
    "disconnected",
  );
  const revoke = send.mock.calls.find(([request]) => request.pathname === "/oauth/revoke");
  const fields = revoke?.[1]?.body as URLSearchParams;
  expect(fields.get("client_secret")).toBe(clientSecret);
  expect(fields.get("token")).toBe(token);
});

it("keeps credentials available for another revoke attempt when revocation fails", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const id = await completeMastodonOAuth({ ...attempt, code: "code" }, database, send);
  const failedRevoke = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response(null, { status: 503 }),
  );
  await expect(disconnectMastodon(id, database, failedRevoke)).rejects.toThrow("HTTP 503");
  expect(database.select().from(connectionCredentials).all()).toHaveLength(1);
  expect(database.select().from(connections).get()?.status).toBe("connected");
});

it("keeps a new credential when an older disconnect completes after reconnection", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const id = await completeMastodonOAuth({ ...attempt, code: "code" }, database, send);
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  const pendingRevoke = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(() => response);
  const disconnect = disconnectMastodon(id, database, pendingRevoke);
  expect(pendingRevoke).toHaveBeenCalledTimes(1);
  const reconnect = await beginMastodonOAuth({ origin, connectionId: id }, database, send);
  await completeMastodonOAuth({ ...reconnect, code: "reconnect" }, database, async (url, init) =>
    url.pathname === "/oauth/token"
      ? Response.json({
          access_token: "new-access-token",
          token_type: "Bearer",
          scope: "read:accounts read:statuses read:lists read:search",
        })
      : send(url, init),
  );
  resolveResponse(Response.json({}));
  await expect(disconnect).rejects.toThrow("reconnected during revocation");
  const credential = database.select().from(connectionCredentials).get();
  expect(decryptCredential(credential?.encryptedToken ?? "", `connection:${id}:access-token`)).toBe(
    "new-access-token",
  );
  expect(database.select().from(connections).get()?.status).toBe("connected");
});

it("rejects incomplete scopes without saving the token", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const limitedGrant = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({
      access_token: token,
      token_type: "Bearer",
      scope: "read:accounts",
    }),
  );
  await expect(
    completeMastodonOAuth({ ...attempt, code: "code" }, database, limitedGrant),
  ).rejects.toThrow("permissions were not granted");
  expect(database.select().from(connectionCredentials).all()).toHaveLength(0);
});

it("consumes an attempt before a failing token exchange", async () => {
  const attempt = await beginMastodonOAuth({ origin }, database, send);
  const failedExchange = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response(null, { status: 400 }),
  );
  await expect(
    completeMastodonOAuth({ ...attempt, code: "code" }, database, failedExchange),
  ).rejects.toThrow("HTTP 400");
  await expect(completeMastodonOAuth({ ...attempt, code: "code" }, database, send)).rejects.toThrow(
    "already used",
  );
});
