import { ArrowLeft, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { WorkspaceNavigation } from '#/components/workspace-navigation'
import { type Article, articles } from './mock-articles'
import './inbox.css'

export function InboxPage() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(
    articles[0]?.id,
  )
  const [readingMobile, setReadingMobile] = useState(false)
  const visible = articles.filter((article) =>
    `${article.title} ${article.summary} ${article.source}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const selected =
    visible.find((article) => article.id === selectedId) ?? visible[0]

  return (
    <TooltipProvider delay={500}>
      <SidebarProvider className="inbox-workspace" data-reading={readingMobile}>
        <Sidebar collapsible="none" className="inbox-sidebar">
          <WorkspaceNavigation />
          <Sidebar collapsible="none" className="inbox-list-panel">
            <SidebarHeader className="gap-4 border-b p-5">
              <h1 className="text-base font-semibold">Reader</h1>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-2 size-4 text-muted-foreground"
                />
                <Input
                  aria-label="Search articles"
                  placeholder="Search"
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </SidebarHeader>
            <SidebarContent className="gap-0" aria-label="Articles">
              {visible.map((article) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  selected={selected?.id === article.id}
                  onSelect={() => {
                    setSelectedId(article.id)
                    setReadingMobile(true)
                  }}
                />
              ))}
              {visible.length === 0 && (
                <div className="inbox-no-results">
                  <p>No articles found</p>
                  <Button variant="outline" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                </div>
              )}
            </SidebarContent>
          </Sidebar>
        </Sidebar>
        <SidebarInset className="inbox-reader">
          <header className="inbox-reader-toolbar">
            <Button
              variant="ghost"
              size="icon"
              className="inbox-back"
              aria-label="Back to articles"
              onClick={() => setReadingMobile(false)}
            >
              <ArrowLeft />
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected?.source}
            </span>
          </header>
          <section
            className="inbox-reader-scroll"
            key={selected?.id}
            aria-label="Article content"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The independently scrolling reader must be keyboard-scrollable.
            tabIndex={0}
          >
            {selected && <ArticleReader article={selected} />}
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function ArticleRow({
  article,
  selected,
  onSelect,
}: {
  article: Article
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className="inbox-article-row"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <span className="inbox-row-meta">
        <span className="truncate">{article.source}</span>
        <time className="ml-auto shrink-0">{article.date}</time>
      </span>
      <span className="inbox-row-title">{article.title}</span>
      <span className="inbox-row-summary">{article.summary}</span>
    </button>
  )
}

function ArticleReader({ article }: { article: Article }) {
  return (
    <article className="inbox-article" aria-label={article.title}>
      <h2 className="inbox-article-title">{article.title}</h2>
      <p className="inbox-byline text-xs text-muted-foreground">
        {article.author} · {article.date}
      </p>
      <div className="inbox-article-body">
        {article.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  )
}
