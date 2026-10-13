import { useState } from 'react'

import type { Client } from '@/shared/domain/types'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextField, TextareaField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { createClient, updateClient, type ClientInput } from '../application/client-actions'

const empty: ClientInput = { name: '', taxId: '', email: '', phone: '', address: '', notes: '' }

type Props = {
  open: boolean
  /** Client being edited. Leave out to create a new one. */
  client?: Client | null
  onClose: () => void
  /** Called with the id of the client that was created or edited. */
  onSaved?: (clientId: string) => void
}

/** Create/edit client dialog, reusable from any page (e.g. while writing an estimate). */
export function ClientFormDialog({ open, ...rest }: Props) {
  return open ? <ClientForm {...rest} /> : null
}

function ClientForm({ client, onClose, onSaved }: Omit<Props, 'open'>) {
  const [form, setForm] = useState<ClientInput>(() =>
    client
      ? {
          name: client.name,
          taxId: client.taxId,
          email: client.email,
          phone: client.phone,
          address: client.address,
          notes: client.notes,
        }
      : empty,
  )
  const set = (key: keyof ClientInput) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  function save() {
    const clean = { ...form, name: form.name.trim() }
    if (!clean.name) return
    let id: string
    if (client) {
      updateClient(client.id, clean)
      id = client.id
    } else {
      id = createClient(clean)
    }
    onSaved?.(id)
    onClose()
  }

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      description="Estos datos aparecen en tus presupuestos."
      submitLabel={client ? 'Guardar cambios' : 'Crear cliente'}
      submitDisabled={!form.name.trim()}
      onSubmit={save}
    >
      <TextField
        label="Nombre"
        className="sm:col-span-2"
        placeholder="Ej. Marta Soler"
        icon={fieldIcons.user}
        value={form.name}
        onChange={set('name')}
      />
      <TextField
        label="NIF / CIF"
        placeholder="12345678Z"
        icon={fieldIcons.id}
        helper="Opcional. Necesario para facturar."
        value={form.taxId}
        onChange={set('taxId')}
      />
      <TextField
        label="Teléfono"
        type="tel"
        placeholder="600 000 000"
        icon={fieldIcons.phone}
        helper="Se usa para enviar por WhatsApp."
        value={form.phone}
        onChange={set('phone')}
      />
      <TextField
        label="Email"
        type="email"
        className="sm:col-span-2"
        placeholder="cliente@ejemplo.com"
        icon={fieldIcons.mail}
        helper="Aquí se envían presupuestos y facturas."
        value={form.email}
        onChange={set('email')}
      />
      <TextField
        label="Dirección de la obra"
        className="sm:col-span-2"
        placeholder="C/ Mayor 12, 2º, Barcelona"
        icon={fieldIcons.pin}
        value={form.address}
        onChange={set('address')}
      />
      <TextareaField
        label="Notas"
        className="sm:col-span-2"
        placeholder="Preferencias, horarios, acceso a la obra…"
        value={form.notes}
        onChange={set('notes')}
      />
    </FormDialog>
  )
}
