import { Button, Card, CardContent, CardHeader, CardTitle, Textarea, toast } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { useSession } from '@/features/auth'

import { listVacationRequests, submitVacationRequest } from '../application/vacation-actions'
import { isValidVacationPeriod } from '../domain/vacation-request'
import { VacationRequestCard } from './vacation-request-card'

const requestQueryKey = (tenantId: string | null | undefined) => ['vacation-requests', tenantId]

export function MyVacationRequestsPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [comment, setComment] = useState('')
  const requests = useQuery({
    queryKey: requestQueryKey(tenantId),
    enabled: Boolean(tenantId),
    queryFn: () => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return listVacationRequests(tenantId)
    },
  })
  const submit = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return submitVacationRequest({ tenantId, startDate, endDate, comment })
    },
    onSuccess: async () => {
      setStartDate('')
      setEndDate('')
      setComment('')
      await queryClient.invalidateQueries({ queryKey: requestQueryKey(tenantId) })
      toast.success('Solicitud enviada')
    },
    onError: (error: Error) =>
      toast.error('No se pudo enviar la solicitud', { description: error.message }),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidVacationPeriod(startDate, endDate)) {
      toast.error('Revisa las fechas', {
        description: 'La fecha final debe ser igual o posterior a la inicial.',
      })
      return
    }
    submit.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Mis vacaciones</h1>
        <p className="text-muted-foreground text-sm">
          Envía una solicitud y consulta aquí la decisión de administración.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Solicitar vacaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Desde
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="border-input bg-background min-h-10 rounded-md border px-3"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Hasta, incluido
                <input
                  required
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="border-input bg-background min-h-10 rounded-md border px-3"
                />
              </label>
            </div>
            <label htmlFor="vacation-request-comment" className="grid gap-1.5 text-sm font-medium">
              <span>Comentario (opcional)</span>
              <Textarea
                id="vacation-request-comment"
                value={comment}
                maxLength={1000}
                rows={3}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            <Button type="submit" isDisabled={submit.isPending || !tenantId}>
              {submit.isPending ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="my-vacation-history-title">
        <h2 id="my-vacation-history-title" className="text-lg font-semibold">
          Historial de solicitudes
        </h2>
        {requests.isPending ? <output>Cargando solicitudes…</output> : null}
        {requests.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {requests.error.message}
          </p>
        ) : null}
        {requests.data?.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border p-4 text-sm">
            Todavía no has enviado solicitudes.
          </p>
        ) : null}
        {requests.data?.map((request) => (
          <VacationRequestCard key={request.id} request={request} />
        ))}
      </section>
    </div>
  )
}
