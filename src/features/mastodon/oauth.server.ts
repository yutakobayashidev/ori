import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { readAccessConfig } from "../access/policy.server";
import { decryptCredential, encryptCredential } from "../connections/credentials.server";
import { type AppDatabase, getDatabase } from "../storage/database.server";
import { connectionCredentials, connections, oauthApps, oauthAttempts } from "../storage/schema";
import { requireMastodonOrigin, safeMastodonRequest } from "./transport.server";

export const oauthLifetimeSeconds = 600;
const scopes = "read:accounts read:statuses read:lists read:search";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const appSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().regex(/^bearer$/i),
  scope: z.string(),
});
const accountSchema = z.object({
  id: z.string().min(1),
  acct: z.string().min(1),
});
type Send = typeof safeMastodonRequest;

export function oauthCookieName(state: string) {
  return `mastodon_oauth_${hash(state).slice(0, 24)}`;
}

function callbackUri() {
  const config = readAccessConfig();
  if (!config) throw new Error("Access configuration is required.");
  return `${config.origin}/oauth/mastodon/callback`;
}

async function formRequest(
  send: Send,
  origin: string,
  path: string,
  fields: Record<string, string>,
) {
  const response = await send(new URL(path, origin), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new Error(`Mastodon request failed with HTTP ${response.status}.`);
  return response;
}

async function getApp(origin: string, database: AppDatabase, send: Send) {
  const redirectUri = callbackUri();
  const existing = database
    .select()
    .from(oauthApps)
    .where(
      and(
        eq(oauthApps.origin, origin),
        eq(oauthApps.redirectUri, redirectUri),
        eq(oauthApps.scopes, scopes),
      ),
    )
    .get();
  if (existing) return existing;
  const metadataResponse = await send(new URL("/.well-known/oauth-authorization-server", origin));
  if (!metadataResponse.ok) throw new Error("Mastodon OAuth metadata is unavailable.");
  const metadata = z
    .object({ code_challenge_methods_supported: z.array(z.string()) })
    .parse(await metadataResponse.json());
  if (!metadata.code_challenge_methods_supported.includes("S256"))
    throw new Error("This instance does not support PKCE S256.");
  const registered = appSchema.parse(
    await (
      await formRequest(send, origin, "/api/v1/apps", {
        client_name: "Personal Workspace",
        redirect_uris: redirectUri,
        scopes,
      })
    ).json(),
  );
  const id = randomUUID();
  const app = {
    id,
    origin,
    redirectUri,
    scopes,
    clientId: registered.client_id,
    encryptedClientSecret: encryptCredential(
      registered.client_secret,
      `oauth-app:${id}:client-secret`,
    ),
    createdAt: Date.now(),
  };
  database.insert(oauthApps).values(app).onConflictDoNothing().run();
  return (
    database
      .select()
      .from(oauthApps)
      .where(
        and(
          eq(oauthApps.origin, origin),
          eq(oauthApps.redirectUri, redirectUri),
          eq(oauthApps.scopes, scopes),
        ),
      )
      .get() ?? app
  );
}

export async function beginMastodonOAuth(
  input: { origin: string; connectionId?: string },
  database = getDatabase(),
  send: Send = safeMastodonRequest,
) {
  database.delete(oauthAttempts).where(lt(oauthAttempts.expiresAt, Date.now())).run();
  const origin = requireMastodonOrigin(input.origin);
  if (input.connectionId) {
    const connection = database
      .select()
      .from(connections)
      .where(eq(connections.id, input.connectionId))
      .get();
    if (connection?.platform !== "mastodon" || connection.origin !== origin)
      throw new Error("The reconnect account does not match this instance.");
  }
  const app = await getApp(origin, database, send);
  const state = random();
  const browserCookie = random();
  const verifier = random();
  const stateHash = hash(state);
  database
    .insert(oauthAttempts)
    .values({
      stateHash,
      browserHash: hash(browserCookie),
      appId: app.id,
      encryptedVerifier: encryptCredential(verifier, `oauth-attempt:${stateHash}:verifier`),
      connectionId: input.connectionId ?? null,
      expiresAt: Date.now() + oauthLifetimeSeconds * 1000,
    })
    .run();
  const authorize = new URL("/oauth/authorize", origin);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    scope: app.scopes,
    state,
    force_login: "true",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  return { authorizationUrl: authorize.toString(), state, browserCookie };
}

export async function completeMastodonOAuth(
  input: {
    state: string;
    browserCookie?: string;
    code?: string;
    error?: string;
  },
  database = getDatabase(),
  send: Send = safeMastodonRequest,
): Promise<string> {
  if (!input.state || !input.browserCookie)
    throw new Error("OAuth state or browser binding is missing.");
  const stateHash = hash(input.state);
  const now = Date.now();
  const attempt = database
    .update(oauthAttempts)
    .set({ consumedAt: now })
    .where(
      and(
        eq(oauthAttempts.stateHash, stateHash),
        eq(oauthAttempts.browserHash, hash(input.browserCookie)),
        isNull(oauthAttempts.consumedAt),
        gt(oauthAttempts.expiresAt, now),
      ),
    )
    .returning()
    .get();
  if (!attempt) throw new Error("OAuth attempt is invalid, expired, or already used.");
  if (input.error || !input.code) throw new Error("Mastodon authorization was not completed.");
  const app = database.select().from(oauthApps).where(eq(oauthApps.id, attempt.appId)).get();
  if (!app) throw new Error("OAuth app is unavailable.");
  requireMastodonOrigin(app.origin);
  const token = tokenSchema.parse(
    await (
      await formRequest(send, app.origin, "/oauth/token", {
        grant_type: "authorization_code",
        code: input.code,
        client_id: app.clientId,
        client_secret: decryptCredential(
          app.encryptedClientSecret,
          `oauth-app:${app.id}:client-secret`,
        ),
        redirect_uri: app.redirectUri,
        code_verifier: decryptCredential(
          attempt.encryptedVerifier,
          `oauth-attempt:${stateHash}:verifier`,
        ),
      })
    ).json(),
  );
  const granted = new Set(token.scope.split(" "));
  if (!scopes.split(" ").every((scope) => granted.has(scope)))
    throw new Error("Required Mastodon read permissions were not granted.");
  const verified = await send(new URL("/api/v1/accounts/verify_credentials", app.origin), {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!verified.ok) throw new Error("Mastodon account verification failed.");
  const account = accountSchema.parse(await verified.json());
  return database.transaction((tx) => {
    const existing = tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.platform, "mastodon"),
          eq(connections.origin, app.origin),
          eq(connections.accountId, account.id),
        ),
      )
      .get();
    if (attempt.connectionId && existing?.id !== attempt.connectionId)
      throw new Error("The authorized account does not match the account being reconnected.");
    const id = existing?.id ?? randomUUID();
    tx.insert(connections)
      .values({
        id,
        platform: "mastodon",
        origin: app.origin,
        accountId: account.id,
        displayName: `@${account.acct}`,
        status: "connected",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: connections.id,
        set: {
          displayName: `@${account.acct}`,
          status: "connected",
          updatedAt: now,
        },
      })
      .run();
    const credential = {
      connectionId: id,
      appId: app.id,
      encryptedToken: encryptCredential(token.access_token, `connection:${id}:access-token`),
      updatedAt: now,
    };
    tx.insert(connectionCredentials)
      .values(credential)
      .onConflictDoUpdate({
        target: connectionCredentials.connectionId,
        set: credential,
      })
      .run();
    return id;
  });
}

