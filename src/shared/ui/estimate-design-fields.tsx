import { Checkbox } from '@doscientos/ui'

import type { EstimateDesign } from '@/shared/domain/estimate-design'

import { SelectField } from './form'

const layouts = [
  { value: 'compact', label: 'Compacto' },
  { value: 'proposal', label: 'Propuesta' },
]

export function EstimateDesignFields({
  value,
  onChange,
}: {
  value: EstimateDesign
  onChange: (design: EstimateDesign) => void
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Diseño del presupuesto</legend>
      <div className="max-w-xs">
        <SelectField
          label="Plantilla"
          options={layouts}
          value={value.layout}
          onChange={(layout) => {
            if (layout === 'compact' || layout === 'proposal') onChange({ ...value, layout })
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {value.layout === 'compact'
          ? 'Cabecera y contenido seguidos, sin portada ni índice.'
          : 'Portada separada y opción de incluir un índice.'}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {value.layout === 'proposal' ? (
          <Checkbox
            isSelected={value.showIndex}
            onChange={(showIndex) => onChange({ ...value, showIndex })}
          >
            Mostrar índice
          </Checkbox>
        ) : null}
        <Checkbox
          isSelected={value.showLogo}
          onChange={(showLogo) => onChange({ ...value, showLogo })}
        >
          Mostrar logo de empresa
        </Checkbox>
        <Checkbox
          isSelected={value.showFooter}
          onChange={(showFooter) => onChange({ ...value, showFooter })}
        >
          Mostrar texto de pie de página
        </Checkbox>
      </div>
    </fieldset>
  )
}
