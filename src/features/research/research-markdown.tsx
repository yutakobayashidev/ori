import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import remarkGfm from "remark-gfm";

function safeUrl(value: string) {
  try {
    const { protocol } = new URL(value, "https://workspace.invalid");
    return ["https:", "http:", "mailto:"].includes(protocol) ? value : "";
  } catch {
    return "";
  }
}

export function ResearchMarkdown({
  text,
  isAnimating = false,
  onNavigateCitation,
}: {
  text: string;
  isAnimating?: boolean;
  onNavigateCitation?: (url: string) => boolean;
}) {
  return (
    <div className="research-markdown">
      <Streamdown
        mode={isAnimating ? "streaming" : "static"}
        isAnimating={isAnimating}
        animated
        controls={false}
        rehypePlugins={[]}
        urlTransform={safeUrl}
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          strong: ({ children }) => <strong>{children}</strong>,
          pre: ({ children }) => <pre>{children}</pre>,
          code: ({ children, className }) => <code className={className}>{children}</code>,
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
                  event.preventDefault();
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === "string" && src ? (
              <a href={src} target="_blank" rel="noopener noreferrer">
                {alt || "Open image"}
              </a>
            ) : (
              <span>{alt || "Image"}</span>
            ),
          table: ({ children }) => (
            <section
              className="research-markdown-table"
              aria-label="Response table"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll wide tables inside the narrow chat pane.
              tabIndex={0}
            >
              <table>{children}</table>
            </section>
          ),
        }}
      >
        {text}
      </Streamdown>
    </div>
  );
}
