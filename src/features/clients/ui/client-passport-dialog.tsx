import { toast } from '@doscientos/ui'
import { useState } from 'react'

import { SelectField, TextField, TextareaField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createContact,
  createEquipment,
  createLocation,
  createPool,
  replaceEquipment,
  updateContact,
  updateEquipment,
  updateLocation,
  updatePool,
  type ClientPassport,
} from '../application/client-passport-actions'

export type NewItem =
  | { kind: 'contact' }
  | { kind: 'location' }
  | { kind: 'pool'; locationId: string }
  | { kind: 'equipment'; assetId: string }
  | { kind: 'editContact'; contact: ClientPassport['contacts'][number] }
  | { kind: 'editLocation'; location: ClientPassport['locations'][number] }
  | {
      kind: 'editPool'
      asset: ClientPassport['assets'][number]
      profile: ClientPassport['pools'][number]
    }
  | { kind: 'editEquipment'; equipment: ClientPassport['equipment'][number] }
  | { kind: 'replaceEquipment'; equipment: ClientPassport['equipment'][number] }

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
const poolUses = [
  { value: 'private', label: 'Privada' },
  { value: 'community', label: 'Comunitaria' },
  { value: 'public', label: 'Pública' },
  { value: 'other', label: 'Otro uso' },
]
const poolKinds = [
  { value: 'outdoor', label: 'Exterior' },
  { value: 'indoor', label: 'Interior' },
  { value: 'spa', label: 'Spa' },
  { value: 'other', label: 'Otra' },
]
export function CreatePassportItem({
  item,
  tenantId,
  clientId,
  onClose,
  onCreated,
  onError,
}: {
  item: NewItem
  tenantId: string
  clientId: string
  onClose: () => void
  onCreated: () => void
  onError: () => void
}) {
  const contact = item.kind === 'editContact' ? item.contact : undefined
  const location = item.kind === 'editLocation' ? item.location : undefined
  const pool = item.kind === 'editPool' ? item : undefined
  const equipment = item.kind === 'editEquipment' ? item.equipment : undefined
  const replacing = item.kind === 'replaceEquipment' ? item.equipment : undefined
  const isContact = item.kind === 'contact' || item.kind === 'editContact'
  const isLocation = item.kind === 'location' || item.kind === 'editLocation'
  const isPool = item.kind === 'pool' || item.kind === 'editPool'
  const isEquipment =
    item.kind === 'equipment' || item.kind === 'editEquipment' || item.kind === 'replaceEquipment'
  const editing = item.kind.startsWith('edit')
  const [name, setName] = useState(
    contact?.name ?? location?.name ?? pool?.asset.name ?? equipment?.kind ?? replacing?.kind ?? '',
  )
  const [role, setRole] = useState(contact?.role ?? 'other')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [address, setAddress] = useState(location?.address ?? '')
  const [city, setCity] = useState(location?.city ?? '')
  const [locationKind, setLocationKind] = useState(location?.kind ?? 'service')
  const [volume, setVolume] = useState(pool?.profile.volume_m3?.toString() ?? '')
  const [treatment, setTreatment] = useState(pool?.profile.treatment ?? '')
  const [poolUse, setPoolUse] = useState(pool?.profile.use_kind ?? 'private')
  const [poolKind, setPoolKind] = useState(pool?.profile.pool_kind ?? 'outdoor')
  const [length, setLength] = useState(pool?.profile.length_m?.toString() ?? '')
  const [width, setWidth] = useState(pool?.profile.width_m?.toString() ?? '')
  const [averageDepth, setAverageDepth] = useState(pool?.profile.average_depth_m?.toString() ?? '')
  const [lining, setLining] = useState(pool?.profile.lining ?? '')
  const [seasonNotes, setSeasonNotes] = useState(pool?.profile.season_notes ?? '')
  const [manufacturer, setManufacturer] = useState(equipment?.manufacturer ?? '')
  const [model, setModel] = useState(equipment?.model ?? '')
  const [serialNumber, setSerialNumber] = useState(equipment?.serial_number ?? '')
  const [supplier, setSupplier] = useState(equipment?.supplier ?? '')
  const [installedAt, setInstalledAt] = useState(equipment?.installed_at ?? '')
  const [warranty, setWarranty] = useState(equipment?.warranty_ends_at ?? '')
  const [specifications, setSpecifications] = useState(equipment?.specifications ?? '')
  const [equipmentNotes, setEquipmentNotes] = useState(equipment?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const label = isContact ? 'contacto' : isLocation ? 'ubicación' : isPool ? 'piscina' : 'equipo'
  const invalid =
    !name.trim() ||
    name.trim().length > (isEquipment ? 100 : 160) ||
    (isLocation && !address.trim()) ||
    (isPool &&
      [volume, length, width, averageDepth].some(
        (value) => value !== '' && (!Number.isFinite(Number(value)) || !(Number(value) > 0)),
      ))

  const poolFields = {
    name,
    volumeM3: volume ? Number(volume) : null,
    treatment,
    useKind: poolUse as ClientPassport['pools'][number]['use_kind'],
    poolKind: poolKind as ClientPassport['pools'][number]['pool_kind'],
    lengthM: length ? Number(length) : null,
    widthM: width ? Number(width) : null,
    averageDepthM: averageDepth ? Number(averageDepth) : null,
    lining,
    seasonNotes,
  }
  const equipmentFields = {
    kind: name,
    manufacturer,
    model,
    serialNumber,
    supplier,
    installedAt: installedAt || null,
    warrantyEndsAt: warranty || null,
    specifications,
    notes: equipmentNotes,
  }

  async function save() {
    if (invalid || saving) return
    setSaving(true)
    try {
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
        })
      } else if (item.kind === 'editPool') {
        await updatePool(tenantId, item.asset, item.profile, poolFields)
      } else if (item.kind === 'editEquipment') {
        await updateEquipment(tenantId, item.equipment, equipmentFields)
      } else if (item.kind === 'replaceEquipment') {
        await replaceEquipment(tenantId, item.equipment, equipmentFields)
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
        await createLocation({
          tenantId,
          clientId,
          name,
          kind: locationKind as 'service' | 'billing' | 'both',
          address,
          city,
        })
      } else if (item.kind === 'pool') {
        await createPool({
          tenantId,
          locationId: item.locationId,
          ...poolFields,
        })
      } else {
        await createEquipment({
          tenantId,
          assetId: item.assetId,
          ...equipmentFields,
        })
      }
      toast.success(
        item.kind === 'replaceEquipment'
          ? 'Equipo sustituido; el anterior permanece en el historial'
          : `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} ${editing ? 'actualizado' : 'añadido'}`,
      )
      onCreated()
    } catch (error) {
      toast.error(
        `No se pudo ${item.kind === 'replaceEquipment' ? 'sustituir' : editing ? 'actualizar' : 'añadir'} el ${label}`,
        {
          description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        },
      )
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
      title={
        item.kind === 'replaceEquipment'
          ? 'Sustituir equipo'
          : `${editing ? 'Editar' : 'Añadir'} ${label}`
      }
      submitLabel={
        saving
          ? 'Guardando…'
          : item.kind === 'replaceEquipment'
            ? 'Sustituir'
            : editing
              ? 'Guardar cambios'
              : `Añadir ${label}`
      }
      submitDisabled={invalid || saving}
      onSubmit={() => void save()}
    >
      <TextField
        label={isEquipment ? 'Tipo de equipo' : 'Nombre'}
        value={name}
        onChange={setName}
        placeholder={isPool ? 'Piscina principal' : isEquipment ? 'Bomba' : 'Nombre'}
        maxLength={isEquipment ? 100 : 160}
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
            options={locationKinds}
            onChange={(value) =>
              setLocationKind(value as ClientPassport['locations'][number]['kind'])
            }
          />
          <TextField label="Ciudad" value={city} onChange={setCity} placeholder="Barcelona" />
          <TextField
            label="Dirección"
            value={address}
            onChange={setAddress}
            placeholder="Calle y número"
            maxLength={500}
            className="sm:col-span-2"
          />
        </>
      ) : null}
      {isPool ? (
        <>
          <SelectField
            label="Uso"
            value={poolUse}
            options={poolUses}
            onChange={(value) => setPoolUse(value as ClientPassport['pools'][number]['use_kind'])}
          />
          <SelectField
            label="Tipo de piscina"
            value={poolKind}
            options={poolKinds}
            onChange={(value) => setPoolKind(value as ClientPassport['pools'][number]['pool_kind'])}
          />
          <TextField
            label="Largo (m)"
            type="number"
            min={0.01}
            step="0.01"
            value={length}
            onChange={setLength}
            placeholder="Ej. 10"
          />
          <TextField
            label="Ancho (m)"
            type="number"
            min={0.01}
            step="0.01"
            value={width}
            onChange={setWidth}
            placeholder="Ej. 5"
          />
          <TextField
            label="Profundidad media (m)"
            type="number"
            min={0.01}
            step="0.01"
            value={averageDepth}
            onChange={setAverageDepth}
            placeholder="Ej. 1.5"
          />
          <TextField
            label="Volumen (m³)"
            type="number"
            min={0.01}
            step="0.01"
            value={volume}
            onChange={setVolume}
            placeholder="Ej. 45"
          />
          <TextField
            label="Tratamiento"
            value={treatment}
            onChange={setTreatment}
            placeholder="Cloro salino"
          />
          <TextField
            label="Revestimiento"
            value={lining}
            onChange={setLining}
            placeholder="Gresite"
          />
          <TextField
            label="Notas de temporada"
            value={seasonNotes}
            onChange={setSeasonNotes}
            placeholder="Apertura, cierre y cuidados de temporada"
            className="sm:col-span-2"
          />
        </>
      ) : null}
      {isEquipment ? (
        <>
          <TextField
            label="Fabricante"
            value={manufacturer}
            onChange={setManufacturer}
            placeholder="Fabricante"
          />
          <TextField label="Modelo" value={model} onChange={setModel} placeholder="Modelo" />
          <TextField
            label="Número de serie"
            value={serialNumber}
            onChange={setSerialNumber}
            placeholder="Número de serie"
          />
          <TextField
            label="Proveedor"
            value={supplier}
            onChange={setSupplier}
            placeholder="Proveedor"
          />
          <TextField
            label="Fecha de instalación"
            type="date"
            value={installedAt}
            onChange={setInstalledAt}
            placeholder="dd/mm/aaaa"
          />
          <TextField
            label="Fin de garantía"
            type="date"
            value={warranty}
            onChange={setWarranty}
            placeholder="dd/mm/aaaa"
          />
          <TextareaField
            label="Especificaciones"
            value={specifications}
            onChange={setSpecifications}
            placeholder="Potencia, caudal, capacidad…"
            className="sm:col-span-2"
          />
          <TextareaField
            label="Notas del equipo"
            value={equipmentNotes}
            onChange={setEquipmentNotes}
            placeholder="Ubicación, mantenimiento o incidencias previas"
            className="sm:col-span-2"
          />
        </>
      ) : null}
    </FormDialog>
  )
}
