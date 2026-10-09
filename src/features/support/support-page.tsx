import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
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
import { ActivityFeedback, stateLabels } from "#/features/activities/activity-controls";
import { useActivities } from "#/features/activities/activity-state";
import type { Activity } from "#/features/activities/model";
import { ReplyActivityDetail } from "#/features/activities/reply-activity-detail";
import { useSearchInput } from "#/features/navigation/use-search-input";
import { useUrlState } from "#/features/navigation/use-url-state";

import { loadReplyAvatar } from "#/features/beeper/server-functions";

function ConversationAvatar({ activity, name }: { activity: Activity; name: string }) {
  const { data } = useQuery({
    queryKey: ["reply-avatar", conversationKey(activity)],
    queryFn: () => loadReplyAvatar({ data: { activityId: activity.id } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return (
    <Avatar aria-hidden="true">
      {data?.dataUrl && <AvatarImage src={data.dataUrl} alt="" />}
      <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
    </Avatar>
  );
}

const views = [
  { id: "now", label: "Inbox" },
  { id: "all", label: "All" },
  { id: "later", label: "Set aside" },
  { id: "waiting", label: "Waiting" },
  { id: "done", label: "Archive" },
] as const;
function conversationKey(activity: Activity) {
  if (activity.effective.kind !== "reply") return activity.id;
  const sourceId = activity.effective.reply.sourceId;
  const source = activity.effective.sources.find((source) => source.id === sourceId);
  return source?.kind === "message"
    ? JSON.stringify([source.provider, source.targetId, source.accountId, source.chatId])
    : activity.id;
}
export function SupportPage() {
  const [search, updateSearch] = useUrlState();
  const view = search.view ?? "now";
  const query = (search.q ?? "").toLowerCase();
  const searchState = useSearchInput("activity");
  const { activities, loading } = useActivities();
  const selectedId = search.activity;
  const visible = activities.filter((activity) => {
    const item = activity.effective;
    if (item.kind !== "reply") return false;
    const state = activity.userState;
    const matchesView =
      view === "all" ||
      (view === "now"
        ? state === "available" || state === "inProgress"
        : view === "later"
          ? state === "deferred"
          : view === "waiting"
            ? state === "waiting"
            : state === "completed" || state === "dismissed");
    return (
      matchesView &&
      `${item.reply.recipientName} ${item.title} ${item.nextAction} ${item.reply.context}`
        .toLowerCase()
        .includes(query)
    );
  });
  const groups = new Map<string, Activity[]>();
  for (const activity of visible) {
    const key = conversationKey(activity);
    const group = groups.get(key) ?? [];
    group.push(activity);
    groups.set(key, group);
  }
  const selected = visible.find((activity) => activity.id === selectedId) ?? visible[0];
  const backButton = (
    <Button
      variant="ghost"
      size="icon"
      className="hidden max-md:inline-flex"
      aria-label="Back to messages"
      onClick={() => updateSearch({ activity: undefined })}
    >
      <ArrowLeft />
    </Button>
  );
  const related = selected ? (groups.get(conversationKey(selected)) ?? []) : [];
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
            <SidebarHeader className="gap-4 p-5">
              <div className="flex items-center gap-px-10">
                <h1 className="text-ui-19 font-semibold tracking-title">Messages</h1>
                <span className="text-ui-12 text-muted-foreground">{groups.size}</span>
              </div>
              <div className="relative">
                <Search className="absolute top-2 left-3 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search messages"
                  placeholder="Search people or actions"
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
                    type="button"
                    key={tab.id}
                    className="cursor-pointer rounded-ui-6 px-px-9 py-px-6 text-ui-11 whitespace-nowrap text-muted-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-foreground hover:bg-muted"
                    aria-pressed={view === tab.id}
                    onClick={() =>
                      updateSearch({
                        view: tab.id === "now" ? undefined : tab.id,
                        activity: undefined,
                        conversation: undefined,
                      })
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </SidebarHeader>
            <SidebarContent className="gap-0">
              {[...groups.entries()].map(([key, group]) => {
                const first = group[0];
                if (!first || first.effective.kind !== "reply") return null;
                const item = first.effective;
                return (
                  <button
                    type="button"
                    data-testid="support-row"
                    key={key}
                    aria-label={`${item.reply.recipientName}: ${item.title}`}
                    aria-current={
                      selected && conversationKey(selected) === key ? "true" : undefined
                    }
                    onClick={() => updateSearch({ activity: first.id, conversation: undefined })}
                    className="mx-px-8 my-px-2 flex cursor-pointer gap-px-12 rounded-ui-10 px-px-14 py-px-12 text-left leading-normal hover:bg-sidebar-accent aria-current:bg-sidebar-accent"
                  >
                    <ConversationAvatar activity={first} name={item.reply.recipientName} />
                    <span className="flex min-w-0 flex-1 flex-col gap-px-3">
                      <strong className="text-ui-12 font-book">{item.reply.recipientName}</strong>
                      <span className="truncate text-ui-12 text-muted-foreground">
                        {item.title}
                      </span>
                      <span className="text-ui-10 text-muted-foreground">
                        {group.length > 1
                          ? `${group.length} actions`
                          : stateLabels[first.userState]}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!visible.length && !loading && (
                <p className="p-5 text-sm text-muted-foreground">
                  {query ? "No results found" : "No reply activities in this view."}
                </p>
              )}
            </SidebarContent>
            <div className="px-px-20 py-px-16">
              <ActivityFeedback />
            </div>
          </Sidebar>
        </Sidebar>
        <SidebarInset className="h-full min-w-0 overflow-hidden max-md:hidden max-md:group-data-[reading=true]/support:flex">
          <section
            className="@container flex min-h-0 flex-1 flex-col overflow-y-auto wrap-anywhere"
            aria-label="Message details"
          >
            <div className="px-4 md:hidden">
              <ActivityFeedback />
            </div>
            {related.length > 1 && (
              <nav
                aria-label="Conversation actions"
                className="flex shrink-0 flex-wrap gap-2 border-b border-border p-4"
              >
                {related.map((activity) => (
                  <Button
                    key={activity.id}
                    variant={selected?.id === activity.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => updateSearch({ activity: activity.id })}
                  >
                    {activity.effective.title}
                  </Button>
                ))}
              </nav>
            )}
            {selected ? (
              <ReplyActivityDetail
                key={selected.id}
                activity={selected}
                headerLeading={backButton}
              />
            ) : (
              <div className="grid justify-items-center gap-px-12 px-px-24 py-px-64 text-center text-ui-13 text-muted-foreground">
                {backButton}
                <MessageSquare aria-hidden="true" />
                <p>Select a reply activity</p>
              </div>
            )}
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
