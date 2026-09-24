import type { ReactNode } from 'react'

const URL = /(https?:\/\/[^\s]+)/g
const HTML_ENTITY = /&(?:#(\d+)|#x([\da-f]+)|amp|apos|gt|lt|quot);/gi
const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
}
function decodeHtmlEntities(text: string): string {
  return text.replace(HTML_ENTITY, (entity, decimal, hexadecimal) => {
    if (!decimal && !hexadecimal) {
      return NAMED_ENTITIES[entity.toLowerCase()] ?? entity
    }

    const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16)
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity
  })
}

function linkedText(text: string): ReactNode[] {
  const decoded = decodeHtmlEntities(text)
  const parts: ReactNode[] = []
  let cursor = 0
  for (const match of decoded.matchAll(URL)) {
    const href = match[0]
    const start = match.index
    if (start > cursor) parts.push(decoded.slice(cursor, start))
    parts.push(
      <a
        href={href}
        key={`link-${start}`}
        rel="noreferrer noopener"
        target="_blank"
      >
        {href}
      </a>,
    )
    cursor = start + href.length
  }
  if (cursor < decoded.length) parts.push(decoded.slice(cursor))
  return parts
}

export function PostText({ text }: { text: string }) {
  return <>{linkedText(text)}</>
}
