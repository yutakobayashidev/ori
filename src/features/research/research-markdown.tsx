import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function ResearchMarkdown({
  text,
  onNavigateCitation,
}: {
  text: string
  onNavigateCitation?: (url: string) => boolean
}) {
  return (
    <div className="research-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h4>{children}</h4>,
          h3: ({ children }) => <h5>{children}</h5>,
          h4: ({ children }) => <h6>{children}</h6>,
          h5: ({ children }) => <h6>{children}</h6>,
          h6: ({ children }) => <h6>{children}</h6>,
          a: ({ href, children, title }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (
                  href &&
                  event.button === 0 &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  onNavigateCitation?.(href)
                )
                  event.preventDefault()
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === 'string' && src ? (
              <a href={src} target="_blank" rel="noopener noreferrer">
                {alt || 'Open image'}
              </a>
            ) : (
              <span>{alt || 'Image'}</span>
            ),
          table: ({ children }) => (
            <section
              className="research-markdown-table"
              aria-label="Response table"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll wide tables inside the narrow chat pane.
              tabIndex={0}
            >
              <table>{children}</table>
            </section>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}
