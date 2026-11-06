import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, lte } from "drizzle-orm";
import * as oidc from "openid-client";
import { getDatabase } from "../storage/database.server";
import { oidcLoginRequests } from "../storage/schema";
import { AuthError, signInWithOidc, signOut } from "./auth.server";
import { sessionCookie, sessionToken } from "./http.server";
import { safeReturnTo } from "./return-to";

const LOGIN_COOKIE = "workspace_oidc";
const LOGIN_TTL_SECONDS = 600;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function settings() {
  const issuer = process.env.WORKSPACE_OIDC_ISSUER;
  const clientId = process.env.WORKSPACE_OIDC_CLIENT_ID;
  const secretFile = process.env.WORKSPACE_OIDC_CLIENT_SECRET_FILE;
  const origin = process.env.TWITTER_LITE_ORIGIN;
  if (!issuer || !clientId || !secretFile || !origin || !process.env.WORKSPACE_OIDC_OWNER_SUBJECT)
    throw new AuthError(503, "Sign-in is not configured.");
  const issuerUrl = new URL(issuer);
  const originUrl = new URL(origin);
  if (
    issuerUrl.protocol !== "https:" ||
    issuerUrl.username ||
    issuerUrl.password ||
    issuerUrl.search ||
    issuerUrl.hash ||
    originUrl.origin !== origin ||
    (originUrl.protocol !== "https:" &&
      !(
        originUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(originUrl.hostname)
      ))
  )
    throw new AuthError(503, "Sign-in URLs are not configured correctly.");
  const secret = readFileSync(secretFile, "utf8").trim();
  if (!secret) throw new AuthError(503, "Sign-in is not configured.");
  return {
    issuerUrl,
    clientId,
    secret,
    callback: `${origin}/api/auth/callback`,
    secure: originUrl.protocol === "https:",
  };
}

let cached: { key: string; configuration: Promise<oidc.Configuration> } | undefined;
async function configuration(config: ReturnType<typeof settings>) {
  const key = JSON.stringify([config.issuerUrl.href, config.clientId, config.secret]);
  if (cached?.key !== key) {
    const configuration = oidc.discovery(
      config.issuerUrl,
      config.clientId,
      config.secret,
      undefined,
      {
        timeout: 10,
        execute: [oidc.enableNonRepudiationChecks],
      },
    );
    cached = { key, configuration };
    configuration.catch(() => {
      if (cached?.configuration === configuration) cached = undefined;
    });
  }
  return cached.configuration;
}

function loginCookie(token: string, secure: boolean, clear = false) {
  return `${LOGIN_COOKIE}=${token}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : LOGIN_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AuthError
          ? error.message
          : "Sign-in failed. Please return to /login and try again.",
    },
    {
      status: error instanceof AuthError ? error.status : 401,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function oidcLogin(request: Request, database = getDatabase()) {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  try {
    const config = settings();
    const client = await configuration(config);
    const token = randomBytes(32).toString("base64url");
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const authorization = oidc.buildAuthorizationUrl(client, {
      redirect_uri: config.callback,
      scope: "openid profile email",
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: "S256",
      state,
      nonce,
    });
    database.delete(oidcLoginRequests).where(lte(oidcLoginRequests.expiresAt, Date.now())).run();
    database
      .insert(oidcLoginRequests)
      .values({
        tokenHash: hash(token),
        state,
        nonce,
        codeVerifier,
        returnTo: safeReturnTo(new URL(request.url).searchParams.get("returnTo")),
        expiresAt: Date.now() + LOGIN_TTL_SECONDS * 1000,
      })
      .run();
    return new Response(null, {
      status: 303,
      headers: {
        location: authorization.href,
        "cache-control": "no-store",
        "set-cookie": loginCookie(token, config.secure),
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function oidcCallback(request: Request, database = getDatabase()) {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  try {
    const config = settings();
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${LOGIN_COOKIE}=`))
      ?.slice(LOGIN_COOKIE.length + 1);
    if (!token || token.length > 128)
      throw new AuthError(401, "Sign-in request is missing or expired.");
    // DELETE RETURNING consumes the transaction atomically, including unsuccessful callbacks.
    const transaction = database
      .delete(oidcLoginRequests)
      .where(eq(oidcLoginRequests.tokenHash, hash(token)))
      .returning()
      .get();
    if (!transaction || transaction.expiresAt <= Date.now())
      throw new AuthError(401, "Sign-in request is missing or expired.");
    const client = await configuration(config);
    // The public callback origin is fixed configuration, never a forwarded Host header.
    const callback = new URL(config.callback);
    callback.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(client, callback, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims) throw new AuthError(401, "The identity provider did not return an ID token.");
    const result = signInWithOidc(
      {
        issuer: claims.iss,
        subject: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        name: typeof claims.name === "string" ? claims.name : undefined,
      },
      database,
    );
    signOut(sessionToken(request), database);
    const headers = new Headers({
      location: result.owner.onboardingCompletedAt ? transaction.returnTo : "/onboarding",
      "cache-control": "no-store",
    });
    headers.append("set-cookie", sessionCookie(result.sessionToken));
    headers.append("set-cookie", loginCookie("", config.secure, true));
    return new Response(null, { status: 303, headers });
  } catch (error) {
    return failure(error);
  }
}
