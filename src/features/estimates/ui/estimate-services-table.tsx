import { IconButton, Input } from '@doscientos/ui'
import { Trash } from '@phosphor-icons/react'
import { useId } from 'react'

import { estimateSectionLimits, type EstimateSection } from '@/shared/domain/estimate-document'
import {
  selectServicePeriodicity,
  serviceFrequencySelection,
  servicePeriodicityLabels,
  servicePeriodicityValues,
} from '@/shared/domain/service-periodicity'
import { TextareaField, TextField } from '@/shared/ui/form'

export type ServiceSection = Extract<EstimateSection, { type: 'work_table' }>
type ServiceRow = ServiceSection['rows'][number]

/** One matrix for the editor, published document and printing. */
export function EstimateServicesTable({
  rows,
  onChange,
}: {
  rows: ServiceRow[]
  onChange?: (rows: ServiceRow[]) => void
}) {
  const tableId = useId()
  const otherFrequencies = rows.some((row) => serviceFrequencySelection(row).other.trim())
  const update = (row: ServiceRow) =>
    onChange?.(rows.map((item) => (item.id === row.id ? row : item)))
  return (
    <div className="estimate-document__table overflow-x-auto rounded-lg border">
      <table
        aria-label="Servicios y periodicidades"
        className="estimate-services-table w-full min-w-160 table-fixed text-sm"
      >
        <thead className="bg-muted/60">
          <tr className="border-b">
            <th scope="col" className="w-[38%] p-3 text-left">
              Prescripciones técnicas
            </th>
            {servicePeriodicityValues.map((value) => (
              <th key={value} scope="col" className="px-1 py-3 text-center text-xs font-medium">
                {servicePeriodicityLabels[value]}
              </th>
            ))}
            {otherFrequencies ? (
              <th scope="col" className="p-2 text-xs">
                Otra periodicidad
              </th>
            ) : null}
            {onChange ? (
              <th scope="col" className="w-12">
                <span className="sr-only">Acciones</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const selection = serviceFrequencySelection(row)
            return (
              <tr key={row.id} className="odd:bg-muted/20 border-b last:border-b-0">
                <td className="p-2 whitespace-pre-wrap">
                  {onChange ? (
                    <div className="space-y-2">
                      <Input
                        aria-label={`Tarea ${index + 1}`}
                        placeholder="Ej. Limpieza de cristales"
                        maxLength={estimateSectionLimits.item}
                        value={row.task}
                        onChange={(event) => update({ ...row, task: event.target.value })}
                      />
                      {selection.periodicities.length > 1 ? (
                        <p className="text-muted-foreground text-xs">
                          Periodicidades guardadas:{' '}
                          {selection.periodicities
                            .map((value) => servicePeriodicityLabels[value])
                            .join(', ')}
                          . Elige una para sustituirlas.
                        </p>
                      ) : null}
                      <details className="text-muted-foreground text-xs">
                        <summary className="cursor-pointer">
                          Notas{row.notes ? ' (con contenido)' : ' (opcional)'}
                        </summary>
                        <TextareaField
                          label={`Notas de la tarea ${index + 1}`}
                          hideLabel
                          placeholder="Zona, medios o instrucciones"
                          value={row.notes}
                          maxLength={estimateSectionLimits.item}
                          onChange={(notes) => update({ ...row, notes })}
                        />
                      </details>
                    </div>
                  ) : (
                    <>
                      {row.task}
                      {row.notes ? (
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {row.notes}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                {servicePeriodicityValues.map((value) => (
                  <td key={value} className="p-1 text-center align-middle">
                    {onChange ? (
                      <label className="inline-flex min-h-10 min-w-10 items-center justify-center">
                        <input
                          type="radio"
                          name={`${tableId}-${row.id}`}
                          value={value}
                          aria-label={`${servicePeriodicityLabels[value]} · Tarea ${index + 1}${row.task ? `: ${row.task}` : ''}`}
                          className="accent-primary size-4 cursor-pointer"
                          checked={
                            selection.periodicities.length === 1 &&
                            selection.periodicities[0] === value
                          }
                          onChange={() => update(selectServicePeriodicity(row, value))}
                        />
                      </label>
                    ) : selection.periodicities.includes(value) ? (
                      <span aria-label={servicePeriodicityLabels[value]} className="font-semibold">
                        X
                      </span>
                    ) : null}
                  </td>
                ))}
                {otherFrequencies ? (
                  <td className="p-2 whitespace-pre-wrap">
                    {onChange && selection.other ? (
                      <TextField
                        label={`Otra periodicidad de la tarea ${index + 1}`}
                        placeholder="Periodicidad acordada"
                        value={selection.other}
                        maxLength={200}
                        onChange={(frequency) =>
                          update({ ...row, periodicities: selection.periodicities, frequency })
                        }
                      />
                    ) : (
                      selection.other
                    )}
                  </td>
                ) : null}
                {onChange ? (
                  <td className="p-1 text-center">
                    <IconButton
                      label={`Eliminar tarea ${index + 1}`}
                      variant="ghost"
                      onPress={() => onChange(rows.filter((item) => item.id !== row.id))}
                    >
                      <Trash aria-hidden="true" className="size-4" />
                    </IconButton>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
