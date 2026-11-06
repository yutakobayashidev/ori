// @vitest-environment node
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../storage/database.server";
import { authSessions, oidcLoginRequests, workspaceOwner } from "../storage/schema";
import { completeOnboarding, getSession, signInWithOidc } from "./auth.server";
import { oidcCallback, oidcLogin } from "./oidc.server";

const mocked = vi.hoisted(() => ({
  fetch: vi.fn<import("openid-client").CustomFetch>(),
}));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
      args[0] === "/test/oidc-secret" ? "test-client-secret" : actual.readFileSync(...args),
  };
});
vi.mock("openid-client", async (original) => {
  const actual = await original<typeof import("openid-client")>();
  return {
    ...actual,
    discovery: (...args: Parameters<typeof actual.discovery>) =>
      actual.discovery(args[0], args[1], args[2], args[3], {
        ...args[4],
        [actual.customFetch]: mocked.fetch,
      }),
  };
});

const issuer = "https://id.example.com";
const origin = "https://workspace.example.com";
let database: ReturnType<typeof openDatabase>;
let signingKey: Awaited<ReturnType<typeof generateKeyPair>>;
let overrides: Record<string, unknown>;
let clientId: string;
let tokenRequests: URLSearchParams[];
let requestNonce = "";
let requestVerifier = "";
let badSignature = false;

