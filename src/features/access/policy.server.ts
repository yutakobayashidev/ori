type AccessConfig = { origin: string; allowedLogin: string }

export function readAccessConfig(): AccessConfig | null {
  const origin = process.env.TWITTER_LITE_ORIGIN
  const allowedLogin = process.env.TWITTER_LITE_ALLOWED_LOGIN
  if (!origin || !allowedLogin?.trim()) return null
  try {
    const url = new URL(origin)
    const secure = url.protocol === 'https:'
    const local = url.protocol === 'http:' && url.hostname === '127.0.0.1'
    if ((!secure && !local) || url.origin !== origin) return null
    return { origin, allowedLogin }
  } catch {
    return null
  }
}

/** The backend must bind to loopback; only Serve may supply identity headers. */
export function checkAccess(
  request: Request,
  config: AccessConfig | null,
): Response | null {
  if (!config) {
    return new Response('Access configuration is required.', { status: 503 })
  }
  if (request.headers.get('Tailscale-User-Login') !== config.allowedLogin) {
    return new Response('Forbidden', { status: 403 })
  }
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.get('Origin') !== config.origin
  ) {
    return new Response('Forbidden', { status: 403 })
  }
  return null
}
