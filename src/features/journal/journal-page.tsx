import { useId, useState } from 'react'
import { Dialog } from '#/components/dialog'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { Textarea } from '#/components/ui/textarea'
import { TooltipProvider } from '#/components/ui/tooltip'
import { WorkspaceNavigation } from '#/components/workspace-navigation'
import {
  type JournalEntry as Entry,
  type EntryKind,
  useWorkspaceState,
} from '#/features/workspace/workspace-state'
import './journal.css'

type Draft = Pick<Entry, 'kind' | 'text' | 'source' | 'occurredAt'>
const emptyDraft: Draft = { kind: 'メモ', text: '', source: '', occurredAt: '' }
const kinds: EntryKind[] = ['メモ', '再開地点', '服薬', '体重']

function formatTime(value: string | undefined) {
  if (!value) return '不明'
  return new Date(value).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function JournalPage() {
  const { entries, setEntries } = useWorkspaceState()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [correcting, setCorrecting] = useState<Entry | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const superseded = new Set(entries.map((entry) => entry.correctionOf))
  const current = entries.filter((entry) => !superseded.has(entry.id))

  function append(value: Draft, correctionOf?: string) {
    setEntries((previous) => [
      {
        ...value,
        text: value.text.trim(),
        source: value.source.trim(),
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        correctionOf,
      },
      ...previous,
    ])
  }

  return (
    <TooltipProvider delay={500}>
      <SidebarProvider className="journal-workspace">
        <WorkspaceNavigation />
        <SidebarInset className="journal-main">
          <header className="journal-header">
            <h1 className="text-base font-semibold">記録</h1>
            <Button
              variant="outline"
              disabled={current.length === 0}
              onClick={() => {
                setSelected(new Set(current.map((entry) => entry.id)))
                setReviewing(true)
              }}
            >
              記録をまとめる
            </Button>
          </header>
          <div className="journal-scroll">
            <div className="journal-column">
              <EntryEditor
                draft={draft}
                onChange={setDraft}
                onSubmit={() => {
                  append(draft)
                  setDraft(emptyDraft)
                }}
                submitLabel="記録する"
              />
              <section className="journal-entries" aria-label="記録一覧">
                {entries.length === 0 && (
                  <p className="journal-empty">まだ記録はありません</p>
                )}
                {entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="journal-entry"
                    aria-label={`${entry.kind}の記録`}
                  >
                    <div className="journal-entry-heading">
                      <span className="text-sm font-medium">{entry.kind}</span>
                      {superseded.has(entry.id) && (
                        <span className="text-xs text-muted-foreground">
                          訂正前
                        </span>
                      )}
                      {entry.correctionOf && (
                        <span className="text-xs text-muted-foreground">
                          訂正
                        </span>
                      )}
                      {!superseded.has(entry.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setCorrecting(entry)}
                        >
                          訂正する
                        </Button>
                      )}
                    </div>
                    <p className="journal-entry-text">
                      {entry.text}
                      {entry.kind === '体重' ? ' kg' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      発生日時: {formatTime(entry.occurredAt)} · 記録日時:{' '}
                      {formatTime(entry.recordedAt)}
                    </p>
                    {(entry.kind === '体重' || entry.source) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        記録元: {entry.source || '不明'}
                      </p>
                    )}
                  </article>
                ))}
              </section>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      {correcting && (
        <CorrectionDialog
          entry={correcting}
          onClose={() => setCorrecting(null)}
          onSave={(value) => {
            append(value, correcting.id)
            setCorrecting(null)
          }}
        />
      )}
      {reviewing && (
        <Dialog
          title="記録をまとめる"
          className="sm:max-w-2xl"
          onClose={() => setReviewing(false)}
        >
          <p className="text-sm text-muted-foreground">
            含める記録を選んで確認できます。外部には送信されません。
          </p>
          <div className="journal-review-list">
            {current.map((entry) => (
              <label
                key={entry.id}
                className="journal-review-row"
                htmlFor={`review-${entry.id}`}
              >
                <Checkbox
                  id={`review-${entry.id}`}
                  checked={selected.has(entry.id)}
                  onCheckedChange={(checked) =>
                    setSelected((previous) => {
                      const next = new Set(previous)
                      if (checked) next.add(entry.id)
                      else next.delete(entry.id)
                      return next
                    })
                  }
                />
                <span>
                  <span className="text-xs text-muted-foreground">
                    {entry.kind} · {formatTime(entry.occurredAt)}
                  </span>
                  <span className="block text-sm">
                    {entry.text}
                    {entry.kind === '体重' ? ' kg' : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Textarea
            aria-label="記録のまとめ"
            className="journal-summary"
            readOnly
            value={buildSummary(
              current.filter((entry) => selected.has(entry.id)),
            )}
          />
        </Dialog>
      )}
    </TooltipProvider>
  )
}

function EntryEditor({
  draft,
  onChange,
  onSubmit,
  submitLabel,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  onSubmit: () => void
  submitLabel: string
}) {
  const dateId = useId()
  const valid =
    draft.text.trim().length > 0 &&
    (draft.kind !== '体重' ||
      (Number.isFinite(Number(draft.text)) && Number(draft.text) > 0))
  return (
    <form
      className="journal-editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSubmit()
      }}
    >
      <fieldset className="journal-kind-switch" aria-label="記録の種類">
        {kinds.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant={draft.kind === kind ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={draft.kind === kind}
            onClick={() => onChange({ ...draft, kind })}
          >
            {kind}
          </Button>
        ))}
      </fieldset>
      {draft.kind === '体重' ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="any"
            min="0.1"
            aria-label="体重"
            placeholder="体重"
            value={draft.text}
            onChange={(event) =>
              onChange({ ...draft, text: event.target.value })
            }
          />
          <span className="text-sm text-muted-foreground">kg</span>
        </div>
      ) : (
        <Textarea
          aria-label="記録内容"
          placeholder={
            draft.kind === '服薬'
              ? '服用した薬の名前'
              : draft.kind === '再開地点'
                ? '次にすること、開いておく場所'
                : '自由なメモ、次にすること'
          }
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
        />
      )}
      {draft.kind === '体重' && (
        <Input
          aria-label="記録元"
          placeholder="記録元（体重計など・任意）"
          value={draft.source}
          onChange={(event) =>
            onChange({ ...draft, source: event.target.value })
          }
        />
      )}
      <div className="journal-editor-footer">
        <label className="journal-date-label" htmlFor={dateId}>
          発生日時（任意）
          <Input
            id={dateId}
            type="datetime-local"
            aria-label="発生日時"
            value={draft.occurredAt}
            onChange={(event) =>
              onChange({ ...draft, occurredAt: event.target.value })
            }
          />
        </label>
        <Button type="submit" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function CorrectionDialog({
  entry,
  onClose,
  onSave,
}: {
  entry: Entry
  onClose: () => void
  onSave: (draft: Draft) => void
}) {
  const [draft, setDraft] = useState<Draft>(entry)
  return (
    <Dialog title="記録を訂正" onClose={onClose} className="sm:max-w-xl">
      <p className="text-sm text-muted-foreground">
        元の記録を残して、訂正を追加します。
      </p>
      <EntryEditor
        draft={draft}
        onChange={setDraft}
        onSubmit={() => onSave(draft)}
        submitLabel="訂正を追加"
      />
    </Dialog>
  )
}

function buildSummary(entries: Entry[]) {
  if (!entries.length) return '記録を選択してください。'
  const dates = entries
    .map((entry) => entry.occurredAt)
    .filter(Boolean)
    .sort()
  const period = dates.length
    ? `${formatTime(dates[0])} 〜 ${formatTime(dates[dates.length - 1])}`
    : '不明'
  return [
    `発生日時の期間: ${period}`,
    `発生日時が不明の記録: ${entries.filter((entry) => !entry.occurredAt).length}件`,
    '',
    ...entries.map(
      (entry) =>
        `[${entry.kind}] ${entry.text}${entry.kind === '体重' ? ' kg' : ''}\n発生日時: ${formatTime(entry.occurredAt)} / 記録日時: ${formatTime(entry.recordedAt)}${entry.kind === '体重' ? ` / 記録元: ${entry.source || '不明'}` : ''}`,
    ),
    '',
    '記録のない期間の服薬・体重は不明です。',
  ].join('\n')
}
