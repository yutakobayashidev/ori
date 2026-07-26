import { type FormEvent, useState } from 'react'
import { normalizeListTarget } from '../inputs'

type Props = {
  initialTarget: string
  onSubmit: (target: string) => void
}

export function ListForm({ initialTarget, onSubmit }: Props) {
  const [target, setTarget] = useState(initialTarget)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      const listId = normalizeListTarget(target)
      setError('')
      onSubmit(listId)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '入力内容を確認してください。',
      )
    }
  }

  return (
    <form className="intent-form" onSubmit={submit}>
      <label className="field">
        <span>リスト URL または ID</span>
        <input
          autoComplete="off"
          aria-describedby={error ? 'list-error' : undefined}
          aria-invalid={Boolean(error)}
          name="target"
          value={target}
          onChange={(event) => setTarget(event.currentTarget.value)}
          placeholder="https://x.com/i/lists/1234567890 または ID"
        />
        {error ? (
          <span className="field-error" id="list-error" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <button type="submit">表示</button>
    </form>
  )
}
