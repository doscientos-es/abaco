import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

import type { ServiceContract } from '../infrastructure/contract-repository'

export function ContractAgreementForm({ contract }: { contract: ServiceContract }) {
  const cache = useQueryClient()
  const [startsOn, setStartsOn] = useState(contract.starts_on)
  const [endsOn, setEndsOn] = useState(contract.ends_on ?? '')
  const [renewal, setRenewal] = useState(contract.renewal_mode)
  const [notes, setNotes] = useState(contract.notes)
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  async function save() {
    if (busy || !startsOn || (endsOn && endsOn < startsOn)) return
    const payload = { startsOn, endsOn, renewal, notes }
    const key = JSON.stringify(payload)
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    setBusy(true)
    try {
      const { error } = await createBrowserSupabaseClient().rpc('update_draft_contract_details', {
        p_tenant_id: contract.tenant_id, p_contract_id: contract.id,
        p_expected_updated_at: contract.updated_at, p_starts_on: startsOn,
        p_ends_on: endsOn || null, p_renewal_mode: renewal, p_notes: notes,
        p_operation_id: operation,
      })
      if (error) throw new Error(error.message)
      await cache.invalidateQueries({ queryKey: ['service-contract', contract.tenant_id, contract.id] })
      await cache.invalidateQueries({ queryKey: ['service-contracts', contract.tenant_id] })
      toast.success('Datos del contrato guardados')
    } catch (error) {
      toast.error('No se pudo guardar el contrato', { description: error instanceof Error ? error.message : 'Reintenta.' })
    } finally { setBusy(false) }
  }
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <p className="text-muted-foreground text-sm sm:col-span-2">
        Confirma la vigencia antes de configurar los trabajos. La fecha inicial provisional es la de aceptación; el precio y el alcance proceden de la versión aceptada.
      </p>
      <TextField label="Fecha de inicio" type="date" value={startsOn} onChange={setStartsOn} placeholder="Inicio" />
      <TextField label="Fecha de fin, si está acordada" type="date" value={endsOn} onChange={setEndsOn} placeholder="Sin fecha de fin" />
      <SelectField label="Renovación" value={renewal} onChange={(value) => setRenewal(value as ServiceContract['renewal_mode'])}
        options={[{ value: 'pending', label: 'Pendiente de acordar' }, { value: 'manual', label: 'Manual' }, { value: 'automatic', label: 'Automática, según acuerdo' }]} />
      <TextareaField label="Observaciones generales" value={notes} onChange={setNotes} maxLength={5000} placeholder="Coordinar el acceso con recepción" />
      <Button type="submit" isDisabled={busy || !startsOn || Boolean(endsOn && endsOn < startsOn)}>{busy ? 'Guardando…' : 'Guardar datos del contrato'}</Button>
    </form>
  )
}