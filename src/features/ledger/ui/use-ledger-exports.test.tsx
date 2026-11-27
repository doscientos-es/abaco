import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadTextFile, quarterlyVat } from '@/shared/domain/csv'
import type * as Csv from '@/shared/domain/csv'
import type { LedgerEntry } from '@/shared/domain/types'

import { loadAccountingExport } from '../application/accounting-export-actions'
import { useLedgerExports } from './use-ledger-exports'

vi.mock('@/shared/domain/csv', async (load) => ({
  ...(await load<typeof Csv>()),
  downloadTextFile: vi.fn(),
}))
vi.mock('../application/accounting-export-actions', () => ({ loadAccountingExport: vi.fn() }))
vi.mock('@doscientos/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const entry: LedgerEntry = {
  id: 'test-entry',
  tenantId: 'empresa-test',
  date: '2026-03-01',
  kind: 'expense',
  category: 'Material',
  concept: 'Compra de prueba',
  amountCents: 12100,
  vatRate: 21,
  estimateId: null,
  milestoneId: null,
}

function getExports(canExportDatasets: boolean, period = '2026-03') {
  type Actions = ReturnType<typeof useLedgerExports>
  function Probe({ capture }: { capture: (actions: Actions) => void }) {
    const actions = useLedgerExports({
      tenant: { id: entry.tenantId, name: 'Empresa Test' },
      canExportDatasets,
      period,
      entries: [entry],
      quarters: quarterlyVat([entry, { ...entry, date: '2026-04-01' }]),
    })
    capture(actions)
    return null
  }
  const capture = vi.fn<(actions: Actions) => void>()
  renderToStaticMarkup(<Probe capture={capture} />)
  const actions = capture.mock.lastCall?.[0]
  if (!actions) throw new Error('Expected ledger export actions')
  return actions.exportAction
}

describe('accounting export modules', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['2026-03', '2026-T1'])(
    'exports the book for %s without filtering quarterly VAT',
    (period) => {
      const exportAction = getExports(false, period)
      exportAction('book').run()
      exportAction('vat').run()

      expect(downloadTextFile).toHaveBeenNthCalledWith(
        1,
        `libro-empresa-test-${period}.csv`,
        expect.stringContaining('Compra de prueba'),
      )
      expect(vi.mocked(downloadTextFile).mock.calls[0]?.[1]).not.toContain('2026-04')
      expect(downloadTextFile).toHaveBeenNthCalledWith(
        2,
        'iva-trimestral-empresa-test.csv',
        expect.stringContaining('2026-T2'),
      )
    },
  )

  it('does not request datasets without permission and prevents concurrent requests', async () => {
    const blocked = getExports(false)('clients')
    expect(blocked.disabled).toBe(true)
    blocked.run()
    expect(loadAccountingExport).not.toHaveBeenCalled()

    vi.mocked(loadAccountingExport).mockResolvedValue({
      clients: [],
      invoices: [],
      expenses: [],
      payments: [],
    })
    const exportAction = getExports(true)
    exportAction('clients').run()
    exportAction('expenses').run()
    expect(loadAccountingExport).toHaveBeenCalledExactlyOnceWith('empresa-test', 'clients')
    await vi.waitFor(() =>
      expect(downloadTextFile).toHaveBeenCalledWith(
        expect.stringMatching(/^menoslios-empresa-test-clients-/),
        expect.any(String),
      ),
    )
  })
})
