import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

export function mastodonOrigins(): string[] {
  return (process.env.TWITTER_LITE_MASTODON_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value)
      if (
        url.protocol !== 'https:' ||
        url.origin !== value ||
        url.port ||
        isIP(url.hostname)
      ) {
        throw new Error(
          'Mastodon origins must be HTTPS host origins without paths or custom ports.',
        )
      }
      return url.origin
    })
}

export function requireMastodonOrigin(origin: string): string {
  if (!mastodonOrigins().includes(origin))
    throw new Error('This Mastodon instance is not configured.')
  return origin
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    return (
      /^[23]/.test(normalized) &&
      !/^2001:(0*:|db8:)/.test(normalized) &&
      !normalized.startsWith('2002:')
    )
  }
  return false
}

/** Fixed approved HTTPS origins, pinned public DNS results, no redirects. */
export async function safeMastodonRequest(
  url: URL,
  init: RequestInit = {},
): Promise<Response> {
  requireMastodonOrigin(url.origin)
  if (url.username || url.password) throw new Error('Invalid Mastodon URL.')
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  const address = addresses[0]
  if (!address || addresses.some((value) => !isPublicAddress(value.address))) {
    throw new Error('Mastodon must resolve to public network addresses.')
  }
  const headers = Object.fromEntries(new Headers(init.headers))
  const body =
    init.body instanceof URLSearchParams ? init.body.toString() : init.body
  if (body !== undefined && body !== null && typeof body !== 'string')
    throw new Error('Unsupported Mastodon request body.')
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: init.method ?? 'GET',
        headers,
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (incoming) => {
        const chunks: Buffer[] = []
        let bytes = 0
        incoming.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > 5 * 1024 * 1024)
            incoming.destroy(new Error('Mastodon response is too large.'))
          else chunks.push(chunk)
        })
        incoming.on('error', () =>
          reject(new Error('Mastodon response failed.')),
        )
        incoming.on('end', () => {
          const status = incoming.statusCode ?? 502
          if (status >= 300 && status < 400)
            return reject(new Error('Mastodon redirects are not allowed.'))
          const responseHeaders = new Headers()
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              responseHeaders.set(
                name,
                Array.isArray(value) ? value.join(', ') : value,
              )
          }
          resolve(
            new Response(status === 204 ? null : Buffer.concat(chunks), {
              status,
              headers: responseHeaders,
            }),
          )
        })
      },
    )
    const timeout = setTimeout(() => {
      outgoing.destroy(new Error('Mastodon request timed out.'))
    }, 20_000)
    outgoing.on('close', () => clearTimeout(timeout))
    outgoing.on('error', () => reject(new Error('Mastodon request failed.')))
    outgoing.end(body)
  })
}
