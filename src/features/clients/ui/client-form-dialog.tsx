import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { formLimits } from '@/shared/domain/form-limits'
import type { Client, ClientKind } from '@/shared/domain/types'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField, TextareaField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { createClient, updateClient, type ClientInput } from '../application/client-actions'
import { findPotentialClientDuplicates } from '../application/client-duplicates'

const empty: ClientInput = {
  name: '',
  kind: 'person',
  taxId: '',
  email: '',
  phone: '',
  address: '',
  billingAddress: '',
  notes: '',
}

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
  const { clients } = useTenantData()
  const [form, setForm] = useState<ClientInput>(() =>
    client
      ? {
          name: client.name,
          kind: client.kind ?? 'person',
          taxId: client.taxId,
          email: client.email,
          phone: client.phone,
          address: client.address,
          billingAddress: client.billingAddress ?? '',
          notes: client.notes,
        }
      : empty,
  )
  const set = (key: keyof ClientInput) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))
  const duplicates = findPotentialClientDuplicates(form, clients, client?.id)

  function save() {
    const clean = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    ) as ClientInput
    if (!clean.name || clean.name.length > formLimits.clientName) return
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
      submitDisabled={!form.name.trim() || form.name.trim().length > formLimits.clientName}
      onSubmit={save}
    >
      <TextField
        label="Nombre"
        minLength={1}
        maxLength={formLimits.clientName}
        helper={`Obligatorio · máximo ${formLimits.clientName} caracteres.`}
        className="sm:col-span-2"
        placeholder="Ej. Marta Soler"
        icon={fieldIcons.user}
        value={form.name}
        onChange={set('name')}
      />
      {duplicates.length ? (
        <div
          aria-live="polite"
          className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-sm sm:col-span-2"
        >
          <p className="font-medium">Posibles clientes duplicados</p>
          <ul className="mt-1 list-inside list-disc">
            {duplicates.map(({ client: match, reasons }) => (
              <li key={match.id}>
                <Link
                  to="/clientes/$clientId"
                  params={{ clientId: match.id }}
                  className="text-primary underline"
                >
                  {match.name}
                </Link>{' '}
                ({reasons.join(', ')}){match.archivedAt ? ' · archivado' : ''}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-1">
            Revísalos antes de crear otra ficha. Puedes continuar si son personas distintas.
          </p>
        </div>
      ) : null}
      <SelectField
        label="Tipo de cliente"
        value={form.kind ?? 'person'}
        options={[
          { value: 'person', label: 'Particular' },
          { value: 'community', label: 'Comunidad' },
          { value: 'business', label: 'Empresa' },
        ]}
        onChange={(kind) =>
          setForm((previous) => ({
            ...previous,
            kind: kind as ClientKind,
          }))
        }
      />
      <TextField
        label="NIF / CIF"
        maxLength={formLimits.taxId}
        placeholder="12345678Z"
        icon={fieldIcons.id}
        helper="Opcional. Necesario para facturar."
        value={form.taxId}
        onChange={set('taxId')}
      />
      <TextField
        label="Teléfono"
        maxLength={formLimits.phone}
        type="tel"
        placeholder="600 000 000"
        icon={fieldIcons.phone}
        helper="Se usa para enviar por WhatsApp."
        value={form.phone}
        onChange={set('phone')}
      />
      <TextField
        label="Email"
        maxLength={formLimits.email}
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
        maxLength={formLimits.address}
        className="sm:col-span-2"
        placeholder="C/ Mayor 12, 2º, Barcelona"
        icon={fieldIcons.pin}
        value={form.address}
        onChange={set('address')}
      />
      <TextField
        label="Dirección de facturación"
        maxLength={formLimits.address}
        className="sm:col-span-2"
        placeholder="Si es distinta de la ubicación de servicio"
        icon={fieldIcons.pin}
        value={form.billingAddress ?? ''}
        onChange={set('billingAddress')}
      />
      <TextareaField
        label="Notas"
        maxLength={formLimits.notes}
        className="sm:col-span-2"
        placeholder="Preferencias, horarios, acceso a la obra…"
        value={form.notes}
        onChange={set('notes')}
      />
    </FormDialog>
  )
}