beforeEach(async () => {
  database = openDatabase(":memory:");
  signingKey = await generateKeyPair("RS256");
  overrides = {};
  tokenRequests = [];
  badSignature = false;
  clientId = `ori-${crypto.randomUUID()}`;
  vi.stubEnv("WORKSPACE_OIDC_ISSUER", issuer);
  vi.stubEnv("WORKSPACE_OIDC_CLIENT_ID", clientId);
  vi.stubEnv("WORKSPACE_OIDC_CLIENT_SECRET_FILE", "/test/oidc-secret");
  vi.stubEnv("WORKSPACE_OIDC_OWNER_SUBJECT", "owner-subject");
  vi.stubEnv("TWITTER_LITE_ORIGIN", origin);
  mocked.fetch.mockImplementation(async (url, options) => {
    const path = new URL(url).pathname;
    if (path === "/.well-known/openid-configuration")
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        code_challenge_methods_supported: ["S256"],
      });
    if (path === "/jwks")
      return Response.json({
        keys: [
          { ...(await exportJWK(signingKey.publicKey)), kid: "test", alg: "RS256", use: "sig" },
        ],
      });
    if (path === "/token") {
      if (!(options.body instanceof URLSearchParams) && typeof options.body !== "string")
        throw new Error("Expected form body");
      const body = new URLSearchParams(options.body);
      tokenRequests.push(body);
      const now = Math.floor(Date.now() / 1000);
      const key = badSignature
        ? (await generateKeyPair("RS256")).privateKey
        : signingKey.privateKey;
      const idToken = await new SignJWT({
        iss: issuer,
        aud: clientId,
        sub: "owner-subject",
        nonce: requestNonce,
        email: "owner@example.com",
        name: "Owner",
        iat: now,
        exp: now + 300,
        ...overrides,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .sign(key);
      return Response.json({
        access_token: "provider-access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token: idToken,
      });
    }
    throw new Error(`Unexpected OIDC request: ${path}`);
  });
});
afterEach(() => {
  database.$client.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function begin(returnTo = "/") {
  const response = await oidcLogin(
    new Request(`${origin}/api/auth/login?${new URLSearchParams({ returnTo })}`),
    database,
  );
  expect(response.status).toBe(303);
  const authorization = new URL(response.headers.get("location") ?? "");
  requestNonce = authorization.searchParams.get("nonce") ?? "";
  requestVerifier = database.select().from(oidcLoginRequests).get()?.codeVerifier ?? "";
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const callback = `${origin}/api/auth/callback?${new URLSearchParams({ code: "test-code", state: authorization.searchParams.get("state") ?? "" })}`;
  return { response, authorization, cookie, callback };
}

describe("browser OIDC authorization code flow", () => {
  it("uses PKCE/state/nonce and a private cookie, then creates a session for the pinned owner", async () => {
    const { response, authorization, cookie, callback } = await begin("/board?view=waiting");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("scope")).toBe("openid profile email");
    expect(authorization.searchParams.get("state")).toBeTruthy();
    expect(requestNonce).toBeTruthy();
    expect(response.headers.get("set-cookie")).toMatch(
      /HttpOnly; SameSite=Lax; Max-Age=600; Secure/,
    );
    const result = await oidcCallback(new Request(callback, { headers: { cookie } }), database);
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("/onboarding");
    const session =
      result.headers
        .getSetCookie()
        .find((value) => value.startsWith("workspace_session="))
        ?.split(";")[0]
        ?.split("=")[1] ?? "";
    expect(getSession(session, database)?.email).toBe("owner@example.com");
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0]?.get("code_verifier")).toBe(requestVerifier);
    expect(tokenRequests[0]?.get("client_secret")).toBe("test-client-secret");
    expect(tokenRequests[0]?.get("redirect_uri")).toBe(`${origin}/api/auth/callback`);
    expect(database.select().from(oidcLoginRequests).all()).toHaveLength(0);
    expect(
      (await oidcCallback(new Request(callback, { headers: { cookie } }), database)).status,
    ).toBe(401);
  });
  it("preserves existing owner data and returns only to safe local routes", async () => {
    const previous = signInWithOidc(
      { issuer, subject: "owner-subject", email: "existing@example.com", name: "Existing" },
      database,
    );
    completeOnboarding(previous.sessionToken, { name: "Existing" }, database);
    const flow = await begin("https://evil.example/steal");
    const response = await oidcCallback(
      new Request(flow.callback, {
        headers: { cookie: `${flow.cookie}; workspace_session=${previous.sessionToken}` },
      }),
      database,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(getSession(previous.sessionToken, database)).toBeNull();
    expect(database.select().from(workspaceOwner).get()?.email).toBe("existing@example.com");
    expect(database.select().from(workspaceOwner).get()?.name).toBe("Existing");
  });
  it.each(["missing-cookie", "wrong-state", "expired"])(
    "rejects %s before exchanging a code",
    async (failure) => {
      const flow = await begin();
      let cookie = flow.cookie;
      let callback = flow.callback;
      if (failure === "missing-cookie") cookie = "";
      if (failure === "wrong-state") callback = callback.replace(/state=[^&]+/, "state=wrong");
      if (failure === "expired")
        database
          .update(oidcLoginRequests)
          .set({ expiresAt: Date.now() - 1 })
          .run();
      expect(
        (await oidcCallback(new Request(callback, { headers: { cookie } }), database)).status,
      ).toBe(401);
      expect(tokenRequests).toHaveLength(0);
      expect(database.select().from(authSessions).all()).toHaveLength(0);
    },
  );
  it.each([
    ["issuer", { iss: "https://evil.example" }],
    ["audience", { aud: "another-client" }],
    ["nonce", { nonce: "wrong" }],
    ["expiry", { exp: 1 }],
    ["subject", { sub: "another-user" }],
  ])("rejects a wrong %s", async (_name, claims) => {
    overrides = claims as Record<string, unknown>;
    const flow = await begin();
    const response = await oidcCallback(
      new Request(flow.callback, { headers: { cookie: flow.cookie } }),
      database,
    );
    expect([401, 403]).toContain(response.status);
    expect(database.select().from(authSessions).all()).toHaveLength(0);
    expect(database.select().from(workspaceOwner).all()).toHaveLength(0);
  });
  it("rejects an ID token signed by an untrusted key", async () => {
    badSignature = true;
    const flow = await begin();
    expect(
      (
        await oidcCallback(
          new Request(flow.callback, { headers: { cookie: flow.cookie } }),
          database,
        )
      ).status,
    ).toBe(401);
    expect(database.select().from(authSessions).all()).toHaveLength(0);
  });
});
