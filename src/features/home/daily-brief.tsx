import { conversations } from "#/features/support/mock-conversations";
import { useWorkspaceState } from "#/features/workspace/workspace-state";

export function DailyBrief({ onOpenContact }: { onOpenContact: (id: string) => void }) {
  const { tasks, statuses, entries } = useWorkspaceState();
  const focus = tasks.find((task) => task.section === "focus" && task.status === "todo");
  const optional = tasks.find((task) => task.section === "optional" && task.status === "todo");
  const contacts = conversations.filter((person) => (statuses[person.id] ?? "now") === "now");
  const firstContact = contacts[0];
  const resume = entries.find(
    (entry) =>
      entry.kind === "再開地点" && !entries.some((other) => other.correctionOf === entry.id),
  );

  return (
    <section className="home-brief" aria-label="Daily brief">
      <p>
        {focus ? `Start with “${focus.title}” today.` : "There are no priority tasks right now."}
        {firstContact ? (
          <>
            {" "}
            <button type="button" onClick={() => onOpenContact(firstContact.id)}>
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
        <p className="home-brief-secondary">
          Your resume note: “
          {resume.text.length > 100 ? `${resume.text.slice(0, 100)}…` : resume.text}”
        </p>
      ) : optional ? (
        <p className="home-brief-secondary">“{optional.title}” can wait until you have room.</p>
      ) : null}
    </section>
  );
}
