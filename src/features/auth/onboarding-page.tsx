import { useRouteContext } from '@tanstack/react-router'
import { ArrowRight, BookOpen, House, MessagesSquare } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { authRequest } from './auth-client'
import { AuthFrame } from './auth-page'

export function OnboardingPage() {
  const { auth } = useRouteContext({ from: '__root__' })
  const [name, setName] = useState(auth.owner?.name ?? '')
  const [step, setStep] = useState(1)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function finish() {
    setPending(true)
    setError('')
    try {
      await authRequest({ action: 'onboard', name: name.trim() })
      window.location.assign('/')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save. Please try again.',
      )
      setPending(false)
    }
  }

  async function signOut() {
    setPending(true)
    setError('')
    try {
      await authRequest({ action: 'logout' })
      window.location.assign('/login')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to sign out. Please try again.',
      )
      setPending(false)
    }
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    setStep(2)
  }

  return (
    <AuthFrame>
      <p className="auth-step">{step} of 2</p>
      {step === 1 ? (
        <>
          <header className="auth-heading">
            <h1>A little context, to start.</h1>
            <p>Your day, conversations, and reading, together in one place.</p>
          </header>
          <form className="auth-form" onSubmit={next}>
            <div className="auth-field">
              <Label htmlFor="displayName">What should we call you?</Label>
              <Input
                id="displayName"
                name="displayName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="given-name"
                required
                maxLength={80}
                disabled={pending}
              />
            </div>
            <Button
              type="submit"
              className="auth-submit"
              size="lg"
              disabled={pending || !name.trim()}
            >
              Continue
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </>
      ) : (
        <>
          <header className="auth-heading">
            <h1>Start with today.</h1>
            <p>You can take it one thing at a time.</p>
          </header>
          <ul className="auth-overview">
            <li>
              <House aria-hidden="true" />
              <div>
                <strong>A place to begin</strong>
                <p>A brief and flexible tasks help you find your next step.</p>
              </div>
            </li>
            <li>
              <MessagesSquare aria-hidden="true" />
              <div>
                <strong>Room for the everyday</strong>
                <p>Keep conversations and quick notes close at hand.</p>
              </div>
            </li>
            <li>
              <BookOpen aria-hidden="true" />
              <div>
                <strong>Follow your curiosity</strong>
                <p>Explore reading and research alongside your day.</p>
              </div>
            </li>
          </ul>
          <p className="auth-prototype">
            Home, contacts, notes, reading, and vitals currently use sample
            data. You can add connections from your profile menu whenever you’re
            ready.
          </p>
          <div className="auth-actions">
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={pending}
            >
              Back
            </Button>
            <Button size="lg" onClick={finish} disabled={pending}>
              {pending ? 'Saving…' : 'Open workspace'}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <footer className="auth-footer">
        <span>{auth.owner?.email}</span>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={pending}>
          Sign out
        </Button>
      </footer>
    </AuthFrame>
  )
}
