import { toast } from '@doscientos/ui'
import { useState, type ReactNode } from 'react'

import { SelectField, TextField, TextareaField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createContact,
  createLocation,
  updateContact,
  updateLocation,
  type ClientPassport,
} from '../application/client-passport-actions'

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
const locationKinds = [
  { value: 'service', label: 'Servicio' },
  { value: 'billing', label: 'Facturación' },
  { value: 'both', label: 'Servicio y facturación' },
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
  const [address, setAddress] = useState(location?.address ?? '')
  const [city, setCity] = useState(location?.city ?? '')
  const [operationalContact, setOperationalContact] = useState(location?.operational_contact ?? '')
  const [accessNotes, setAccessNotes] = useState(location?.access_notes ?? '')
  const [locationNotes, setLocationNotes] = useState(location?.notes ?? '')
  const [locationActive, setLocationActive] = useState(location?.active ?? true)
  const [locationKind, setLocationKind] = useState(location?.kind ?? 'service')
  const [saving, setSaving] = useState(false)
  const label = isContact ? 'contacto' : 'centro'
  const invalid = !name.trim() || name.trim().length > 160 || (isLocation && !address.trim())

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
          name,
          kind: locationKind as ClientPassport['locations'][number]['kind'],
          address,
          city,
          operational_contact: operationalContact,
          access_notes: accessNotes,
          notes: locationNotes,
          active: locationActive,
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
          kind: locationKind as 'service' | 'billing' | 'both',
          address,
          city,
          operationalContact,
          accessNotes,
          notes: locationNotes,
          active: locationActive,
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
        <>
          <SelectField
            label="Uso"
            value={locationKind}
            options={
              serviceLocationOnly
                ? locationKinds.filter((kind) => kind.value !== 'billing')
                : locationKinds
            }
            onChange={(value) =>
              setLocationKind(value as ClientPassport['locations'][number]['kind'])
            }
          />
          <TextField label="Ciudad" value={city} onChange={setCity} placeholder="Melilla" />
          <TextField
            label="Dirección"
            value={address}
            onChange={setAddress}
            placeholder="Calle y número"
            maxLength={500}
            className="sm:col-span-2"
          />
          <TextField
            label="Contacto operativo del centro"
            value={operationalContact}
            onChange={setOperationalContact}
            placeholder="Nombre, teléfono o correo · opcional"
            maxLength={1000}
          />
          <TextareaField
            label="Acceso al centro"
            value={accessNotes}
            onChange={setAccessNotes}
            placeholder="Llaves, acceso, horarios"
            maxLength={2000}
          />
          <TextareaField
            label="Observaciones del centro"
            value={locationNotes}
            onChange={setLocationNotes}
            placeholder="Indicaciones"
            maxLength={2000}
          />
          <label>
            <input
              type="checkbox"
              checked={locationActive}
              onChange={(e) => setLocationActive(e.target.checked)}
            />{' '}
            Centro activo
          </label>
        </>
      ) : null}
    </FormDialog>
  )
}