export async function disconnectMastodon(
  connectionId: string,
  database = getDatabase(),
  send: Send = safeMastodonRequest,
) {
  const connection = database
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();
  if (connection?.platform !== "mastodon") throw new Error("Mastodon connection was not found.");
  const credential = database
    .select()
    .from(connectionCredentials)
    .where(eq(connectionCredentials.connectionId, connectionId))
    .get();
  if (credential) {
    const app = credential.appId
      ? database.select().from(oauthApps).where(eq(oauthApps.id, credential.appId)).get()
      : undefined;
    if (!app) throw new Error("The OAuth app required to revoke this connection is missing.");
    requireMastodonOrigin(connection.origin);
    await formRequest(send, connection.origin, "/oauth/revoke", {
      client_id: app.clientId,
      client_secret: decryptCredential(
        app.encryptedClientSecret,
        `oauth-app:${app.id}:client-secret`,
      ),
      token: decryptCredential(
        credential.encryptedToken,
        `connection:${connectionId}:access-token`,
      ),
    });
  }
  database.transaction(
    (tx) => {
      const current = tx
        .select()
        .from(connectionCredentials)
        .where(eq(connectionCredentials.connectionId, connectionId))
        .get();
      if (current?.encryptedToken !== credential?.encryptedToken)
        throw new Error(
          "This account was reconnected during revocation. Its new connection has been kept. Refresh the account list before trying again.",
        );
      tx.delete(connectionCredentials)
        .where(eq(connectionCredentials.connectionId, connectionId))
        .run();
      tx.update(connections)
        .set({ status: "disconnected", updatedAt: Date.now() })
        .where(eq(connections.id, connectionId))
        .run();
    },
    { behavior: "immediate" },
  );
}
