import { CalendarPlus, Check, ChevronDown, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import type { Conversation } from './mock-conversations'

export function ConversationDetail({
  conversation,
  onResolve,
}: {
  conversation: Conversation
  onResolve: (
    result: 'sent' | 'waiting' | 'later' | 'dismissed',
    note?: string,
  ) => void
}) {
  const [draft, setDraft] = useState(conversation.drafts[0]?.text ?? '')
  const [tone, setTone] = useState(conversation.drafts[0]?.label ?? '')
  const [review, setReview] = useState<'send' | 'schedule' | null>(null)
  const [slot, setSlot] = useState('')
  const [scheduled, setScheduled] = useState('')

  return (
    <article
      className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-10 sm:py-10"
      aria-label={`${conversation.name}との会話`}
    >
      <header className="mb-8 space-y-2">
        <p className="text-xs text-muted-foreground">
          {conversation.channels.join(' / ')} · {conversation.role}
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          {conversation.name}
        </h1>
        <p className="text-sm text-muted-foreground">{conversation.subject}</p>
      </header>

      <section className="mb-8 space-y-4" aria-label="会話の要点">
        <p className="text-sm leading-7">{conversation.summary}</p>
        <div className="border-l-2 border-border pl-4">
          <p className="text-sm leading-6">{conversation.nextStep}</p>
          {conversation.deadline && (
            <p className="mt-1 text-xs text-muted-foreground">
              相手の指定期限 · {conversation.deadline}
            </p>
          )}
        </div>
      </section>

      <details className="group mb-8 border-y border-border py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          元のやりとり{' '}
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 pt-5">
          {conversation.messages.map((message) => (
            <div
              key={message.id}
              id={`source-${message.id}`}
              className="scroll-mt-5 rounded-lg bg-muted/40 p-4 focus:outline-none"
              tabIndex={-1}
            >
              <p className="mb-2 text-xs text-muted-foreground">
                {message.direction === 'in' ? conversation.name : '自分'} ·{' '}
                {message.channel} · {message.time}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7">
                {message.text}
              </p>
            </div>
          ))}
        </div>
      </details>

      <section aria-label="返信を作る" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={`support-reply-${conversation.id}`}
            className="text-sm font-medium"
          >
            返信
          </label>
          <span className="text-xs text-muted-foreground">
            {conversation.replyChannel} → {conversation.name}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {conversation.drafts.map((option) => (
            <Button
              key={option.label}
              variant={tone === option.label ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={tone === option.label}
              onClick={() => {
                setDraft(option.text)
                setTone(option.label)
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Textarea
          id={`support-reply-${conversation.id}`}
          value={draft}
          className="min-h-36 resize-y text-sm leading-7"
          onChange={(event) => {
            setDraft(event.target.value)
            setTone('')
          }}
        />

        {conversation.scheduleOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label="日程候補"
              value={slot}
              onChange={(event) => setSlot(event.target.value)}
            >
              <NativeSelectOption value="">候補日時を選ぶ</NativeSelectOption>
              {conversation.scheduleOptions.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              size="sm"
              variant="ghost"
              disabled={!slot}
              onClick={() => {
                setDraft(
                  (current) => `${current}\n\n${slot}はいかがでしょうか。`,
                )
                setTone('')
              }}
            >
              返信に入れる
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!slot}
              aria-label="予定を仮置きする"
              onClick={() => setReview('schedule')}
            >
              <CalendarPlus />
            </Button>
          </div>
        )}
        {scheduled && (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Check className="size-3" />
            {scheduled} をこの画面に仮置きしました
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button disabled={!draft.trim()} onClick={() => setReview('send')}>
            <Send />
            送信内容を確認
          </Button>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolve('later')}
            >
              今は置いておく
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolve('waiting')}
            >
              相手待ち
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolve('dismissed')}
            >
              返信せず閉じる
            </Button>
          </div>
        </div>
      </section>

      <details className="group mt-10 border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          人物メモ{' '}
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-4 space-y-3 text-sm leading-6">
          {conversation.facts.map((fact) => (
            <li
              key={fact.sourceId}
              className="flex items-start justify-between gap-3"
            >
              <span>{fact.text}</span>
              <a
                className="shrink-0 text-xs text-muted-foreground underline underline-offset-4"
                href={`#source-${fact.sourceId}`}
                onClick={() => {
                  const source = document.getElementById(
                    `source-${fact.sourceId}`,
                  )
                  const details = source?.closest('details')
                  if (details) details.open = true
                  source?.focus()
                }}
              >
                出典
              </a>
            </li>
          ))}
        </ul>
      </details>

      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open) setReview(null)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {review === 'schedule' ? '予定の確認' : '送信内容の確認'}
            </DialogTitle>
            <DialogDescription>
              {review === 'schedule'
                ? '外部カレンダーには登録せず、この画面だけに仮置きします。'
                : '外部には送信されません。完了後の表示を試せます。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">
              {conversation.name}
              {review === 'send' && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {conversation.replyChannel}
                </span>
              )}
            </p>
            <p className="max-h-[45dvh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-7">
              {review === 'schedule' ? slot : draft}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              戻る
            </Button>
            <Button
              onClick={() => {
                if (review === 'schedule') setScheduled(slot)
                else
                  onResolve(
                    'sent',
                    `${conversation.replyChannel} → ${conversation.name}（送信プレビュー）\n${draft}`,
                  )
                setReview(null)
              }}
            >
              {review === 'schedule' ? '仮置きを試す' : '送信を試す'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}
