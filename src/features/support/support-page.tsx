import { ArrowLeft, MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
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
import { type Status, useWorkspaceState } from "#/features/workspace/workspace-state";
import { ConversationDetail } from "./conversation-detail";
import { conversations } from "./mock-conversations";

const views = [
  { id: "now", label: "Inbox" },
  { id: "all", label: "All" },
  { id: "later", label: "Set aside" },
  { id: "waiting", label: "Awaiting reply" },
  { id: "done", label: "Archive" },
] as const;

export function SupportPage() {
  const [search, updateSearch] = useUrlState();
  const view = search.view ?? "now";
  const query = search.q ?? "";
  const searchState = useSearchInput("conversation");
  const { statuses, setStatuses, outcomes, setOutcomes } = useWorkspaceState();
  const selectedId = search.conversation;
  const [notice, setNotice] = useState("");
  const visible = conversations.filter((item) => {
    const status = statuses[item.id] ?? "now";
    return (
      (view !== "now" || item.replyRequired || statuses[item.id] === "now") &&
      (view === "all" ||
        (view === "done" ? status === "sent" || status === "dismissed" : status === view)) &&
      `${item.name} ${item.subject} ${item.channels.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  function resolve(id: string, status: Exclude<Status, "now">, note?: string) {
    setStatuses((current) => ({ ...current, [id]: status }));
    if (note) setOutcomes((current) => ({ ...current, [id]: note }));
    setNotice(
      status === "sent"
        ? "Reply preview recorded. No message sent."
        : status === "later"
          ? "Set aside for later"
          : status === "waiting"
            ? "Awaiting their reply"
            : "Archived without replying",
    );
    updateSearch({ conversation: undefined });
  }
  return (
    <TooltipProvider>
      <SidebarProvider
        data-testid="support-workspace"
        className="group/support h-dvh min-h-0 overflow-hidden"
        data-reading={!!selectedId}
      >
        <Sidebar
          collapsible="none"
          className="w-[370px] shrink-0 flex-row border-r border-border max-md:w-full max-md:group-data-[reading=true]/support:hidden"
        >
          <WorkspaceNavigation />
          <Sidebar collapsible="none" className="w-auto min-w-0 flex-1">
            <SidebarHeader className="p-5 gap-4">
              <div className="flex items-center gap-px-10">
                <h1 className="text-ui-19 font-semibold tracking-title">Messages</h1>
                <span className="text-ui-12 text-muted-foreground">{visible.length}</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search messages"
                  placeholder="Search people or messages"
                  className="pl-9"
                  value={searchState.value}
                  onChange={searchState.onChange}
                  onCompositionStart={searchState.onCompositionStart}
                  onCompositionEnd={searchState.onCompositionEnd}
                />
              </div>
              <nav className="flex flex-wrap gap-px-4" aria-label="Conversation filters">
                {views.map((tab) => (
                  <button
                    className="cursor-pointer rounded-ui-6 px-px-9 py-px-6 text-ui-11 whitespace-nowrap text-muted-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
                    type="button"
                    key={tab.id}
                    aria-pressed={view === tab.id}
                    onClick={() => {
                      updateSearch({
                        view: tab.id === "now" ? undefined : tab.id,
                        conversation: undefined,
                      });
                      setNotice("");
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </SidebarHeader>
            <SidebarContent className="gap-0">
              {visible.map((item) => (
                <button
                  type="button"
                  data-testid="support-row"
                  aria-label={`${item.name}: ${item.subject}`}
                  className="mx-px-8 my-px-2 flex cursor-pointer gap-px-12 rounded-ui-10 px-px-14 py-px-12 text-left leading-normal hover:bg-sidebar-accent aria-current:bg-sidebar-accent active:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
                  aria-current={selected?.id === item.id ? "true" : undefined}
                  key={item.id}
                  onClick={() => updateSearch({ conversation: item.id })}
                >
                  <Avatar aria-hidden="true">
                    <AvatarFallback>
                      {item.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col gap-px-3">
                    <span className="flex items-center justify-between gap-px-8">
                      <strong className="text-ui-12 font-book">{item.name}</strong>
                      <span className="text-ui-10 whitespace-nowrap text-muted-foreground">
                        {item.updatedAt}
                      </span>
                    </span>
                    <span className="truncate text-ui-12 text-muted-foreground">
                      {item.subject}
                    </span>
                    <span className="text-ui-10 text-muted-foreground">
                      {item.channels.join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  {query ? "No results found" : "Nothing here. You’re all caught up."}
                </p>
              )}
            </SidebarContent>
            <div className="px-px-20 py-px-16 text-ui-11 text-muted-foreground" role="status">
              {notice || "Sample conversations"}
            </div>
          </Sidebar>
        </Sidebar>
        <SidebarInset className="h-full min-w-0 overflow-hidden max-md:hidden max-md:group-data-[reading=true]/support:flex">
          <header
            data-testid="support-toolbar"
            className="flex min-h-[64px] items-center gap-px-10 border-b border-border px-px-20 py-px-12 max-md:px-px-12"
          >
            <Button
              variant="ghost"
              size="icon"
              className="hidden max-md:inline-flex"
              aria-label="Back to messages"
              onClick={() => updateSearch({ conversation: undefined })}
            >
              <ArrowLeft />
            </Button>
            {selected && (
              <>
                <Avatar aria-hidden="true">
                  <AvatarFallback>
                    {selected.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <strong className="text-ui-13 font-book">{selected.name}</strong>
                  <p className="mt-px-2 text-ui-10 text-muted-foreground">
                    {selected.channels.join(" · ")}
                  </p>
                </div>
              </>
            )}
            {selected && view !== "now" && (
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatuses((current) => ({ ...current, [selected.id]: "now" }));
                    updateSearch({ view: undefined, conversation: selected.id });
                  }}
                >
                  Move to Inbox
                </Button>
              </div>
            )}
          </header>
          <section
            className="@container min-h-0 flex-1 overflow-y-auto wrap-anywhere"
            aria-label="Message details"
          >
            {conversations.map((conversation) => (
              <div key={conversation.id} hidden={selected?.id !== conversation.id}>
                <ConversationDetail
                  conversation={conversation}
                  onResolve={(status, note) => resolve(conversation.id, status, note)}
                />
                {outcomes[conversation.id] && (
                  <div
                    data-testid="support-outcome"
                    className="border-t border-border p-px-24 text-ui-12"
                  >
                    <h2>Reply preview</h2>
                    <p className="mt-px-8 whitespace-pre-wrap text-muted-foreground">
                      {outcomes[conversation.id]}
                    </p>
                  </div>
                )}
              </div>
            ))}
            {!selected && (
              <div className="grid justify-items-center gap-px-12 px-px-24 py-px-64 text-center text-ui-13 text-muted-foreground">
                <MessageSquare aria-hidden="true" />
                <p>Select a conversation</p>
              </div>
            )}
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
