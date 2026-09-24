/** Twitter aliases identify the same post; other platforms use their canonical URL. */
export function citationUrlKey(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null
    if (/^(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)$/.test(url.hostname)) {
      const status = /^\/(?:[^/]+\/status|i\/web\/status)\/(\d+)(?:\/|$)/.exec(
        url.pathname,
      )
      if (status) return `twitter:${status[1]}`
    }
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}
