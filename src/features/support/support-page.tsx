import { ArrowLeft, MessageSquare, Search } from "lucide-react";
import { useState } from "react";
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
      <SidebarProvider className="support-workspace" data-reading={!!selectedId}>
        <Sidebar collapsible="none" className="support-sidebar">
          <WorkspaceNavigation />
          <Sidebar collapsible="none" className="support-list">
            <SidebarHeader className="p-5 gap-4">
              <div className="support-list-title">
                <h1>Messages</h1>
                <span>{visible.length}</span>
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
              <nav className="support-filters" aria-label="Conversation filters">
                {views.map((tab) => (
                  <button
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
                  className="support-row"
                  aria-current={selected?.id === item.id ? "true" : undefined}
                  key={item.id}
                  onClick={() => updateSearch({ conversation: item.id })}
                >
                  <span className="support-avatar" aria-hidden="true">
                    {item.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <span className="support-row-content">
                    <span className="support-row-heading">
                      <strong>{item.name}</strong>
                      <span>{item.updatedAt}</span>
                    </span>
                    <span className="support-row-preview">{item.subject}</span>
                    <span className="support-row-channel">{item.channels.join(" · ")}</span>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  {query ? "No results found" : "Nothing here. You’re all caught up."}
                </p>
              )}
            </SidebarContent>
            <div className="support-list-footer" role="status">
              {notice || "Sample conversations"}
            </div>
          </Sidebar>
        </Sidebar>
        <SidebarInset className="support-main">
          <header className="support-toolbar">
            <Button
              variant="ghost"
              size="icon"
              className="support-back"
              aria-label="Back to messages"
              onClick={() => updateSearch({ conversation: undefined })}
            >
              <ArrowLeft />
            </Button>
            {selected && (
              <>
                <span className="support-avatar support-avatar-small" aria-hidden="true">
                  {selected.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <div>
                  <strong>{selected.name}</strong>
                  <p>{selected.channels.join(" · ")}</p>
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
          <section className="support-detail" aria-label="Message details">
            {conversations.map((conversation) => (
              <div key={conversation.id} hidden={selected?.id !== conversation.id}>
                <ConversationDetail
                  conversation={conversation}
                  onResolve={(status, note) => resolve(conversation.id, status, note)}
                />
                {outcomes[conversation.id] && (
                  <div className="support-outcome">
                    <h2>Reply preview</h2>
                    <p>{outcomes[conversation.id]}</p>
                  </div>
                )}
              </div>
            ))}
            {!selected && (
              <div className="support-empty">
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
