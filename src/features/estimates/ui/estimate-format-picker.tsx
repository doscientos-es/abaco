import { useId } from 'react'

import { estimateFormatLabels, type EstimateFormat } from '@/shared/domain/estimate-document'

const formats = [
  { value: 'table', description: 'Partidas, cantidades y precios en una tabla.' },
  { value: 'sections', description: 'Una propuesta con títulos, textos, precios y servicios.' },
] as const

export function EstimateFormatPicker({
  value,
  onChange,
}: {
  value: EstimateFormat
  onChange: (value: EstimateFormat) => void
}) {
  const id = useId()
  return (
    <fieldset className="min-w-0 sm:col-span-2">
      <legend className="text-muted-foreground mb-2 text-xs font-medium">
        Tipo de presupuesto
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {formats.map((format) => (
          <label key={format.value} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={`${id}-format`}
              value={format.value}
              checked={value === format.value}
              onChange={() => onChange(format.value)}
              aria-labelledby={`${id}-${format.value}-label`}
              aria-describedby={`${id}-${format.value}-description`}
              className="peer sr-only"
            />
            <span className="border-border bg-card peer-checked:border-primary peer-checked:ring-primary/20 peer-focus-visible:ring-ring hover:border-primary/50 block h-full overflow-hidden rounded-xl border peer-checked:ring-2 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2">
              <span className="bg-muted/40 block border-b p-3">
                <EstimateFormatIllustration format={format.value} />
              </span>
              <span className="block space-y-1 p-3">
                <span
                  id={`${id}-${format.value}-label`}
                  className="flex items-center justify-between gap-2 text-sm font-semibold"
                >
                  {estimateFormatLabels[format.value]}
                  <span
                    aria-hidden="true"
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${value === format.value ? 'border-primary bg-primary' : 'border-border'}`}
                  >
                    {value === format.value ? (
                      <span className="bg-primary-foreground size-1.5 rounded-full" />
                    ) : null}
                  </span>
                </span>
                <span
                  id={`${id}-${format.value}-description`}
                  className="text-muted-foreground block text-xs leading-relaxed"
                >
                  {format.description}
                </span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function EstimateFormatIllustration({ format }: { format: EstimateFormat }) {
  return (
    <svg
      viewBox="0 0 240 148"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="text-primary h-32 w-full"
    >
      {format === 'sections' ? (
        <rect x="74" y="8" width="108" height="132" rx="5" className="fill-muted stroke-border" />
      ) : null}
      <rect x="58" y="14" width="112" height="130" rx="5" className="fill-card stroke-border" />
      <rect x="72" y="28" width="18" height="6" rx="2" fill="currentColor" opacity="0.8" />
      <path
        d="M72 44H132M72 50H111"
        className="stroke-muted-foreground/40"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {format === 'table' ? (
        <>
          <rect x="72" y="64" width="84" height="12" rx="2" fill="currentColor" opacity="0.12" />
          <path
            d="M72 76H156M72 89H156M72 102H156M72 115H156M126 64V115"
            className="stroke-border"
          />
          <path
            d="M78 82H107M138 82H149M78 95H116M138 95H149M78 108H103M138 108H149"
            className="stroke-muted-foreground/40"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="124" y="125" width="32" height="5" rx="2" fill="currentColor" opacity="0.65" />
        </>
      ) : (
        <>
          <rect x="72" y="62" width="36" height="4" rx="2" fill="currentColor" opacity="0.7" />
          <path
            d="M72 73H154M72 79H149M72 85H123"
            className="stroke-muted-foreground/40"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="72" y="96" width="84" height="16" rx="3" fill="currentColor" opacity="0.1" />
          <path
            d="M78 104H108M136 104H149"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M72 123H113M72 130H151"
            className="stroke-muted-foreground/40"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}
