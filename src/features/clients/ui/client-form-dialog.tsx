import { Button } from '@doscientos/ui'
import { Link, useBlocker } from '@tanstack/react-router'
import { useRef, useState, type RefObject } from 'react'

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
  return open ? <ClientForm {...rest} variant="dialog" /> : null
}

export function ClientForm({
  client,
  onClose,
  onSaved,
  variant,
}: Omit<Props, 'open'> & { variant: 'dialog' | 'page' }) {
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
  const [initialForm] = useState(() => JSON.stringify(form))
  const saved = useRef(false)
  const set = (key: keyof ClientInput) => (value: string) => {
    saved.current = false
    setForm((previous) => ({ ...previous, [key]: value }))
  }
  const duplicates = findPotentialClientDuplicates(form, clients, client?.id)
  const isDirty = JSON.stringify(form) !== initialForm

  function save() {
    if (saved.current) return
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
    saved.current = true
    onSaved?.(id)
    if (variant === 'dialog' || !onSaved) onClose()
  }

  const fields = (
    <div className="space-y-4">
      <section
        className="border-border bg-card rounded-xl border p-4 sm:p-6"
        aria-labelledby="client-identity-title"
      >
        <h2 id="client-identity-title" className="text-base font-semibold">
          Datos del cliente
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Identificación para presupuestos y facturas.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            onChange={(kind) => {
              saved.current = false
              setForm((previous) => ({
                ...previous,
                kind: kind as ClientKind,
              }))
            }}
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
        </div>
      </section>
      <section
        className="border-border bg-card rounded-xl border p-4 sm:p-6"
        aria-labelledby="client-contact-title"
      >
        <h2 id="client-contact-title" className="text-base font-semibold">
          Contacto
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Datos para comunicarse y enviar documentos.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            placeholder="cliente@ejemplo.com"
            icon={fieldIcons.mail}
            helper="Aquí se envían presupuestos y facturas."
            value={form.email}
            onChange={set('email')}
          />
        </div>
      </section>
      <section
        className="border-border bg-card rounded-xl border p-4 sm:p-6"
        aria-labelledby="client-address-title"
      >
        <h2 id="client-address-title" className="text-base font-semibold">
          Direcciones y notas
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Ubicación principal, facturación y observaciones.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Dirección principal de servicio"
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
            placeholder="Preferencias, horarios, observaciones…"
            value={form.notes}
            onChange={set('notes')}
          />
        </div>
      </section>
    </div>
  )
  const invalid = !form.name.trim() || form.name.trim().length > formLimits.clientName

  if (variant === 'page') {
    return (
      <form
        className="mx-auto grid w-full max-w-4xl gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <ClientPageNavigationGuard isDirty={isDirty} saved={saved} />
        {fields}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onPress={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isDisabled={invalid}>
            {client ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </form>
    )
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
      submitDisabled={invalid}
      isDirty={isDirty}
      onSubmit={save}
    >
      <div className="sm:col-span-2">{fields}</div>
    </FormDialog>
  )
}

function ClientPageNavigationGuard({
  isDirty,
  saved,
}: {
  isDirty: boolean
  saved: RefObject<boolean>
}) {
  useBlocker({
    shouldBlockFn: () =>
      isDirty &&
      !saved.current &&
      !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?'),
    enableBeforeUnload: () => isDirty && !saved.current,
  })
  return null
}
