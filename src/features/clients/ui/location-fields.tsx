import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField, TextareaField } from '@/shared/ui/form'

import {
  locationKinds,
  parseLocationCoordinates,
  type LocationInput,
} from '../domain/client-location'
import { LocationCoordinateSearch } from './location-coordinate-search'

export function LocationFields({
  value,
  onChange,
  serviceLocationOnly = false,
  includeName = true,
  showUsage = true,
}: {
  value: LocationInput
  onChange: (value: LocationInput) => void
  serviceLocationOnly?: boolean
  includeName?: boolean
  showUsage?: boolean
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
      {showUsage ? (
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
      ) : null}
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
        label="Coordenadas del centro"
        value={value.coordinates}
        onChange={set('coordinates')}
        placeholder="35.2923, -2.9381"
        helper={
          parseLocationCoordinates(value.coordinates)
            ? 'Opcional. Introduce latitud y longitud separadas por una coma.'
            : 'Coordenadas no válidas. Introduce latitud y longitud separadas por una coma.'
        }
        className="sm:col-span-2"
      />
      <LocationCoordinateSearch address={value} onSelect={set('coordinates')} />
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
