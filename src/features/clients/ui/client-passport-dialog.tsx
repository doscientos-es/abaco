import { toast } from '@doscientos/ui'
import { useState, type ReactNode } from 'react'

import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createContact,
  createLocation,
  updateContact,
  updateLocation,
  type ClientPassport,
} from '../application/client-passport-actions'
import { locationInput, validLocationInput } from '../domain/client-location'
import { LocationFields } from './location-fields'

export type NewItem =
  | { kind: 'contact' }
  | { kind: 'location' }
  | { kind: 'editContact'; contact: ClientPassport['contacts'][number] }
  | { kind: 'editLocation'; location: ClientPassport['locations'][number] }

export const contactRoles = [
  { value: 'primary', label: 'Principal' },
  { value: 'administrative', label: 'Administración' },
  { value: 'technical', label: 'Técnico' },
  { value: 'other', label: 'Otro' },
]
export function CreatePassportItem({
  item,
  tenantId,
  clientId,
  onClose,
  onCreated,
  onError,
  serviceLocationOnly = false,
  status,
  submitBlocked = false,
}: {
  item: NewItem
  tenantId: string
  clientId: string
  onClose: () => void
  onCreated: (id?: string) => void
  onError: () => void
  serviceLocationOnly?: boolean
  status?: ReactNode
  submitBlocked?: boolean
}) {
  const contact = item.kind === 'editContact' ? item.contact : undefined
  const location = item.kind === 'editLocation' ? item.location : undefined
  const isContact = item.kind === 'contact' || item.kind === 'editContact'
  const isLocation = item.kind === 'location' || item.kind === 'editLocation'
  const editing = item.kind.startsWith('edit')
  const [name, setName] = useState(contact?.name ?? location?.name ?? '')
  const [role, setRole] = useState(contact?.role ?? 'other')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [locationForm, setLocationForm] = useState(() => locationInput(location))
  const [saving, setSaving] = useState(false)
  const label = isContact ? 'contacto' : 'centro'
  const invalid =
    !name.trim() ||
    name.trim().length > 160 ||
    (isLocation && !validLocationInput({ ...locationForm, name }))

  async function save() {
    if (invalid || saving || submitBlocked) return
    setSaving(true)
    try {
      let createdId: string | undefined
      if (item.kind === 'editContact') {
        await updateContact(tenantId, item.contact, {
          name,
          role: role as ClientPassport['contacts'][number]['role'],
          email,
          phone,
        })
      } else if (item.kind === 'editLocation') {
        await updateLocation(tenantId, item.location, {
          ...locationForm,
          name,
        })
      } else if (item.kind === 'contact') {
        await createContact({
          tenantId,
          clientId,
          name,
          role: role as 'primary' | 'administrative' | 'technical' | 'other',
          email,
          phone,
        })
      } else if (item.kind === 'location') {
        createdId = await createLocation({
          tenantId,
          clientId,
          name,
          kind: locationForm.kind,
          address: locationForm.address,
          city: locationForm.city,
          postalCode: locationForm.postal_code,
          coordinates: locationForm.coordinates,
          openingHours: locationForm.opening_hours,
          operationalContact: locationForm.operational_contact,
          accessNotes: locationForm.access_notes,
          notes: locationForm.notes,
          active: locationForm.active,
        })
      }
      toast.success(
        `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} ${editing ? 'actualizado' : 'añadido'}`,
      )
      onCreated(createdId)
    } catch (error) {
      toast.error(`No se pudo ${editing ? 'actualizar' : 'añadir'} el ${label}`, {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      onError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`${editing ? 'Editar' : 'Añadir'} ${label}`}
      submitLabel={saving ? 'Guardando…' : editing ? 'Guardar cambios' : `Añadir ${label}`}
      submitDisabled={invalid || saving || submitBlocked}
      onSubmit={() => void save()}
    >
      {status}
      <TextField
        label="Nombre"
        value={name}
        onChange={setName}
        placeholder="Nombre"
        maxLength={160}
        className="sm:col-span-2"
      />
      {isContact ? (
        <>
          <SelectField
            label="Función"
            value={role}
            options={contactRoles}
            onChange={(value) => setRole(value as ClientPassport['contacts'][number]['role'])}
          />
          <TextField
            label="Teléfono"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="600 000 000"
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="contacto@ejemplo.com"
            className="sm:col-span-2"
          />
        </>
      ) : null}
      {isLocation ? (
        <LocationFields
          value={{ ...locationForm, name }}
          onChange={setLocationForm}
          includeName={false}
          serviceLocationOnly={serviceLocationOnly}
          showUsage={editing}
        />
      ) : null}
    </FormDialog>
  )
}
