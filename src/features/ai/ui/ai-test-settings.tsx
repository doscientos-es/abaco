import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useState } from 'react'

import { requestSuggestion } from '../application/ai-actions'

/** Uses the same authorization and quota as the budget assistant. */
export function AiTestSettings({ tenantId }: { tenantId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function test() {
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await requestSuggestion(tenantId, {
        task: 'estimate',
        messages: [{ role: 'user', text: '¿Qué datos necesitas para pintar una habitación?' }],
      })
      setMessage(result.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo probar la IA.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prueba de inteligencia artificial</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Envía una pregunta de ejemplo sin datos reales. La prueba requiere acceso a IA y consume
          una solicitud de tu cuota, incluso si falla después de reservarla.
        </p>
        <Button variant="outline" isDisabled={busy} onPress={() => void test()}>
          {busy ? 'Probando…' : 'Probar IA'}
        </Button>
        {message ? <output className="block text-sm">{message}</output> : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
