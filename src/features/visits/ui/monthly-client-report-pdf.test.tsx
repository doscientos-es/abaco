import { renderToBuffer } from '@react-pdf/renderer'
import { expect, it } from 'vitest'

import type { MonthlyVisit } from '../domain/monthly-client-report'
import { MonthlyClientReportDocument } from './monthly-client-report-pdf'

it('genera un PDF operativo y pagina los servicios de un mes con muchas visitas', async () => {
  const visits = Array.from({ length: 60 }, (_, index): MonthlyVisit => ({
    id: String(index),
    title: `Servicio de ejemplo ${index}`,
    centre: 'Nave ñ',
    date: '2026-11-15T10:00:00Z',
    status: 'completed',
  }))
  const buffer = await renderToBuffer(
    <MonthlyClientReportDocument
      report={{
        visits,
        extras: [],
        clientName: 'Cliente ficticio',
        centreName: 'Todos los centros',
        month: '2026-11',
      }}
    />,
  )
  expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  expect(buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length).toBeGreaterThan(1)
}, 30_000)
