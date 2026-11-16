import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  RelatedCreateButton,
  useRelatedRecordCreation,
} from '@/features/clients/ui/related-record-creation'
import {
  staffFunctionsQuery,
  staffSchedulesQuery,
} from '@/features/staff-schedules/application/staff-schedule-actions'
import { listTechnicians } from '@/features/visits/application/visit-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

import { updateContractGeneralDetails, type ServiceContract } from '../application/contract-actions'
import { contractDatesError } from '../domain/weekly-schedule'
import { ContractResponsiblePicker } from './contract-responsible-picker'

export function ContractAgreementForm({
  contract,
  onSaved,
  onCancel,
}: {
  contract: ServiceContract
  onSaved?: () => void
  onCancel?: () => void
}) {
  const cache = useQueryClient()
  const [startsOn, setStartsOn] = useState(contract.starts_on)
  const [endsOn, setEndsOn] = useState(contract.ends_on ?? '')
  const [notes, setNotes] = useState(contract.notes)
  const [locationId, setLocationId] = useState(contract.location_id ?? '')
  const [functionId, setFunctionId] = useState('')
  const [selection, setSelection] = useState({
    people: contract.assigned_user_ids,
    team: contract.work_team_id,
  })
  const [busy, setBusy] = useState(false)
  const [preferredStart, setPreferredStart] = useState(
    (contract.preferred_start ?? '09:00').slice(0, 5),
  )
  const operations = useRef(new Map<string, string>())
  const targets = useQuery({
    queryKey: ['work-target-options', contract.tenant_id, contract.client_id],
    queryFn: () => loadWorkTargetOptions(contract.tenant_id, contract.client_id),
  })
  const people = useQuery({
    queryKey: ['technicians', contract.tenant_id],
    queryFn: () => listTechnicians(contract.tenant_id),
  })
  const functions = useQuery(staffFunctionsQuery(contract.tenant_id))
  const schedules = useQuery(staffSchedulesQuery(contract.tenant_id))
  const related = useRelatedRecordCreation({
    tenantId: contract.tenant_id,
    clientId: contract.client_id,
    onLocationCreated: setLocationId,
  })
  const dateError = contractDatesError(startsOn, endsOn)
  const timeError = !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(preferredStart)
  const validLocation =
    targets.isSuccess && targets.data.locations.some((item) => item.id === locationId)
  const functionPeople = functionId
    ? new Set(
        (schedules.data ?? [])
          .filter((item) => item.functionIds.includes(functionId))
          .map((item) => item.userId),
      )
    : null
  const visiblePeople = (people.data ?? []).filter(
    (person) => !functionPeople || functionPeople.has(person.id),
  )
  async function save() {
    if (busy || dateError || timeError || !validLocation || related.pending || !people.isSuccess)
      return
    const payload = {
      startsOn,
      endsOn,
      preferredStart,
      renewal: contract.renewal_mode,
      notes,
      locationId,
      ...selection,
    }
    const key = JSON.stringify(payload)
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    setBusy(true)
    try {
      await updateContractGeneralDetails({ contract, ...payload, operationId: operation })
      await cache.invalidateQueries({
        queryKey: ['service-contract', contract.tenant_id, contract.id],
      })
      await cache.invalidateQueries({ queryKey: ['service-contracts', contract.tenant_id] })
      await cache.invalidateQueries({
        queryKey: ['cleaning-services', contract.tenant_id, contract.id],
      })
      await cache.invalidateQueries({ queryKey: ['contract-jobs', contract.tenant_id] })
      await cache.invalidateQueries({
        queryKey: ['contract-assignment-setup', contract.tenant_id, contract.id],
      })
      toast.success('Datos del contrato guardados')
      onSaved?.()
    } catch (error) {
      toast.error('No se pudo guardar el contrato', {
        description: error instanceof Error ? error.message : 'Reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <form
        className="bg-muted/40 grid gap-4 rounded-xl p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <SelectField
              label="Centro · obligatorio"
              value={locationId}
              options={[
                { value: '', label: 'Selecciona un centro' },
                ...(targets.data?.locations ?? []).map((location) => ({
                  value: location.id,
                  label: location.name,
                })),
              ]}
              onChange={setLocationId}
              isDisabled={!targets.isSuccess || related.pending}
            />
            {related.allowed ? (
              <RelatedCreateButton
                label="Crear centro"
                disabled={busy || related.pending}
                onPress={() => related.start('location')}
              />
            ) : null}
            {targets.isError ? (
              <p role="alert">
                No se pudieron cargar los centros.{' '}
                <Button type="button" variant="outline" onPress={() => void targets.refetch()}>
                  Reintentar
                </Button>
              </p>
            ) : null}
            {targets.isSuccess && locationId && !validLocation ? (
              <p role="alert">El centro seleccionado no está disponible.</p>
            ) : null}
            {related.status}
          </div>
          <SelectField
            label="Función"
            value={functionId}
            isDisabled={!functions.isSuccess || !schedules.isSuccess}
            options={[
              { value: '', label: 'Todas las funciones' },
              ...(functions.data ?? []).map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={setFunctionId}
            className="sm:col-span-2"
          />
        </fieldset>
        {functions.isError || schedules.isError ? (
          <p role="alert" className="text-sm sm:col-span-2">
            No se pudieron cargar las funciones de los trabajadores.{' '}
            <Button
              type="button"
              variant="outline"
              onPress={() => {
                void functions.refetch()
                void schedules.refetch()
              }}
            >
              Reintentar
            </Button>
          </p>
        ) : null}
        <ContractResponsiblePicker
          people={people.data ?? []}
          visiblePeople={visiblePeople}
          selected={selection}
          disabled={busy || !people.isSuccess || (Boolean(functionId) && !schedules.isSuccess)}
          onChange={setSelection}
        />
        {selection.people.length > 1 ? (
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Los trabajos comparten todas las personas. Cada visita generada se asigna solo a la
            primera persona.
          </p>
        ) : null}
        {people.isError ? (
          <p role="alert" className="sm:col-span-2">
            No se pudieron cargar los responsables.{' '}
            <Button type="button" variant="outline" onPress={() => void people.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        <fieldset
          disabled={busy || contract.status !== 'draft'}
          className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2"
        >
          <TextField
            label="Fecha de inicio · obligatoria"
            type="date"
            value={startsOn}
            onChange={setStartsOn}
            placeholder="Inicio"
          />
          <TextField
            label="Fecha de fin · obligatoria"
            type="date"
            value={endsOn}
            onChange={setEndsOn}
            placeholder="Fin del contrato"
          />
          <TextField
            label="Hora preferente · obligatoria"
            type="time"
            value={preferredStart}
            onChange={setPreferredStart}
            placeholder="09:00"
          />
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Se comparte entre todos los trabajos. Las visitas ya generadas no cambian.
          </p>
          <TextareaField
            label="Notas (opcional)"
            value={notes}
            onChange={setNotes}
            maxLength={5000}
            placeholder="Coordinar el acceso con recepción"
          />
        </fieldset>
        {dateError ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {dateError}
          </p>
        ) : null}
        {timeError ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            Indica la hora preferente del contrato.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="submit"
            isDisabled={
              busy ||
              Boolean(dateError) ||
              timeError ||
              !validLocation ||
              related.pending ||
              !people.isSuccess
            }
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          {onCancel ? (
            <Button variant="outline" isDisabled={busy} onPress={onCancel}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>
      {related.dialogs}
    </>
  )
}
