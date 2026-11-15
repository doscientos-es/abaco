import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  saveWorkerPersonalData,
  workerPersonalDataQuery,
  type WorkerPersonalData,
} from '../application/worker-personal-data-actions'
import {
  MAX_WORKER_FIELD_LENGTH,
  validWorkerDni,
  validWorkerPhone,
} from '../domain/worker-personal-data'

export function WorkerPersonalDataSection({
  tenantId,
  workerId,
}: {
  tenantId: string
  workerId: string
}) {
  const query = useQuery(workerPersonalDataQuery(tenantId, workerId))
  const cache = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<WorkerPersonalData>({ dni: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!validWorkerDni(draft.dni) || !validWorkerPhone(draft.phone) || busy) return
    setBusy(true)
    setError('')
    try {
      await saveWorkerPersonalData(tenantId, workerId, draft)
      await cache.invalidateQueries({
        queryKey: workerPersonalDataQuery(tenantId, workerId).queryKey,
      })
      setEditing(false)
    } catch {
      setError('No se pudieron guardar los datos. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (query.isPending)
    return <p className="text-muted-foreground text-sm">Cargando datos personales…</p>
  if (query.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        No se pudieron cargar los datos personales.
      </p>
    )
  const data = query.data
  return (
    <section aria-label="Datos personales" className="space-y-3">
      <h3 className="text-sm font-semibold">Datos personales</h3>
      {!data.dni.trim() ? (
        <p role="alert" className="text-sm text-amber-700">
          Falta el DNI de este trabajador. Completa su ficha.
        </p>
      ) : null}
      <p className="text-sm">DNI: {data.dni || 'Sin indicar'}</p>
      <p className="text-sm">Teléfono: {data.phone || 'Sin indicar'}</p>
      <Button
        variant="outline"
        onPress={() => {
          setDraft(data)
          setError('')
          setEditing(true)
        }}
      >
        Editar datos personales
      </Button>
      <FormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Datos personales"
        description="Completa los datos del trabajador."
        submitLabel="Guardar"
        submitDisabled={!validWorkerDni(draft.dni) || !validWorkerPhone(draft.phone)}
        isSubmitting={busy}
        isDirty={draft.dni !== data.dni || draft.phone !== data.phone}
        onSubmit={() => void save()}
      >
        <TextField
          label="DNI"
          placeholder="12345678Z"
          value={draft.dni}
          onChange={(dni) => setDraft({ ...draft, dni })}
          maxLength={MAX_WORKER_FIELD_LENGTH}
          required
        />
        <TextField
          label="Teléfono (opcional)"
          type="tel"
          placeholder="600 123 456"
          value={draft.phone}
          onChange={(phone) => setDraft({ ...draft, phone })}
          maxLength={MAX_WORKER_FIELD_LENGTH}
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
