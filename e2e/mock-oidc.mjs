// Isolated test issuer. Signing and TLS private keys exist only in this process.
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const issuer = "https://127.0.0.1:6913";
const resource = "https://ori.example.test/mcp";
const clientId = "ori";
const clientSecret = "isolated-e2e-oidc-client-not-for-production";
const callback = "http://127.0.0.1:4173/api/auth/callback";
const { privateKey: tlsKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = tlsKey.export({ type: "pkcs8", format: "pem" });
// A shell pipe gives OpenSSL a reopenable stdin (Node uses a socket pair).
const cert = execFileSync(
  "sh",
  [
    "-c",
    "cat | openssl req -new -x509 -key /dev/stdin -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 -addext basicConstraints=critical,CA:TRUE",
  ],
  { input: key, stdio: ["pipe", "pipe", "pipe"] },
);
if (!process.env.TWITTER_LITE_E2E_OIDC_CERT)
  throw new Error("Public test certificate path required.");
writeFileSync(process.env.TWITTER_LITE_E2E_OIDC_CERT, cert);
const signing = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(signing.publicKey)), kid: "e2e", alg: "ES256", use: "sig" };
const codes = new Map();
const subjects = { owner: "e2e-owner", stranger: "e2e-stranger" };
async function jwt(claims, typ = "JWT") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "e2e", typ })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(signing.privateKey);
}
async function accessToken(claims = {}) {
  const { typ = "at+jwt", ...overrides } = claims;
  return jwt(
    {
      sub: subjects.owner,
      aud: resource,
      scope: "ori:mcp",
      client_id: "https://client.example.test/metadata.json",
      ...overrides,
    },
    typ,
  );
}
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}
createServer({ key, cert }, async (req, res) => {
  const url = new URL(req.url, issuer);
  function json(value, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  }
  if (url.pathname === "/.well-known/openid-configuration")
    return json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "profile", "email", "ori:mcp"],
    });
  if (url.pathname === "/.well-known/jwks.json") return json({ keys: [jwk] });
  if (url.pathname === "/test/access-token" && req.method === "POST")
    return json({ access_token: await accessToken(JSON.parse((await body(req)) || "{}")) });
  if (url.pathname === "/authorize") {
    const params = url.searchParams;
    if (
      params.get("client_id") !== clientId ||
      params.get("redirect_uri") !== callback ||
      params.get("response_type") !== "code" ||
      params.get("code_challenge_method") !== "S256" ||
      !params.get("state") ||
      !params.get("nonce") ||
      !params.get("code_challenge")
    )
      return json({ error: "invalid_request" }, 400);
    const code = randomUUID();
    codes.set(code, Object.fromEntries(params));
    const redirect = new URL(callback);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", params.get("state"));
    redirect.searchParams.set("iss", issuer);
    res.writeHead(302, { Location: redirect.href });
    return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    const params = new URLSearchParams(await body(req));
    const credentials = req.headers.authorization?.startsWith("Basic ")
      ? Buffer.from(req.headers.authorization.slice(6), "base64").toString().split(":")
      : [params.get("client_id"), params.get("client_secret")];
    if (credentials[0] !== clientId || credentials[1] !== clientSecret)
      return json({ error: "invalid_client" }, 401);
    const code = params.get("code");
    const authorization = codes.get(code);
    codes.delete(code);
    if (
      !authorization ||
      params.get("redirect_uri") !== callback ||
      params.get("grant_type") !== "authorization_code" ||
      createHash("sha256")
        .update(params.get("code_verifier") || "")
        .digest("base64url") !== authorization.code_challenge
    )
      return json({ error: "invalid_grant" }, 400);
    const subject = subjects[authorization.login_hint] || subjects.owner;
    return json({
      access_token: await accessToken({ sub: subject }),
      token_type: "Bearer",
      expires_in: 300,
      id_token: await jwt({
        sub: subject,
        aud: clientId,
        nonce: authorization.nonce,
        email: "owner@workspace.invalid",
        email_verified: true,
        name: "Yuta",
        preferred_username: "yuta",
      }),
    });
  }
  json({ error: "not_found" }, 404);
}).listen(6913, "127.0.0.1");
