import { Button, Textarea, toast } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useSession } from '@/features/auth'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  listVacationRequests,
  respondAbsenceInformation,
  submitVacationRequest,
} from '../application/vacation-actions'
import {
  absenceTypeLabels,
  absenceTypes,
  isValidAbsencePeriod,
  type AbsenceType,
} from '../domain/vacation-request'
import { VacationDecisionNotices } from './vacation-decision-notices'
import { VacationRequestCard } from './vacation-request-card'

const requestQueryKey = (tenantId: string | null | undefined) => ['vacation-requests', tenantId]

export function MyVacationRequestsPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [requestOpen, setRequestOpen] = useState(false)
  const [absenceType, setAbsenceType] = useState<AbsenceType>('vacation')
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
      return submitVacationRequest({ tenantId, absenceType, startDate, endDate, comment })
    },
    onSuccess: async () => {
      setStartDate('')
      setEndDate('')
      setAbsenceType('vacation')
      setComment('')
      setRequestOpen(false)
      await queryClient.invalidateQueries({ queryKey: requestQueryKey(tenantId) })
      toast.success('Solicitud enviada')
    },
    onError: (error: Error) =>
      toast.error('No se pudo enviar la solicitud', { description: error.message }),
  })
  const respond = useMutation({
    mutationFn: (input: { requestId: string; comment: string }) => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return respondAbsenceInformation({ tenantId, ...input })
    },
    onSuccess: async () => {
      if (tenantId) await queryClient.invalidateQueries({ queryKey: requestQueryKey(tenantId) })
      toast.success('Información enviada a administración')
    },
    onError: (error: Error) =>
      toast.error('No se pudo enviar la información', { description: error.message }),
  })

  function onSubmit() {
    if (!isValidAbsencePeriod(startDate, endDate) || (absenceType === 'vacation' && !endDate)) {
      toast.error('Revisa las fechas', {
        description:
          absenceType === 'vacation'
            ? 'Para las vacaciones, indica una fecha final igual o posterior a la inicial.'
            : 'La fecha final debe ser igual o posterior a la inicial, o dejarse vacía si aún no se conoce.',
      })
      return
    }
    submit.mutate()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="bg-muted/30 flex flex-col gap-5 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Tu tiempo, bien organizado
          </p>
          <h1 className="text-2xl font-semibold">Mis ausencias</h1>
          <p className="text-muted-foreground max-w-xl text-sm">
            Pide vacaciones, comunica una baja o solicita un permiso. Aquí podrás seguir cada
            solicitud y consultar la respuesta de administración.
          </p>
        </div>
        <Button onPress={() => setRequestOpen(true)}>Solicitar ausencia</Button>
      </header>

      {tenantId ? <VacationDecisionNotices tenantId={tenantId} /> : null}

      <FormDialog
        open={requestOpen}
        onOpenChange={(open) => {
          setRequestOpen(open)
          if (!open) {
            setStartDate('')
            setEndDate('')
            setAbsenceType('vacation')
            setComment('')
          }
        }}
        title="Solicitar ausencia"
        submitLabel={submit.isPending ? 'Enviando…' : 'Enviar solicitud'}
        submitDisabled={!tenantId}
        isSubmitting={submit.isPending}
        isDirty={Boolean(startDate || endDate || comment)}
        onSubmit={onSubmit}
      >
        <label className="grid gap-1.5 text-sm font-medium">
          Tipo de ausencia
          <select
            value={absenceType}
            onChange={(event) => setAbsenceType(event.target.value as AbsenceType)}
            className="border-input bg-background min-h-10 rounded-md border px-3"
          >
            {absenceTypes.map((type) => (
              <option key={type} value={type}>
                {absenceTypeLabels[type]}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs font-normal">
            Elige la opción que mejor describa tu solicitud. No incluyas información médica privada.
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Desde
          <input
            required
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="border-input bg-background min-h-10 rounded-md border px-3"
          />
          <span className="text-muted-foreground text-xs font-normal">
            {absenceType === 'vacation'
              ? 'Indica el primer día que estarás ausente.'
              : 'Si aún no conoces cuándo empieza, consulta con administración antes de enviarla.'}
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Hasta, incluido
          {absenceType === 'vacation' ? '' : ' (opcional si no se conoce)'}
          <input
            required={absenceType === 'vacation'}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="border-input bg-background min-h-10 rounded-md border px-3"
          />
          <span className="text-muted-foreground text-xs font-normal">
            {absenceType === 'sick_leave'
              ? 'Si todavía no sabes cuándo volverás, puedes dejar esta fecha vacía.'
              : 'La fecha final se incluye en la solicitud.'}
          </span>
        </label>
        <label
          htmlFor="vacation-request-comment"
          className="grid gap-1.5 text-sm font-medium sm:col-span-2"
        >
          <span>Comentario para administración (opcional)</span>
          <Textarea
            id="vacation-request-comment"
            value={comment}
            maxLength={1000}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Añade solo la información necesaria para tramitar la solicitud."
          />
        </label>
      </FormDialog>

      <section className="space-y-3" aria-labelledby="my-vacation-history-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="my-vacation-history-title" className="text-lg font-semibold">
              Mis solicitudes
            </h2>
            <p className="text-muted-foreground text-sm">
              Revisa su estado y la respuesta de administración.
            </p>
          </div>
          {requests.data?.length ? (
            <p className="text-muted-foreground text-sm">
              {requests.data.filter((request) => request.status === 'pending').length} pendientes ·{' '}
              {requests.data.filter((request) => request.status === 'approved').length} aprobadas
            </p>
          ) : null}
        </div>
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
            <VacationRequestCard request={request}>
              {request.status === 'needs_info' ? (
                <InformationResponseForm
                  disabled={respond.isPending}
                  onRespond={(comment) => respond.mutate({ requestId: request.id, comment })}
                />
              ) : null}
            </VacationRequestCard>
          </div>
        ))}
      </section>
    </div>
  )
}

function InformationResponseForm({
  disabled,
  onRespond,
}: {
  disabled: boolean
  onRespond: (comment: string) => void
}) {
  const [comment, setComment] = useState('')
  const fieldId = useId()
  return (
    <div className="border-border space-y-3 border-t pt-3">
      <label htmlFor={fieldId} className="grid gap-1.5 text-sm font-medium">
        <span>Tu respuesta</span>
        <Textarea
          id={fieldId}
          value={comment}
          maxLength={1000}
          rows={3}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Responde solo con la información necesaria para tramitar la solicitud."
        />
      </label>
      <Button isDisabled={disabled || !comment.trim()} onPress={() => onRespond(comment)}>
        Enviar información
      </Button>
    </div>
  )
}
