import {
  AuthError,
  completeOnboarding,
  createOwner,
  getSession,
  readAuthState,
  SESSION_MAX_AGE_SECONDS,
  signIn,
  signOut,
} from "./auth.server";

const SESSION_COOKIE = "workspace_session";

export function sessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export function authState(request: Request) {
  return { ...readAuthState(), owner: getSession(sessionToken(request)) };
}

function cookie(token: string, clear = false) {
  const secure = process.env.TWITTER_LITE_ORIGIN?.startsWith("https:");
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

export async function authEndpoint(request: Request) {
  const headers = new Headers({
    "cache-control": "no-store",
    vary: "Cookie",
    "content-type": "application/json",
  });
  try {
    if (request.method === "GET") return Response.json(authState(request), { headers });
    if (request.method !== "POST") return new Response(null, { status: 405, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AuthError(400, "Use a JSON request.");
    const body = await request.text();
    if (body.length > 8192) throw new AuthError(413, "Request is too large.");
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid body");
      data = parsed;
    } catch {
      throw new AuthError(400, "Check the form and try again.");
    }
    const text = (key: string) => (typeof data[key] === "string" ? data[key] : "");
    const oldToken = sessionToken(request);
    switch (data.action) {
      case "setup":
      case "login": {
        const result =
          data.action === "setup"
            ? await createOwner({
                email: text("email"),
                password: text("password"),
                name: text("name"),
                setupToken: text("setupToken"),
              })
            : await signIn({ email: text("email"), password: text("password") });
        signOut(oldToken);
        headers.set("set-cookie", cookie(result.sessionToken));
        return Response.json({ needsSetup: false, owner: result.owner }, { headers });
      }
      case "onboard": {
        const owner = completeOnboarding(oldToken ?? "", { name: text("name") });
        return Response.json({ needsSetup: false, owner }, { headers });
      }
      case "logout":
        signOut(oldToken);
        headers.set("set-cookie", cookie("", true));
        return Response.json({ needsSetup: readAuthState().needsSetup, owner: null }, { headers });
      default:
        throw new AuthError(400, "Unknown action.");
    }
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json({ error: error.message }, { status: error.status, headers });
    return Response.json(
      { error: "Unable to complete the request. Please try again." },
      { status: 500, headers },
    );
  }
}
