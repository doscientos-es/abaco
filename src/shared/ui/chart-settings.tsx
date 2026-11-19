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
  return (
    <SelectField
      label={label}
      hideLabel
      searchable={false}
      value={String(option.value)}
      options={option.choices.map((value) => ({ value: String(value), label: names[value] }))}
      onChange={(value) => {
        const choice = option.choices.find((item) => String(item) === value)
        if (choice !== undefined) option.onChange(choice)
      }}
    />
  )
}

export const chartPeriodLabels = {
  all: 'Todo el historial',
  1: 'Este mes',
  6: 'Últimos 6 meses',
  12: 'Últimos 12 meses',
}

export function ChartPeriodField<Value extends keyof typeof chartPeriodLabels>({
  title,
  option,
}: {
  title: string
  option: ChartOption<Value>
}) {
  return (
    <ChartOptionField label={`Periodo de ${title}`} option={option} names={chartPeriodLabels} />
  )
}
