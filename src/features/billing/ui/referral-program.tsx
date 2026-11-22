import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { referralLink } from '@/features/auth/domain/referral-link'

import type { ReferralOverview } from '../application/billing-actions'
import { formatEuros } from '../domain/plans'

export function ReferralProgram({
  summary,
  isPending,
  isError,
  onRetry,
}: {
  summary: ReferralOverview | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
}) {
  const [message, setMessage] = useState('')
  const link =
    summary && typeof window !== 'undefined'
      ? referralLink(window.location.origin, summary.code)
      : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setMessage('Enlace copiado. Compártelo con quien quieras invitar.')
    } catch {
      setMessage('No se pudo copiar automáticamente. Selecciona y copia el enlace.')
    }
  }

  return (
    <section
      aria-labelledby="referral-program-title"
      className="border-border rounded-lg border p-4"
    >
      <h3 id="referral-program-title" className="font-semibold">
        Invita a otra empresa
      </h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Cuando una empresa que llegue desde tu enlace pague su suscripción, recibirás un saldo del
        10 % de lo cobrado con tarjeta. Se aplicará automáticamente a tus próximos pagos.
      </p>
      {isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <p role="alert">No se pudo cargar el saldo de referidos.</p>
          <Button variant="outline" size="sm" onPress={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : isPending || !summary ? (
        <p className="text-muted-foreground mt-3 text-sm">Cargando saldo…</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Saldo disponible</dt>
              <dd className="font-semibold">{formatEuros(summary.balance_cents / 100)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Empresas invitadas</dt>
              <dd className="font-semibold">{summary.referred_count}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Saldo generado</dt>
              <dd className="font-semibold">{formatEuros(summary.earned_cents / 100)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="referral-link">
              Enlace personal de invitación
            </label>
            <input
              id="referral-link"
              readOnly
              value={link}
              className="border-input bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <Button variant="outline" onPress={() => void copyLink()}>
              Copiar enlace
            </Button>
          </div>
          {message ? (
            <p role="status" className="text-muted-foreground mt-2 text-xs">
              {message}
            </p>
          ) : null}
          <p className="text-muted-foreground mt-2 text-xs">
            El saldo pertenece a esta empresa y se descuenta de sus facturas de suscripción.
          </p>
        </>
      )}
    </section>
  )
}
