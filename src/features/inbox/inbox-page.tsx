import { ArrowLeft, Search } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { useSearchInput } from "#/features/navigation/use-search-input";
import { useUrlState } from "#/features/navigation/use-url-state";
import { type Article, articles } from "./mock-articles";

export function InboxPage() {
  const [search, updateSearch] = useUrlState();
  const query = search.q ?? "";
  const selectedId = search.article;
  const readingMobile = !!selectedId;
  const { clear: clearSearch, ...searchInput } = useSearchInput("article");
  const visible = articles.filter((article) =>
    `${article.title} ${article.summary} ${article.source}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = visible.find((article) => article.id === selectedId) ?? visible[0];

  return (
    <TooltipProvider delay={500}>
      <SidebarProvider
        data-testid="inbox-workspace"
        className="group/inbox h-dvh min-h-0 overflow-hidden"
        data-reading={readingMobile}
      >
        <Sidebar
          collapsible="none"
          data-testid="inbox-sidebar"
          className="w-[420px] shrink-0 flex-row border-r border-border min-[768px]:max-[1100px]:w-[340px] max-md:w-full max-md:border-r-0 max-md:group-data-[reading=true]/inbox:hidden"
        >
          <WorkspaceNavigation />
          <Sidebar
            collapsible="none"
            data-testid="inbox-list-panel"
            className="w-auto min-w-0 flex-1"
          >
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
                  {...searchInput}
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
                    updateSearch({ article: article.id });
                  }}
                />
              ))}
              {visible.length === 0 && (
                <div
                  data-testid="inbox-no-results"
                  className="grid justify-items-start gap-px-12 px-px-20 py-px-32 text-ui-13 leading-relaxed-copy text-muted-foreground"
                >
                  <p>No articles found</p>
                  <Button variant="outline" onClick={clearSearch}>
                    Clear search
                  </Button>
                </div>
              )}
            </SidebarContent>
          </Sidebar>
        </Sidebar>
        <SidebarInset
          data-testid="inbox-reader"
          className="h-full min-w-0 overflow-hidden max-md:hidden max-md:group-data-[reading=true]/inbox:flex"
        >
          <header
            data-testid="inbox-reader-toolbar"
            className="flex min-h-[60px] items-center gap-px-12 border-b border-border px-px-26 py-px-10 max-md:px-px-12"
          >
            <Button
              variant="ghost"
              size="icon"
              data-testid="inbox-back"
              className="hidden max-md:inline-flex"
              aria-label="Back to articles"
              onClick={() => updateSearch({ article: undefined })}
            >
              <ArrowLeft />
            </Button>
            <span className="text-xs text-muted-foreground">{selected?.source}</span>
          </header>
          <section
            data-testid="inbox-reader-scroll"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            key={selected?.id}
            aria-label="Article content"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The independently scrolling reader must be keyboard-scrollable.
            tabIndex={0}
          >
            {selected && <ArticleReader article={selected} />}
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function ArticleRow({
  article,
  selected,
  onSelect,
}: {
  article: Article;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="inbox-article-row"
      className="flex w-full cursor-pointer flex-col items-stretch gap-px-11 border-b border-border px-px-20 py-px-22 text-left hover:bg-sidebar-accent aria-current:bg-muted aria-current:inset-shadow-selection"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <span
        data-testid="inbox-row-meta"
        className="flex min-w-0 items-center gap-px-7 text-ui-11 text-muted-foreground"
      >
        <span className="truncate">{article.source}</span>
        <time className="ml-auto shrink-0">{article.date}</time>
      </span>
      <span
        data-testid="inbox-row-title"
        className="block text-ui-14 leading-chat font-semibold text-pretty"
      >
        {article.title}
      </span>
      <span
        data-testid="inbox-row-summary"
        className="line-clamp-2 text-ui-12 leading-relaxed-copy text-muted-foreground"
      >
        {article.summary}
      </span>
    </button>
  );
}

function ArticleReader({ article }: { article: Article }) {
  return (
    <article
      data-testid="inbox-article"
      className="mx-auto max-w-[800px] px-px-52 pt-px-54 pb-px-40 min-[768px]:max-[1100px]:px-px-28 min-[768px]:max-[1100px]:py-px-36 max-md:px-px-24 max-md:py-px-30"
      aria-label={article.title}
    >
      <h2
        data-testid="inbox-article-title"
        className="m-0 text-reader-title leading-post font-demibold tracking-tight wrap-anywhere text-pretty"
      >
        {article.title}
      </h2>
      <p data-testid="inbox-byline" className="my-px-30 text-xs text-muted-foreground">
        {article.author} · {article.date}
      </p>
      <div
        data-testid="inbox-article-body"
        className="text-ui-15 leading-reader tracking-wide [&_p+p]:mt-px-24"
      >
        {article.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
