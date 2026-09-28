import { conversations } from '#/features/support/mock-conversations'
import { useWorkspaceState } from '#/features/workspace/workspace-state'

export function DailyBrief({
  onOpenContact,
}: {
  onOpenContact: (id: string) => void
}) {
  const { tasks, statuses, entries } = useWorkspaceState()
  const focus = tasks.find(
    (task) => task.section === 'focus' && task.status === 'todo',
  )
  const optional = tasks.find(
    (task) => task.section === 'optional' && task.status === 'todo',
  )
  const contacts = conversations.filter(
    (person) => (statuses[person.id] ?? 'now') === 'now',
  )
  const firstContact = contacts[0]
  const resume = entries.find(
    (entry) =>
      entry.kind === '再開地点' &&
      !entries.some((other) => other.correctionOf === entry.id),
  )

  return (
    <section className="home-brief" aria-label="今日のブリーフ">
      <p>
        {focus
          ? `今日は「${focus.title}」から始められそうです。`
          : 'いま優先して取りかかるタスクはありません。'}
        {firstContact ? (
          <>
            {' '}
            <button
              type="button"
              onClick={() => onOpenContact(firstContact.id)}
            >
              {firstContact.name}さんへの返信
            </button>
            {contacts.length > 1
              ? `など、確認できる連絡が${contacts.length}件あります。`
              : 'が残っています。'}
          </>
        ) : (
          ' いま返信に取りかかる連絡もありません。'
        )}
      </p>
      {resume ? (
        <p className="home-brief-secondary">
          再開メモには「
          {resume.text.length > 100
            ? `${resume.text.slice(0, 100)}…`
            : resume.text}
          」と残っています。
        </p>
      ) : optional ? (
        <p className="home-brief-secondary">
          「{optional.title}」は、余裕があるときに。
        </p>
      ) : null}
    </section>
  )
}
