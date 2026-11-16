import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'

const mocks = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn(), print: vi.fn() }))
vi.mock('react-dom', () => ({ flushSync: (callback: () => void) => callback() }))
vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: mocks.render, unmount: mocks.unmount }),
}))
vi.mock('@/shared/lib/print-document', () => ({ printDocument: mocks.print }))

import { printWorkerPaperReport, printWorkerPaperReports } from './worker-paper-report-print'

describe('worker paper printing', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([false, true])(
    'cleans up the rendered sheet after printing (error: %s)',
    async (fails) => {
      const element = {}
      vi.stubGlobal('document', { createElement: () => element })
      mocks.print.mockImplementation(() =>
        fails ? Promise.reject(new Error('No se pudo imprimir')) : Promise.resolve(),
      )
      const visit = { id: 'visit' } as VisitSummary
      const snapshot = { tasks: 'Limpieza' }
      const result = printWorkerPaperReport(visit, snapshot, [])
      if (fails) await expect(result).rejects.toThrow('No se pudo imprimir')
      else await expect(result).resolves.toBeUndefined()
      expect(mocks.render.mock.calls[0]?.[0].props.children[0].props).toEqual({
        visit,
        snapshot,
        tasks: [],
      })
      expect(mocks.print).toHaveBeenCalledWith(element, 'Parte de trabajo')
      expect(mocks.unmount).toHaveBeenCalledOnce()
    },
  )

  it('renders multiple individual sheets in one print job', async () => {
    const element = {}
    vi.stubGlobal('document', { createElement: () => element })
    mocks.print.mockResolvedValue(undefined)
    const visits = [{ id: 'one' }, { id: 'two' }] as VisitSummary[]
    const reports = visits.map((visit) => ({ visit, snapshot: {}, tasks: [] }))
    await printWorkerPaperReports(reports)
    const sheets = mocks.render.mock.calls[0]?.[0].props.children
    expect(sheets.map((sheet: { props: { visit: VisitSummary } }) => sheet.props.visit.id)).toEqual(
      ['one', 'two'],
    )
    expect(mocks.print).toHaveBeenCalledOnce()
    expect(mocks.print).toHaveBeenCalledWith(element, 'Partes de trabajo')
  })
})
