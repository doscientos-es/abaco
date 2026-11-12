import { Button, ConfirmDialog } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useTenantData } from '@/shared/store/store'
import { TextField } from '@/shared/ui/form'

import {
  addClientType,
  clientTypesQuery,
  deleteClientType,
  moveClientType,
  renameClientType,
  type ClientType,
} from '../application/client-types'

export function ClientTypesSection({ tenantId }: { tenantId: string }) {
  const { clients } = useTenantData()
  const queryClient = useQueryClient()
  const types = useQuery(clientTypesQuery(tenantId))
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<ClientType | null>(null)
  const [removing, setRemoving] = useState<ClientType | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      try {
        await queryClient.invalidateQueries(
          { queryKey: clientTypesQuery(tenantId).queryKey },
          { throwOnError: true },
        )
      } catch {
        setMessage('Cambio guardado, pero no se pudo actualizar la lista. Recarga la página.')
      }
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el cambio.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const label = name.trim()
    if (!label || label.length > 80 || busy) return
    const position = Math.max(0, ...(types.data ?? []).map((item) => item.position)) + 1
    const ok = await run(() =>
      editing
        ? renameClientType(tenantId, editing.id, label)
        : addClientType(tenantId, label, position),
    )
    if (ok) {
      setEditing(null)
      setName('')
    }
  }

  return (
    <section
      className="border-border bg-card space-y-4 rounded-lg border p-5"
      aria-labelledby="client-types-heading"
    >
      <div>
        <h2 id="client-types-heading" className="font-semibold">
          Tipos de cliente
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Define las opciones para los clientes de esta empresa. No se pueden eliminar tipos en uso,
          incluidos los de clientes archivados.
        </p>
      </div>
      {types.isPending ? <p className="text-sm">Cargando tipos…</p> : null}
      {types.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los tipos de cliente.
        </p>
      ) : null}
      {types.isSuccess ? (
        <>
          <ul className="divide-border divide-y">
            {types.data.map((item, index) => {
              const count = clients.filter((client) => client.kind === item.value).length
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 py-3">
                  <span className="min-w-32 flex-1 text-sm font-medium">{item.label}</span>
                  {count ? (
                    <span className="text-muted-foreground text-xs">
                      En uso por {count} {count === 1 ? 'cliente' : 'clientes'}
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busy || index === 0}
                    aria-label={`Subir ${item.label}`}
                    onPress={() => void run(() => moveClientType(tenantId, item.id, -1))}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busy || index === types.data.length - 1}
                    aria-label={`Bajar ${item.label}`}
                    onPress={() => void run(() => moveClientType(tenantId, item.id, 1))}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => {
                      setEditing(item)
                      setName(item.label)
                      setMessage(null)
                    }}
                  >
                    Renombrar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busy || count > 0}
                    aria-label={`Eliminar ${item.label}`}
                    onPress={() => setRemoving(item)}
                  >
                    Eliminar
                  </Button>
                </li>
              )
            })}
          </ul>
          {!types.data.length ? (
            <p className="text-muted-foreground text-sm">
              Añade un tipo para poder crear o importar clientes.
            </p>
          ) : null}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <TextField
              label={editing ? 'Nuevo nombre' : 'Nuevo tipo de cliente'}
              placeholder="Ej. Hotel"
              maxLength={80}
              value={name}
              onChange={setName}
            />
            <Button type="submit" isDisabled={busy || !name.trim() || name.trim().length > 80}>
              {editing ? 'Guardar' : 'Añadir'}
            </Button>
            {editing ? (
              <Button
                variant="outline"
                isDisabled={busy}
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
        <output aria-live="polite" className="text-sm">
          {message}
        </output>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="¿Eliminar tipo de cliente?"
        description={removing ? `Se eliminará «${removing.label}» de esta empresa.` : ''}
        confirmLabel="Eliminar"
        destructive
        pending={busy}
        onConfirm={() => {
          if (removing)
            void run(() => deleteClientType(tenantId, removing.id)).then(() => {
              setRemoving(null)
            })
        }}
      />
    </section>
  )
}
