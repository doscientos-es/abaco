import { Checkbox } from '@doscientos/ui'

import type { EstimateDesign } from '@/shared/domain/estimate-design'

import { VisualRadioGroup } from './visual-radio-group'

const layouts = [
  { value: 'compact', label: 'Compacto', description: 'Sin portada ni índice.' },
  { value: 'proposal', label: 'Propuesta', description: 'Portada e índice opcional.' },
] as const

const layoutOptions = layouts.map((layout) => ({
  ...layout,
  illustration: <LayoutThumbnail layout={layout.value} />,
}))

export function EstimateDesignFields({
  value,
  onChange,
}: {
  value: EstimateDesign
  onChange: (design: EstimateDesign) => void
}) {
  return (
    <div className="space-y-4">
      <VisualRadioGroup
        label="Plantilla"
        value={value.layout}
        options={layoutOptions}
        onChange={(layout) => onChange({ ...value, layout })}
        compact
      />
      <fieldset className="grid gap-2">
        <legend className="text-muted-foreground mb-2 text-xs font-medium">
          Elementos visibles
        </legend>
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
      </fieldset>
    </div>
  )
}

function LayoutThumbnail({ layout }: { layout: EstimateDesign['layout'] }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 96 72"
      fill="none"
      className="text-primary h-16 w-full"
    >
      {layout === 'proposal' ? (
        <rect x="33" y="4" width="42" height="56" rx="3" className="fill-muted stroke-border" />
      ) : null}
      <rect
        x={layout === 'proposal' ? 22 : 27}
        y="9"
        width="42"
        height="56"
        rx="3"
        className="fill-card stroke-border"
      />
      {layout === 'compact' ? (
        <>
          <path d="M33 18h21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M33 24h13" className="stroke-muted-foreground/40" strokeLinecap="round" />
          <rect x="33" y="30" width="30" height="7" rx="1" className="fill-primary/15" />
          <path d="M33 42h30m-30 6h30m-30 6h30m-9-17v17" className="stroke-border" />
          <path d="M53 59h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M28 19h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <rect x="28" y="28" width="30" height="16" rx="2" className="fill-primary/15" />
          <path
            d="M32 33h20m-20 5h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M28 52h14m-14 5h24"
            className="stroke-muted-foreground/40"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}
