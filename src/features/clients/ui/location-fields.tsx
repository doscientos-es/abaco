import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField, TextareaField } from '@/shared/ui/form'

import { locationKinds, type LocationInput } from '../domain/client-location'

export function LocationFields({
  value,
  onChange,
  serviceLocationOnly = false,
  includeName = true,
}: {
  value: LocationInput
  onChange: (value: LocationInput) => void
  serviceLocationOnly?: boolean
  includeName?: boolean
}) {
  const set = (key: keyof LocationInput) => (next: string) => onChange({ ...value, [key]: next })
  return (
    <>
      {includeName ? (
        <TextField
          label="Nombre del centro"
          value={value.name}
          onChange={set('name')}
          placeholder="Ej. Sede principal"
          maxLength={160}
          required
          className="sm:col-span-2"
          icon={fieldIcons.building}
        />
      ) : null}
      <SelectField
        label="Uso"
        value={value.kind}
        options={
          serviceLocationOnly
            ? locationKinds.filter(({ value }) => value !== 'billing')
            : locationKinds
        }
        onChange={set('kind')}
      />
      <TextField label="Ciudad" value={value.city} onChange={set('city')} placeholder="Melilla" />
      <TextField
        label="Dirección del centro"
        value={value.address}
        onChange={set('address')}
        placeholder="Calle y número"
        maxLength={500}
        required
        className="sm:col-span-2"
        icon={fieldIcons.pin}
      />
      <TextField
        label="Código postal"
        value={value.postal_code}
        onChange={set('postal_code')}
        placeholder="52001"
      />
      <TextField
        label="Contacto operativo del centro"
        value={value.operational_contact}
        onChange={set('operational_contact')}
        placeholder="Nombre, teléfono o correo · opcional"
        maxLength={1000}
      />
      <TextareaField
        label="Horario del centro"
        value={value.opening_hours}
        onChange={set('opening_hours')}
        placeholder="Lunes a viernes, 8:00–18:00"
        maxLength={2000}
        className="sm:col-span-2"
      />
      <TextareaField
        label="Acceso al centro"
        value={value.access_notes}
        onChange={set('access_notes')}
        placeholder="Llaves, acceso, horarios"
        maxLength={2000}
      />
      <TextareaField
        label="Observaciones del centro"
        value={value.notes}
        onChange={set('notes')}
        placeholder="Indicaciones"
        maxLength={2000}
      />
      <label>
        <input
          type="checkbox"
          checked={value.active}
          onChange={(event) => onChange({ ...value, active: event.target.checked })}
        />{' '}
        Centro activo
      </label>
    </>
  )
}
