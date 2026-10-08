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
  resolveLink,
}: {
  text: string;
  isAnimating?: boolean;
  onNavigateCitation?: (url: string) => boolean;
  resolveLink?: (url: string) => string | undefined;
}) {
  return (
    <div
      data-testid="research-markdown"
      className="min-w-0 wrap-anywhere motion-reduce:[&_[data-sd-animate]]:animate-none motion-reduce:[&_[data-sd-animate-marker]::marker]:animate-none"
    >
      <Streamdown
        mode={isAnimating ? "streaming" : "static"}
        isAnimating={isAnimating}
        animated
        controls={false}
        rehypePlugins={[]}
        urlTransform={(url) => safeUrl(resolveLink ? (resolveLink(url) ?? "") : url)}
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p className="mt-1.5 mb-0 whitespace-normal">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6">{children}</ol>,
          li: ({ children }) => <li className="not-first:mt-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          th: ({ children }) => <th className="border p-1.5 text-left">{children}</th>,
          td: ({ children }) => <td className="border p-1.5 text-left">{children}</td>,
          strong: ({ children }) => <strong>{children}</strong>,
          pre: ({ children }) => (
            <pre className="max-w-full overflow-x-auto bg-muted p-3 text-research-label whitespace-pre">
              {children}
            </pre>
          ),
          code: ({ children, className }) => (
            <code className={`wrap-anywhere ${className ?? ""}`}>{children}</code>
          ),
          h1: ({ children }) => (
            <h3 className="mt-3.5 mb-1.5 text-research-body font-semibold">{children}</h3>
          ),
          h2: ({ children }) => (
            <h4 className="mt-3.5 mb-1.5 text-research-body font-semibold">{children}</h4>
          ),
          h3: ({ children }) => (
            <h5 className="mt-3.5 mb-1.5 text-research-body font-semibold">{children}</h5>
          ),
          h4: ({ children }) => (
            <h6 className="mt-3.5 mb-1.5 text-research-body font-semibold">{children}</h6>
          ),
          h5: ({ children }) => (
            <h6 className="mt-3.5 mb-1.5 text-research-body font-semibold">{children}</h6>
          ),
          h6: ({ children }) => (
            <h6 className="mt-3.5 mb-1.5 text-research-body font-semibold">{children}</h6>
          ),
          a: ({ href, children, title }) =>
            href ? (
              <a
                className="text-primary underline underline-offset-2"
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
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) =>
            typeof src === "string" && src ? (
              <a
                className="text-primary underline underline-offset-2"
                href={src}
                target="_blank"
                rel="noopener noreferrer"
              >
                {alt || "Open image"}
              </a>
            ) : (
              <span>{alt || "Image"}</span>
            ),
          table: ({ children }) => (
            <section
              data-testid="research-markdown-table"
              className="my-3 max-w-full overflow-x-auto"
              aria-label="Response table"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll wide tables inside the narrow chat pane.
              tabIndex={0}
            >
              <table className="w-full border-collapse text-research-label">{children}</table>
            </section>
          ),
        }}
      >
        {text}
      </Streamdown>
    </div>
  );
}
