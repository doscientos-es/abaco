import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useAiCredits } from '../application/ai-access'
import { requestSuggestion } from '../application/ai-actions'

/** Uses the same authorization and quota as the budget assistant. */
export function AiTestSettings({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string | undefined
}) {
  const credits = useAiCredits(tenantId, userId)
  const queryClient = useQueryClient()
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
      void queryClient.invalidateQueries({ queryKey: ['ai-credits', tenantId, userId] })
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prueba de inteligencia artificial</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {credits.data ? (
          <p className="text-sm">
            Créditos mensuales disponibles: {credits.data.monthly_limit - credits.data.monthly_used}{' '}
            de {credits.data.monthly_limit}. Créditos extra: {credits.data.extra_remaining}.
          </p>
        ) : credits.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron consultar tus créditos de IA.
          </p>
        ) : credits.data === null ? (
          <p className="text-muted-foreground text-sm">La IA no está activa para tu usuario.</p>
        ) : null}
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
