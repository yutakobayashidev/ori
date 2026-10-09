import { useActivities } from "#/features/activities/activity-state";
import { useWorkspaceState } from "#/features/workspace/workspace-state";

export function DailyBrief({ onOpenContact }: { onOpenContact: (id: string) => void }) {
  const { entries } = useWorkspaceState();
  const { activities, loading, error } = useActivities();
  const tasks = activities
    .filter((activity) => activity.userState === "available" || activity.userState === "inProgress")
    .map((activity) => activity.effective);
  const focus = tasks.find((task) => task.section === "focus");
  const optional = tasks.find((task) => task.section === "optional");
  const contacts = tasks.filter((activity) => activity.kind === "reply");
  const firstContact = contacts[0];
  const resume = entries.find(
    (entry) =>
      entry.kind === "再開地点" && !entries.some((other) => other.correctionOf === entry.id),
  );

  if (loading || error) return null;
  return (
    <section
      className="mt-px-20 max-w-[760px] text-ui-15 leading-brief wrap-anywhere"
      aria-label="Daily brief"
    >
      <p>
        {focus
          ? `Start with “${focus.title}” today.`
          : "There are no priority activities right now."}
        {firstContact ? (
          <>
            {" "}
            <button
              className="cursor-pointer underline decoration-border underline-offset-4 hover:decoration-foreground"
              type="button"
              onClick={() => onOpenContact(firstContact.id)}
            >
              {firstContact.title}
            </button>
            {contacts.length > 1
              ? ` — one of ${contacts.length} reply actions to review.`
              : " when you’re ready."}
          </>
        ) : (
          " Other work can stay in your inbox."
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
