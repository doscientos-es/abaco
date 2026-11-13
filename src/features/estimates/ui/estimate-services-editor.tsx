import { Button } from '@doscientos/ui'

import { estimateSectionLimits } from '@/shared/domain/estimate-document'
import { newId } from '@/shared/store/store'

import { EstimateServicesTable, type ServiceSection } from './estimate-services-table'

export function EstimateServicesEditor({
  section,
  onChange,
}: {
  section: ServiceSection
  onChange: (section: ServiceSection) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Escribe cada tarea y marca una o varias periodicidades. Esta tabla describe el plan
        acordado; no programa visitas ni cambia la facturación.
      </p>
      <EstimateServicesTable
        rows={section.rows}
        onChange={(rows) => onChange({ ...section, rows })}
      />
      <Button
        variant="outline"
        size="sm"
        isDisabled={section.rows.length >= estimateSectionLimits.rows}
        onPress={() =>
          onChange({
            ...section,
            rows: [
              ...section.rows,
              { id: newId(), task: '', frequency: '', notes: '', periodicities: [] },
            ],
          })
        }
      >
        Añadir tarea
      </Button>
    </div>
  )
}
