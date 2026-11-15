import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { TextareaField, TextField } from '@/shared/ui/form'

import { updateDraftContractDetails, type ServiceContract } from '../application/contract-actions'
import { contractDatesError } from '../domain/weekly-schedule'

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
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  const dateError = contractDatesError(startsOn, endsOn)
  async function save() {
    if (busy || dateError) return
    const payload = { startsOn, endsOn, renewal: contract.renewal_mode, notes }
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
    <form
      className="bg-muted/40 grid gap-4 rounded-xl p-4 sm:grid-cols-2 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2">
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
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" isDisabled={busy || Boolean(dateError)}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {onCancel ? (
          <Button variant="outline" isDisabled={busy} onPress={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  )
}
