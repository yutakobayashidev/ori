import { createRemoteJWKSet, jwtVerify } from "jose";

const scope = "ori:mcp";
let keys: { issuer: string; resolve: ReturnType<typeof createRemoteJWKSet> } | undefined;

function configuration() {
  const issuer = process.env.WORKSPACE_OIDC_ISSUER;
  const subject = process.env.WORKSPACE_OIDC_OWNER_SUBJECT;
  const origin = process.env.TWITTER_LITE_ORIGIN;
  if (!issuer || !subject || !origin) throw new Error("Configure OIDC before using MCP.");
  const resource = process.env.WORKSPACE_MCP_RESOURCE || new URL("/mcp", origin).href;
  for (const value of [issuer, resource]) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("OIDC issuer and MCP resource must be HTTPS URLs.");
  }
  return { issuer, subject, resource };
}

export function protectedResourceMetadata() {
  try {
    const { issuer, resource } = configuration();
    return Response.json(
      {
        resource,
        authorization_servers: [issuer],
        bearer_methods_supported: ["header"],
        scopes_supported: [scope],
        resource_name: "ori",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return new Response("MCP authorization is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function authorizeMcpRequest(request: Request): Promise<Response | null> {
  let config: ReturnType<typeof configuration>;
  try {
    config = configuration();
  } catch {
    return new Response("MCP authorization is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const metadata = new URL("/.well-known/oauth-protected-resource/mcp", config.resource).href;
  const challenge = (status: number, error?: string) =>
    new Response(null, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="${scope}"${error ? `, error="${error}"` : ""}`,
      },
    });
  const authorization = request.headers.get("authorization");
  if (!authorization) return challenge(401);
  const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
  if (!token) return challenge(401, "invalid_token");
  try {
    if (!keys || keys.issuer !== config.issuer) {
      keys = {
        issuer: config.issuer,
        resolve: createRemoteJWKSet(
          new URL(`${config.issuer.replace(/\/$/, "")}/.well-known/jwks.json`),
        ),
      };
    }
    const { payload } = await jwtVerify(token, keys.resolve, {
      issuer: config.issuer,
      audience: config.resource,
      typ: "at+jwt",
      algorithms: ["RS256", "ES256", "EdDSA"],
      requiredClaims: ["sub", "exp", "iat", "client_id", "jti"],
    });
    if (payload.sub !== config.subject)
      return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
    if (typeof payload.scope !== "string" || !payload.scope.split(" ").includes(scope))
      return challenge(403, "insufficient_scope");
    return null;
  } catch {
    return challenge(401, "invalid_token");
  }
}
