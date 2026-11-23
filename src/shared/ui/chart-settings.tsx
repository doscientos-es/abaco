import { SelectField } from './form'

export const chartFormats = {
  bars: 'Barras',
  lines: 'Líneas',
  area: 'Área',
  table: 'Tabla',
  pie: 'Circular',
  donut: 'Anillo',
  radial: 'Anillos radiales',
  ranking: 'Barras horizontales',
} as const

type ChartOption<Value extends string | number> = {
  value: Value
  choices: readonly Value[]
  onChange: (value: Value) => void
}

export function ChartOptionField<Value extends string | number>({
  label,
  option,
  names,
}: {
  label: string
  option: ChartOption<Value>
  names: Record<NoInfer<Value>, string>
}) {
  const caption = label.startsWith('Formato de ')
    ? 'Formato'
    : label.startsWith('Periodo de ')
      ? 'Periodo'
      : label.startsWith('Medida de ')
        ? 'Medida'
        : label
  return (
    <div className="flex w-fit max-w-full min-w-0 items-center gap-1.5">
      <span aria-hidden="true" className="text-muted-foreground text-xs font-medium">
        {caption}
      </span>
      <SelectField
        label={label}
        hideLabel
        searchable={false}
        className="min-w-0"
        controlClassName="max-md:h-11 max-md:w-auto max-md:min-w-0 max-md:max-w-full max-md:px-2.5"
        value={String(option.value)}
        options={option.choices.map((value) => ({ value: String(value), label: names[value] }))}
        onChange={(value) => {
          const choice = option.choices.find((item) => String(item) === value)
          if (choice !== undefined) option.onChange(choice)
        }}
      />
    </div>
  )
}

export const chartPeriodLabels = {
  all: 'Todo el historial',
  1: 'Este mes',
  6: 'Últimos 6 meses',
  12: 'Últimos 12 meses',
} as const

const compactChartPeriodLabels = {
  all: 'Todo',
  1: 'Este mes',
  6: '6 meses',
  12: '12 meses',
} as const

export function ChartPeriodField<Value extends keyof typeof chartPeriodLabels>({
  title,
  option,
}: {
  title: string
  option: ChartOption<Value>
}) {
  return (
    <ChartOptionField
      label={`Periodo de ${title}`}
      option={option}
      names={compactChartPeriodLabels}
    />
  )
}
