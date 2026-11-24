import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { startGoogleAuth } from '../application/google-auth'

type Signup = { fullName: string; companyName: string; referralCode?: string | null }

export function GoogleAuthButton({
  redirect,
  signup,
}: {
  redirect?: string | undefined
  signup?: Signup
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function start() {
    setBusy(true)
    setError(false)
    try {
      await startGoogleAuth(redirect, signup)
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        isDisabled={busy}
        onPress={() => void start()}
      >
        {busy ? 'Conectando…' : 'Continuar con Google'}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo conectar con Google. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  )
}
