import { readFileSync } from 'node:fs'

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'

const mocks = vi.hoisted(() => ({
  click: undefined as (() => void) | undefined,
  disabled: false,
  snapshots: vi.fn(),
  tasks: vi.fn(),
  print: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
  }: {
    children: ReactNode
    onPress: () => void
    isDisabled: boolean
  }) => {
    mocks.click = onPress
    mocks.disabled = isDisabled
    return <button>{children}</button>
  },
  toast: { error: mocks.error },
}))
vi.mock('../application/my-day-tasks', () => ({ listMyDayTasks: mocks.tasks }))
vi.mock('../application/paper-visit-actions', () => ({ loadPaperSnapshots: mocks.snapshots }))
vi.mock('./worker-paper-report-print', () => ({ printWorkerPaperReports: mocks.print }))

import { WorkerBatchPaperReports } from './worker-batch-paper-reports'

const visits = [
  { id: 'first', status: 'scheduled' },
  { id: 'second', status: 'completed' },
  { id: 'cancelled', status: 'canceled' },
  { id: 'skipped', status: 'skipped' },
] as VisitSummary[]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.click = undefined
  mocks.snapshots.mockResolvedValue({ first: { tasks: 'Suelo' }, second: { tasks: 'Baño' } })
  mocks.tasks.mockResolvedValue([
    { visitId: 'first', tasks: [] },
    { visitId: 'second', tasks: [] },
  ])
  mocks.print.mockResolvedValue(undefined)
})

describe('print all worker reports', () => {
  it('prints only eligible visits from the selected day, together and in order', async () => {
    const html = renderToStaticMarkup(
      <WorkerBatchPaperReports tenantId="tenant" visits={visits} disabled={false} />,
    )
    expect(html).toContain('Imprimir todos los partes (2)')
    expect(mocks.disabled).toBe(false)
    mocks.click?.()
    await vi.waitFor(() => expect(mocks.print).toHaveBeenCalledOnce())
    expect(mocks.snapshots).toHaveBeenCalledWith('tenant', ['first', 'second'])
    expect(mocks.tasks).toHaveBeenCalledWith('tenant', visits.slice(0, 2))
    expect(mocks.print).toHaveBeenCalledWith([
      { visit: visits[0], snapshot: { tasks: 'Suelo' }, tasks: [] },
      { visit: visits[1], snapshot: { tasks: 'Baño' }, tasks: [] },
    ])
  })

  it('does not print an incomplete batch when a snapshot is missing', async () => {
    mocks.snapshots.mockResolvedValue({ first: { tasks: 'Suelo' } })
    renderToStaticMarkup(
      <WorkerBatchPaperReports tenantId="tenant" visits={visits} disabled={false} />,
    )
    mocks.click?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.print).not.toHaveBeenCalled()
  })

  it('disables printing with no eligible visits or while the day is loading', () => {
    renderToStaticMarkup(
      <WorkerBatchPaperReports tenantId="tenant" visits={visits.slice(2)} disabled={false} />,
    )
    expect(mocks.disabled).toBe(true)
    mocks.click?.()
    renderToStaticMarkup(<WorkerBatchPaperReports tenantId="tenant" visits={visits} disabled />)
    expect(mocks.disabled).toBe(true)
    mocks.click?.()
    expect(mocks.print).not.toHaveBeenCalled()
  })

  it('starts each adjacent sheet on a new printed page', () => {
    const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.paper-sheet \+ \.paper-sheet\s*\{\s*break-before: page;/)
  })
})
