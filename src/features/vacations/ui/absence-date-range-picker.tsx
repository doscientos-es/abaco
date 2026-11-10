import { DateRangeCalendar, DateRangePicker } from '@/shared/ui/date-range-picker'

export function AbsenceDateRangePicker({
  start,
  end,
  endOptional,
  mode = 'absence',
  onChange,
}: {
  start: string
  end: string
  endOptional: boolean
  mode?: 'absence' | 'filter'
  onChange: (start: string, end: string) => void
}) {
  const props = {
    start,
    end,
    onChange,
    label: mode === 'filter' ? 'Filtrar por fechas' : 'Fechas de la ausencia',
    allowOpenStart: mode === 'filter',
    allowOpenEnd: mode === 'filter' || endOptional,
  }
  return mode === 'filter' ? <DateRangeCalendar {...props} /> : <DateRangePicker {...props} />
}