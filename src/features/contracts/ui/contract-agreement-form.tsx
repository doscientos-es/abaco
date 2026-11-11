import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

import { updateDraftContractDetails, type ServiceContract } from '../application/contract-actions'
import { contractDatesError } from '../domain/weekly-schedule'

export function ContractAgreementForm({ contract }: { contract: ServiceContract }) {
  const cache = useQueryClient()
  const [startsOn, setStartsOn] = useState(contract.starts_on)
  const [endsOn, setEndsOn] = useState(contract.ends_on ?? '')
  const [renewal, setRenewal] = useState(contract.renewal_mode)
  const [notes, setNotes] = useState(contract.notes)
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  const dateError = contractDatesError(startsOn, endsOn)
  async function save() {
    if (busy || dateError) return
    const payload = { startsOn, endsOn, renewal, notes }
    const key = JSON.stringify(payload)
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    setBusy(true)
    try {
      await updateDraftContractDetails({ contract, ...payload, operationId: operation })
      await cache.invalidateQueries({
        queryKey: ['service-contract', contract.tenant_id, contract.id],
      })
      await cache.invalidateQueries({ queryKey: ['service-contracts', contract.tenant_id] })
      toast.success('Datos del contrato guardados')
    } catch (error) {
      toast.error('No se pudo guardar el contrato', {
        description: error instanceof Error ? error.message : 'Reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <p className="text-muted-foreground text-sm sm:col-span-2">
        Confirma la vigencia antes de configurar los trabajos. La fecha inicial provisional es la de
        aceptación; el precio y el alcance proceden de la versión aceptada.
      </p>
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
      <SelectField
        label="Renovación"
        value={renewal}
        onChange={(value) => setRenewal(value as ServiceContract['renewal_mode'])}
        options={[
          { value: 'pending', label: 'Pendiente de acordar' },
          { value: 'manual', label: 'Manual' },
          { value: 'automatic', label: 'Automática, según acuerdo' },
        ]}
      />
      <TextareaField
        label="Observaciones generales"
        value={notes}
        onChange={setNotes}
        maxLength={5000}
        placeholder="Coordinar el acceso con recepción"
      />
      {dateError ? (
        <p className="text-muted-foreground text-sm sm:col-span-2">{dateError}</p>
      ) : null}
      <Button type="submit" isDisabled={busy || Boolean(dateError)}>
        {busy ? 'Guardando…' : 'Guardar datos del contrato'}
      </Button>
    </form>
  )
}
