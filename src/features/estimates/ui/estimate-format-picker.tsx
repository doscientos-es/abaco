import { estimateFormatLabels, type EstimateFormat } from '@/shared/domain/estimate-document'
import { VisualRadioGroup } from '@/shared/ui/visual-radio-group'

const formats = [
  {
    value: 'table',
    description: 'Obra puntual con partidas y pagos en plazos, sin contrato de mantenimiento.',
  },
  {
    value: 'sections',
    description: 'Propuesta por secciones. Al aprobarla se crea un contrato en borrador.',
  },
] as const

const formatOptions = formats.map((format) => ({
  ...format,
  label: estimateFormatLabels[format.value],
  illustration: <EstimateFormatIllustration format={format.value} />,
}))

export function EstimateFormatPicker({
  value,
  onChange,
}: {
  value: EstimateFormat
  onChange: (value: EstimateFormat) => void
}) {
  return (
    <VisualRadioGroup
      label="Tipo de presupuesto"
      className="min-w-0 sm:col-span-2"
      options={formatOptions}
      value={value}
      onChange={onChange}
    />
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
