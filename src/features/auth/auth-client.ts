export type SafeOwner = {
  id: number
  email: string
  name: string
  onboardingCompletedAt: number | null
}

export type AuthState = { needsSetup: boolean; owner: SafeOwner | null }

type AuthInput =
  | { action: 'login'; email: string; password: string }
  | {
      action: 'setup'
      email: string
      password: string
      name: string
      setupToken: string
    }
  | { action: 'logout' }
  | { action: 'onboard'; name: string }

export async function authRequest(input: AuthInput): Promise<AuthState> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || 'Something went wrong. Please try again.')
  }
  return result
}
