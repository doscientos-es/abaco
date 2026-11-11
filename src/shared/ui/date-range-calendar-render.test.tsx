import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DateRangeCalendar, DateRangePicker } from './date-range-picker'

describe('calendario de fechas', () => {
  it('renderiza dos meses localizados y días accesibles sin enviar el formulario', () => {
    const html = renderToStaticMarkup(
      <DateRangeCalendar
        start="2026-11-10"
        end="2026-11-12"
        onChange={() => {}}
        label="Fechas de la ausencia"
      />,
    )
    expect(html).toContain('noviembre 2026')
    expect(html).toContain('diciembre 2026')
    expect(html.match(/role="grid"/g)).toHaveLength(2)
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('type="button"')
  })

  it('muestra solo el botón cuando el selector está cerrado', () => {
    const html = renderToStaticMarkup(
      <DateRangePicker start="" end="" onChange={() => {}} label="Fechas de la ausencia" />,
    )
    expect(html).toContain('Fechas de la ausencia')
    expect(html).toContain('Selecciona un día')
    expect(html).not.toContain('rdp-month_grid')
    expect(html).not.toContain('La semana que viene')
  })
})
