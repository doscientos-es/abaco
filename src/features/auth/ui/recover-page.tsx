import { Button } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { fieldIcons } from '@/shared/ui/field-icons'
import { TextField } from '@/shared/ui/form'

import { requestPasswordReset } from '../application/auth-actions'
import { emailSchema, firstError } from '../domain/credentials'
import { AuthLayout, FormError } from './auth-layout'

const backToLogin = (
  <Link to="/entrar" className="hover:text-foreground underline">
    Volver a entrar
  </Link>
)

export function RecoverPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) return setError(firstError(parsed.error))
    setBusy(true)
    setError(null)
    const result = await requestPasswordReset(parsed.data)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout
        title="Revisa tu correo"
        description={`Si ${email.trim()} tiene cuenta, recibirás un enlace para elegir una nueva contraseña. Caduca en 1 hora.`}
        footer={backToLogin}
      >
        <p className="text-muted-foreground text-sm">
          ¿No llega? Mira en la carpeta de spam o inténtalo de nuevo en unos minutos.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      description="Escribe tu correo y te enviaremos un enlace para elegir una nueva."
      footer={backToLogin}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <TextField
          label="Correo"
          type="email"
          maxLength={254}
          placeholder="nombre@empresa.es"
          icon={fieldIcons.mail}
          value={email}
          onChange={setEmail}
        />
        <FormError message={error} />
        <Button type="submit" className="w-full" isDisabled={busy}>
          {busy ? 'Enviando…' : 'Enviar enlace'}
        </Button>
      </form>
    </AuthLayout>
  )
}
