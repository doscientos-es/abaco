import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { referralLink } from '@/features/auth/domain/referral-link'
import { useActionLock } from '@/shared/lib/use-action-lock'

import type { ReferralOverview } from '../application/billing-actions'

export function ReferralProgram({
  summary,
  isPending,
  isError,
  onRetry,
}: {
  summary: ReferralOverview | null | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
}) {
  const [message, setMessage] = useState('')
  const [copying, setCopying] = useState(false)
  const copyLock = useActionLock()
  const link =
    summary && typeof window !== 'undefined'
      ? referralLink(window.location.origin, summary.code)
      : ''

  async function copyLink() {
    if (!link || !copyLock.acquire()) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(link)
      setMessage('Enlace copiado. Compártelo con quien quieras invitar.')
    } catch {
      setMessage('No se pudo copiar automáticamente. Selecciona y copia el enlace.')
    } finally {
      copyLock.release()
      setCopying(false)
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
      {isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <p role="alert">No se pudo cargar el estado de referidos.</p>
          <Button variant="outline" size="sm" onPress={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : isPending || summary === undefined ? (
        <p className="text-muted-foreground mt-3 text-sm">Cargando referidos…</p>
      ) : summary === null ? (
        <p className="text-muted-foreground mt-3 text-sm">
          El programa de referidos aún no está disponible.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm font-semibold">
            Recomendaciones activas · descuentos pendientes
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ya puedes compartir tu enlace y registrar empresas invitadas. Los descuentos todavía no
            están activos y no se aplican a los cobros ni a las facturas.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Empresas invitadas</dt>
              <dd className="font-semibold">{summary.referred_count}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Empresa que te recomendó</dt>
              <dd className="font-semibold">{summary.recommended_by ?? 'Sin recomendación'}</dd>
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
            <Button variant="outline" isDisabled={copying} onPress={() => void copyLink()}>
              {copying ? 'Copiando…' : 'Copiar enlace'}
            </Button>
          </div>
          {message ? (
            <output className="text-muted-foreground mt-2 block text-xs">{message}</output>
          ) : null}
          <p className="text-muted-foreground mt-2 text-xs">
            La recomendación se asigna al crear la empresa. Solo el equipo de Ábaco puede
            corregirla.
          </p>
        </>
      )}
    </section>
  )
}
