import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { stateLabels } from "#/features/activities/activity-controls";
import type { Activity } from "#/features/activities/model";
import { loadReplyAvatar } from "#/features/beeper/server-functions";

export function ConversationRow({
  group,
  selected,
  onSelect,
}: {
  group: [Activity, ...Activity[]];
  selected: boolean;
  onSelect: () => void;
}) {
  const first = group[0];
  const { data } = useQuery({
    queryKey: ["reply-preview", first.id],
    queryFn: () => loadReplyAvatar({ data: { activityId: first.id } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const item = first.effective;
  if (item.kind !== "reply") return null;
  const groupChat = data?.type === "group";
  const title = groupChat ? data.title : item.reply.recipientName;
  const recipients = [
    ...new Set(
      group.flatMap((activity) =>
        activity.effective.kind === "reply" ? [activity.effective.reply.recipientName] : [],
      ),
    ),
  ].join(", ");
  return (
    <button
      type="button"
      data-testid="support-row"
      aria-label={groupChat ? `${title}: Reply to ${recipients}` : `${title}: ${item.title}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className="mx-px-8 my-px-2 flex cursor-pointer gap-px-12 rounded-ui-10 px-px-14 py-px-12 text-left leading-normal hover:bg-sidebar-accent aria-current:bg-sidebar-accent"
    >
      <Avatar aria-hidden="true">
        {data?.dataUrl && <AvatarImage src={data.dataUrl} alt="" />}
        <AvatarFallback>{title?.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col gap-px-3">
        <strong className="truncate text-ui-12 font-book">{title}</strong>
        {groupChat && (
          <span className="truncate text-ui-11 text-muted-foreground">Reply to {recipients}</span>
        )}
        <span className="truncate text-ui-12 text-muted-foreground">{item.title}</span>
        <span className="text-ui-10 text-muted-foreground">
          {group.map((activity) => `#${activity.number}`).join(", ")} ·{" "}
          {group.length > 1 ? `${group.length} actions` : stateLabels[first.userState]}
        </span>
      </span>
    </button>
  );
}
