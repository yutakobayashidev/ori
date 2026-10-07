import { conversations } from "#/features/support/mock-conversations";
import { useWorkspaceState } from "#/features/workspace/workspace-state";

export function DailyBrief({ onOpenContact }: { onOpenContact: (id: string) => void }) {
  const { tasks, statuses, entries } = useWorkspaceState();
  const focus = tasks.find((task) => task.section === "focus" && task.status === "todo");
  const optional = tasks.find((task) => task.section === "optional" && task.status === "todo");
  const contacts = conversations.filter(
    (person) =>
      (statuses[person.id] ?? "now") === "now" &&
      (person.replyRequired || statuses[person.id] === "now"),
  );
  const firstContact = contacts[0];
  const resume = entries.find(
    (entry) =>
      entry.kind === "再開地点" && !entries.some((other) => other.correctionOf === entry.id),
  );

  return (
    <section
      className="mt-px-20 max-w-[760px] text-ui-15 leading-brief wrap-anywhere"
      aria-label="Daily brief"
    >
      <p>
        {focus ? `Start with “${focus.title}” today.` : "There are no priority tasks right now."}
        {firstContact ? (
          <>
            {" "}
            <button
              className="cursor-pointer underline decoration-border underline-offset-4 hover:decoration-foreground"
              type="button"
              onClick={() => onOpenContact(firstContact.id)}
            >
              Reply to {firstContact.name}
            </button>
            {contacts.length > 1
              ? ` — one of ${contacts.length} conversations to review.`
              : " when you’re ready."}
          </>
        ) : (
          " There are no conversations awaiting your attention."
        )}
      </p>
      {resume ? (
        <p className="mt-px-8 text-ui-13 text-muted-foreground">
          Your resume note: “
          {resume.text.length > 100 ? `${resume.text.slice(0, 100)}…` : resume.text}”
        </p>
      ) : optional ? (
        <p className="mt-px-8 text-ui-13 text-muted-foreground">
          “{optional.title}” can wait until you have room.
        </p>
      ) : null}
    </section>
  );
}
