import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  DEFAULT_VACATION_ALLOWANCE,
  saveVacationAllowance,
  validVacationAllowance,
  vacationAllowancesQuery,
} from '../application/vacation-allowance-actions'

export function WorkerVacationAllowance({
  tenantId,
  workerId,
}: {
  tenantId: string
  workerId: string
}) {
  const query = useQuery(vacationAllowancesQuery(tenantId))
  const cache = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!validVacationAllowance(draft) || busy) return
    setBusy(true)
    setError('')
    try {
      await saveVacationAllowance(tenantId, workerId, Number(draft))
      await cache.invalidateQueries({ queryKey: vacationAllowancesQuery(tenantId).queryKey })
      setEditing(false)
    } catch {
      setError('No se pudo guardar el cupo. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (query.isPending) return <p className="text-muted-foreground text-sm">Cargando vacaciones…</p>
  if (query.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        No se pudo cargar el cupo de vacaciones.
      </p>
    )
  const days =
    query.data.find((item) => item.worker_id === workerId)?.annual_days ??
    DEFAULT_VACATION_ALLOWANCE
  return (
    <section aria-label="Cupo de vacaciones" className="space-y-3">
      <h3 className="text-sm font-semibold">Vacaciones</h3>
      <p className="text-sm">
        Cupo anual: <strong>{days} días</strong>
      </p>
      <Button
        variant="outline"
        onPress={() => {
          setDraft(String(days))
          setError('')
          setEditing(true)
        }}
      >
        Editar cupo de vacaciones
      </Button>
      <FormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Cupo de vacaciones"
        description="Configura los días de vacaciones anuales de esta persona."
        submitLabel="Guardar"
        submitDisabled={!validVacationAllowance(draft)}
        isSubmitting={busy}
        isDirty={draft !== String(days)}
        onSubmit={() => void save()}
      >
        <TextField
          label="Días de vacaciones al año"
          type="number"
          min={0}
          max={366}
          step={1}
          placeholder="23"
          value={draft}
          onChange={setDraft}
          required
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </FormDialog>
    </section>
  )
}
