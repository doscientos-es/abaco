import { Button, Card, CardContent } from '@doscientos/ui'
import { useEffect, useState } from 'react'

import { TextField } from '@/shared/ui/form'

import {
  loadPublicEstimate,
  respondToPublicEstimate,
  type PublicEstimate,
} from '../application/public-estimate-actions'
import { EstimateDocument } from './estimate-document'

const errorTexts: Record<string, string> = {
  not_found: 'Este enlace no es válido o el presupuesto ya no está disponible.',
  expired: 'Este presupuesto ha caducado. Pide a la empresa que te envíe uno actualizado.',
  already_responded: 'Este presupuesto ya fue respondido.',
  name_required: 'Escribe tu nombre completo para aceptar.',
}

/** Page the client opens from the emailed link: no account, the token in the URL is the credential. */
export function PublicEstimatePage({ token }: { token: string }) {
  const [state, setState] = useState<{ loading: true } | { loading: false; data?: PublicEstimate; error?: string }>({
    loading: true,
  })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void loadPublicEstimate(token).then((result) => {
      if (cancelled) return
      setState(result.ok ? { loading: false, data: result.data } : { loading: false, error: result.error })
    })
    return () => {
      cancelled = true
    }
  }, [token])

  async function respond(action: 'accept' | 'reject') {
    setBusy(true)
    setMessage(undefined)
    const result = await respondToPublicEstimate(token, action, name)
    setBusy(false)
    if (result.ok) setState({ loading: false, data: result.data })
    else setMessage(errorTexts[result.error] ?? 'No se pudo registrar tu respuesta. Inténtalo de nuevo.')
  }

  if (state.loading) return <p className="text-muted-foreground p-8 text-center text-sm">Cargando presupuesto…</p>
  if (!state.data) {
    return (
      <p className="mx-auto max-w-md p-8 text-center text-sm">
        {errorTexts[state.error ?? ''] ?? 'No pudimos cargar el presupuesto. Inténtalo de nuevo en unos minutos.'}
      </p>
    )
  }

  const { estimate, tenant, client } = state.data
  const expired = estimate.validUntil < new Date().toISOString().slice(0, 10)

  return (
    <main className="bg-muted/30 min-h-screen space-y-6 p-4 sm:p-8">
      <EstimateDocument estimate={estimate} client={client} tenant={tenant} />
      <Card className="mx-auto max-w-3xl print:hidden">
        <CardContent className="space-y-4 pt-6">
          {estimate.status === 'accepted' || estimate.status === 'rejected' ? (
            <p className="text-sm font-medium">
              {estimate.status === 'accepted' ? 'Presupuesto aceptado' : 'Presupuesto rechazado'}
              {estimate.respondedBy ? ` por ${estimate.respondedBy}` : ''}
              {estimate.respondedAt ? ` el ${estimate.respondedAt.slice(0, 10)}` : ''}. Gracias.
            </p>
          ) : expired ? (
            <p className="text-sm">{errorTexts.expired}</p>
          ) : (
            <>
              <TextField label="Tu nombre completo" value={name} onChange={setName} placeholder="Nombre y apellidos" />
              <p className="text-muted-foreground text-xs">
                Al aceptar confirmas que estás conforme con este presupuesto. Quedan registrados tu nombre y la fecha.
              </p>
              {message ? <p className="text-destructive text-sm">{message}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button isDisabled={busy} onPress={() => void respond('accept')}>
                  Aceptar presupuesto
                </Button>
                <Button variant="outline" isDisabled={busy} onPress={() => void respond('reject')}>
                  Rechazar
                </Button>
              </div>
            </>
          )}
          <Button variant="outline" onPress={() => window.print()}>
            Imprimir o guardar PDF
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
