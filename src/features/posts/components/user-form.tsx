import { type FormEvent, useState } from 'react'
import { normalizeUserTarget } from '../inputs'

type Props = {
  initialTarget: string
  onSubmit: (target: string) => void
}

export function UserForm({ initialTarget, onSubmit }: Props) {
  const [target, setTarget] = useState(initialTarget)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      const handle = normalizeUserTarget(target)
      setError('')
      onSubmit(handle)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '入力内容を確認してください。',
      )
    }
  }

  return (
    <form className="intent-form" onSubmit={submit}>
      <label className="field">
        <span>ハンドルまたはプロフィール URL</span>
        <input
          autoComplete="off"
          aria-describedby={error ? 'target-error' : undefined}
          aria-invalid={Boolean(error)}
          name="target"
          value={target}
          onChange={(event) => setTarget(event.currentTarget.value)}
          placeholder="@handle または https://x.com/handle"
        />
        {error ? (
          <span className="field-error" id="target-error" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <button type="submit">表示</button>
    </form>
  )
}
