import { Button, Textarea, toast } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { FormDialog } from '@/shared/ui/form-dialog'

import { listVacationRequests, submitVacationRequest } from '../application/vacation-actions'
import { isValidVacationPeriod } from '../domain/vacation-request'
import { VacationDecisionNotices } from './vacation-decision-notices'
import { VacationRequestCard } from './vacation-request-card'

const requestQueryKey = (tenantId: string | null | undefined) => ['vacation-requests', tenantId]

export function MyVacationRequestsPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [requestOpen, setRequestOpen] = useState(false)
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
      setRequestOpen(false)
      await queryClient.invalidateQueries({ queryKey: requestQueryKey(tenantId) })
      toast.success('Solicitud enviada')
    },
    onError: (error: Error) =>
      toast.error('No se pudo enviar la solicitud', { description: error.message }),
  })

  function onSubmit() {
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

      {tenantId ? <VacationDecisionNotices tenantId={tenantId} /> : null}

      <Button onPress={() => setRequestOpen(true)}>Solicitar vacaciones</Button>
      <FormDialog
        open={requestOpen}
        onOpenChange={(open) => {
          setRequestOpen(open)
          if (!open) {
            setStartDate('')
            setEndDate('')
            setComment('')
          }
        }}
        title="Solicitar vacaciones"
        submitLabel={submit.isPending ? 'Enviando…' : 'Enviar solicitud'}
        submitDisabled={!tenantId}
        isSubmitting={submit.isPending}
        isDirty={Boolean(startDate || endDate || comment)}
        onSubmit={onSubmit}
      >
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
        <label
          htmlFor="vacation-request-comment"
          className="grid gap-1.5 text-sm font-medium sm:col-span-2"
        >
          <span>Comentario (opcional)</span>
          <Textarea
            id="vacation-request-comment"
            value={comment}
            maxLength={1000}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
      </FormDialog>

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
          <div key={request.id} id={`vacation-request-${request.id}`}>
            <VacationRequestCard request={request} />
          </div>
        ))}
      </section>
    </div>
  )
}
