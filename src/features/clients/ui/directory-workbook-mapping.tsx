import type { DirectorySheet } from '../application/directory-workbook-actions'
import {
  directoryFields,
  directoryHeaders,
  type DirectoryTarget,
  type Mapping,
} from '../domain/directory-workbook'

export const directoryFieldClass =
  'border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-2 py-2 text-base'

export function DirectorySheetMapping({
  target,
  sheets,
  sheetIndex,
  changeSheet,
  mapping,
  changeMapping,
  parentByCode,
}: {
  target: DirectoryTarget
  sheets: DirectorySheet[]
  sheetIndex: number | null
  changeSheet: (index: number | null) => void
  mapping: Mapping
  changeMapping: (mapping: Mapping) => void
  parentByCode?: boolean
}) {
  const selected = sheetIndex === null ? null : sheets[sheetIndex]
  const columns = selected ? directoryHeaders(selected.rows).columns : []
  return (
    <fieldset className="border-border grid min-w-0 gap-2 rounded-lg border p-3">
      <legend className="px-1 font-semibold">{target === 'client' ? 'Clientes' : 'Centros'}</legend>
      <label className="grid gap-1 text-sm">
        {target === 'client' ? 'Hoja de clientes' : 'Hoja de centros'}
        <select
          className={directoryFieldClass}
          value={sheetIndex ?? ''}
          onChange={(event) =>
            changeSheet(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">No importar</option>
          {sheets.map(({ name }, index) => (
            <option key={index} value={index}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {selected
        ? directoryFields[target]
            .filter((field) => field.id !== 'parentKey' || parentByCode)
            .map((field) => {
              const required = field.required || field.id === 'parentKey'
              return (
                <label key={field.id} className="grid gap-1 text-sm">
                  {field.label}
                  {required ? ' (obligatorio)' : ' (opcional)'}
                  <select
                    className={directoryFieldClass}
                    value={mapping[field.id] ?? ''}
                    onChange={(event) => {
                      const next = { ...mapping }
                      if (event.target.value === '') delete next[field.id]
                      else next[field.id] = Number(event.target.value)
                      changeMapping(next)
                    }}
                  >
                    <option value="">{required ? 'Elige una columna' : 'No importar'}</option>
                    {columns.map(({ index, label }) => (
                      <option key={index} value={index}>
                        Columna {index + 1} · {label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })
        : null}
    </fieldset>
  )
}
