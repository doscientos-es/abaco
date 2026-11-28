import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'

import { buildCollectionsWorklistCsv } from './collections-worklist-csv'

describe('exportar lista de cobros', () => {
  it('exporta el saldo, protege fórmulas y no incluye datos de contacto ni identificadores', () => {
    const csv = buildCollectionsWorklistCsv(
      [
        {
          number: 'F-1',
          clientId: 'internal-id',
          dueDate: '2026-11-29',
          totalCents: 10000,
          paidCents: 2500,
        },
      ],
      () => '=SUM(1;1)',
    )
    const rows = Papa.parse<string[]>(csv, { delimiter: ';', skipEmptyLines: true }).data
    expect(rows).toEqual([
      ['Número', 'Cliente', 'Vencimiento', 'Importe EUR', 'Cobrado EUR', 'Saldo EUR'],
      ['F-1', "'=SUM(1;1)", '2026-11-29', '100.00', '25.00', '75.00'],
    ])
    expect(csv).not.toMatch(/internal-id|NIF|IBAN|email|teléfono/i)
  })
})
