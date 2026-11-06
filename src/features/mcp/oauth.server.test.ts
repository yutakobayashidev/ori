// @vitest-environment node
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { authorizeMcpRequest, protectedResourceMetadata } from "./oauth.server";

const state = vi.hoisted(() => ({ resolve: undefined as unknown }));
vi.mock("jose", async (original) => ({
  ...(await original<typeof import("jose")>()),
  createRemoteJWKSet: () => state.resolve,
}));
let signingKey: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  signingKey = pair.privateKey;
  state.resolve = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test" }],
  });
});
beforeEach(() => {
  vi.stubEnv("WORKSPACE_OIDC_ISSUER", "https://id.example.com");
  vi.stubEnv("WORKSPACE_OIDC_OWNER_SUBJECT", "owner");
  vi.stubEnv("TWITTER_LITE_ORIGIN", "https://ori.example.com");
  vi.stubEnv("WORKSPACE_MCP_RESOURCE", "");
});
afterEach(() => vi.unstubAllEnvs());
async function token(claims: Record<string, unknown> = {}, typ = "at+jwt", key = signingKey) {
  return new SignJWT({
    iss: "https://id.example.com",
    sub: "owner",
    aud: "https://ori.example.com/mcp",
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    jti: "unique",
    client_id: "https://client.example.com/metadata.json",
    scope: "ori:mcp",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "test", typ })
    .sign(key);
}
function request(value?: string) {
  return new Request("https://ori.example.com/mcp", {
    headers: value ? { Authorization: `Bearer ${value}` } : {},
  });
}
it("advertises the canonical resource and challenges anonymous callers", async () => {
  expect(await protectedResourceMetadata().json()).toMatchObject({
    resource: "https://ori.example.com/mcp",
    authorization_servers: ["https://id.example.com"],
    scopes_supported: ["ori:mcp"],
    bearer_methods_supported: ["header"],
  });
  const response = await authorizeMcpRequest(request());
  expect(response?.status).toBe(401);
  expect(response?.headers.get("www-authenticate")).toContain(
    'resource_metadata="https://ori.example.com/.well-known/oauth-protected-resource/mcp"',
  );
});
it("accepts a signed access token for this owner, resource and scope", async () => {
  expect(await authorizeMcpRequest(request(await token()))).toBeNull();
});
it.each([
  { iss: "https://other.example.com" },
  { aud: "https://other.example.com" },
  { exp: 1 },
  { exp: undefined },
  { sub: undefined },
  { client_id: undefined },
])("rejects invalid claims %j", async (claims) => {
  expect((await authorizeMcpRequest(request(await token(claims))))?.status).toBe(401);
});
it("rejects ID tokens and tokens signed by a different key", async () => {
  expect((await authorizeMcpRequest(request(await token({}, "JWT"))))?.status).toBe(401);
  const other = await generateKeyPair("ES256");
  expect(
    (await authorizeMcpRequest(request(await token({}, "at+jwt", other.privateKey))))?.status,
  ).toBe(401);
});
it("forbids another user and requests the missing API permission", async () => {
  expect((await authorizeMcpRequest(request(await token({ sub: "stranger" }))))?.status).toBe(403);
  const response = await authorizeMcpRequest(request(await token({ scope: "openid profile" })));
  expect(response?.status).toBe(403);
  expect(response?.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
});
it("fails closed if authorization is not configured", async () => {
  vi.stubEnv("WORKSPACE_OIDC_OWNER_SUBJECT", "");
  expect((await authorizeMcpRequest(request()))?.status).toBe(503);
  expect(protectedResourceMetadata().status).toBe(503);
});
