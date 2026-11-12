import { Button, ConfirmDialog, IconButton } from '@doscientos/ui'
import { PencilSimple, Trash } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { TextField } from '@/shared/ui/form'

import {
  deleteStaffFunction,
  saveStaffFunction,
  staffFunctionsQuery,
} from '../application/staff-schedule-actions'
import type { StaffFunction } from '../domain/staff-schedule'

export function StaffFunctionsSection({ tenantId }: { tenantId: string }) {
  const query = useQuery(staffFunctionsQuery(tenantId))
  const client = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<StaffFunction | null>(null)
  const [removing, setRemoving] = useState<StaffFunction | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      await client.invalidateQueries({ queryKey: staffFunctionsQuery(tenantId).queryKey })
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el cambio.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="border-border bg-card space-y-4 rounded-lg border p-5"
      aria-labelledby="staff-functions-heading"
    >
      <div>
        <h2 id="staff-functions-heading" className="font-semibold">
          Funciones del equipo
        </h2>
        <p className="text-muted-foreground text-sm">
          Capacidades asignables a las personas, independientes de sus permisos de acceso.
        </p>
      </div>
      {query.isPending ? <p>Cargando funciones…</p> : null}
      {query.isError ? <p role="alert">No se pudieron cargar las funciones.</p> : null}
      {query.isSuccess ? (
        <>
          <ul className="divide-border divide-y">
            {query.data.map((item) => (
              <li className="flex flex-wrap items-center gap-2 py-2" key={item.id}>
                <span className="flex-1">{item.name}</span>
                <IconButton
                  label={`Renombrar ${item.name}`}
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => {
                    setEditing(item)
                    setName(item.name)
                  }}
                >
                  <PencilSimple aria-hidden="true" className="size-4" />
                </IconButton>
                <IconButton
                  label={`Eliminar ${item.name}`}
                  variant="ghost"
                  className="text-destructive"
                  isDisabled={busy}
                  onPress={() => setRemoving(item)}
                >
                  <Trash aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const value = name.trim()
              if (value && value.length <= 80 && !busy)
                void run(() => saveStaffFunction(tenantId, editing?.id ?? null, value)).then(
                  (ok) => {
                    if (ok) {
                      setName('')
                      setEditing(null)
                    }
                  },
                )
            }}
          >
            <TextField
              label={editing ? 'Nuevo nombre' : 'Nueva función'}
              placeholder="Ej. Electricidad"
              value={name}
              onChange={setName}
              maxLength={80}
            />
            <Button type="submit" isDisabled={busy || !name.trim()}>
              {editing ? 'Guardar' : 'Añadir'}
            </Button>
            {editing ? (
              <Button
                variant="outline"
                onPress={() => {
                  setEditing(null)
                  setName('')
                }}
              >
                Cancelar
              </Button>
            ) : null}
          </form>
        </>
      ) : null}
      {message ? (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="¿Eliminar función?"
        description={removing ? `Se eliminará «${removing.name}» si no está asignada.` : ''}
        confirmLabel="Eliminar"
        destructive
        pending={busy}
        onConfirm={() => {
          if (removing)
            void run(() => deleteStaffFunction(tenantId, removing.id)).then((ok) => {
              if (ok) setRemoving(null)
            })
        }}
      />
    </section>
  )
}
