import sanitizeHtml from "sanitize-html";

/** Beeper's text is rich text. Return display text, never markup for HTML rendering. */
export function beeperMessageText(text: string): string {
  // Leave ordinary messages (including angle brackets in code) byte-for-byte intact.
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  if (
    !/<(?:br\s*\/?|\/?(?:p|div|span|a|strong|em|b|i|u|s|pre|code|blockquote|ul|ol|li|h[1-6]|script|style|img))(?:\s[^>]*|)>/i.test(
      prose,
    )
  )
    return text;
  const html = sanitizeHtml(text, {
    allowedTags: [
      "p",
      "div",
      "br",
      "pre",
      "blockquote",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "a",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
  });
  const withLinks = html.replace(
    /<a href="([^"]*)">([\s\S]*?)<\/a>/g,
    (_, href: string, label: string) => (label === href ? label : `${label} (${href})`),
  );
  const escaped = sanitizeHtml(
    withLinks.replace(/<br\s*\/?>|<\/(?:p|div|pre|blockquote|li|h[1-6])>/g, "\n"),
    { allowedTags: [], allowedAttributes: {} },
  );
  // The parser already decoded named/numeric entities; these are its output escapes.
  const decoded: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"' };
  return escaped
    .replace(/&(amp|lt|gt|quot);/g, (entity, name: string) => decoded[name] ?? entity)
    .replace(/\n$/, "");
}
