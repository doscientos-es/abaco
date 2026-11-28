import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DashboardConfig, LedgerEntry } from '@/shared/domain/types'

import { DashboardExpenseChart, DashboardIncomeChart } from './dashboard-charts'
import { DashboardPage } from './dashboard-page'

const mocks = vi.hoisted(() => ({
  role: 'admin',
  config: { version: 1, widgets: [] } as DashboardConfig,
  ledger: [] as LedgerEntry[],
}))

vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: mocks.role }),
  can: (role: string) => role === 'admin',
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    estimates: [],
    ledger: mocks.ledger,
    clients: [],
    invoices: [],
    tenant: { name: 'Empresa', dashboardConfig: mocks.config },
  }),
  useSaveStatus: () => ({ state: 'saved' }),
  updateTenantData: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, title }: { children: React.ReactNode; to: string; title?: string }) => (
    <a href={to} title={title}>
      {children}
    </a>
  ),
}))

describe('dashboard customization', () => {
  beforeEach(() => {
    mocks.role = 'admin'
    mocks.config = { version: 1, widgets: [] }
    mocks.ledger = []
  })

  it('offers an accessible icon-only customization action', () => {
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).toMatch(/<button[^>]*aria-label="Personalizar resumen"[^>]*>/)
    expect(html).toContain('data-slot="icon-button"')
  })

  it('hides customization for people without permission', () => {
    mocks.role = 'user'
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).not.toContain('aria-label="Personalizar resumen"')
    expect(html).not.toContain('Personalizar resumen</button>')
    expect(html).not.toContain('Módulos disponibles')
  })

  it('lists only missing modules below the active grid', () => {
    mocks.config.widgets = ['income-expenses']
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).not.toContain('aria-label="Añadir Ingresos y gastos"')
    expect(html).toContain('aria-label="Añadir Gastos por categoría"')
    expect(html.indexOf('data-dashboard-module="income-expenses"')).toBeLessThan(
      html.indexOf('aria-label="Módulos disponibles"'),
    )
  })

  it('renders each chart’s own format and period controls in its card', () => {
    const html = renderToStaticMarkup(
      <>
        <DashboardIncomeChart
          ledger={[]}
          chart={{ incomeChart: 'lines', incomeMonths: 12 }}
          onChange={vi.fn()}
        />
        <DashboardExpenseChart
          ledger={[]}
          chart={{ format: 'ranking', months: 6 }}
          onChange={vi.fn()}
        />
      </>,
    )
    const settings = html.match(/<fieldset[^>]*>.*?<\/fieldset>/g) ?? []
    expect(settings).toHaveLength(2)
    expect(settings[0]).toContain('Personalizar Ingresos y gastos')
    expect(settings[0]).toContain('Periodo de Ingresos y gastos')
    expect(settings[0]).toContain('Formato de Ingresos y gastos')
    expect(settings[0]).toContain('>12 meses<')
    expect(settings[1]).toContain('Personalizar Gastos por categoría')
    expect(settings[1]).toContain('Periodo de Gastos por categoría')
    expect(settings[1]).toContain('Formato de Gastos por categoría')
    expect(settings[1]).toContain('>6 meses<')
    expect(html).toContain('Últimos 12 meses')
    expect(html).toContain('Últimos 6 meses')
  })

  it('links the metrics to their source sections and explains their meaning', () => {
    mocks.config.widgets = ['key-metrics']
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).toMatch(/href="\/presupuestos"[^>]*title="Pendiente de respuesta/)
    expect(html).toMatch(/href="\/contabilidad"[^>]*title="Cobrado este mes/)
    expect(html).toContain('aceptados entre presupuestos aceptados o rechazados')
    expect(html).toContain('0 presupuestos enviados')
    expect(html).toContain('De presupuestos aceptados')
    expect(html).toContain('Gastos')
  })

  it('renders the saved line chart and real expense and movement data', () => {
    const today = new Date()
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    mocks.config = {
      version: 1,
      widgets: ['income-expenses', 'expense-categories', 'recent-movements'],
      widths: { 'income-expenses': 9 },
      incomeChart: 'lines',
      incomeMonths: 12,
    }
    const entry = (
      id: string,
      date: string,
      kind: 'income' | 'expense',
      category: string,
      amountCents: number,
    ): LedgerEntry => ({
      id,
      date,
      kind,
      category,
      amountCents,
      tenantId: 'test',
      concept: id,
      vatRate: 0,
      estimateId: null,
      milestoneId: null,
    })
    mocks.ledger = [
      entry('Cobro', `${currentMonth}-01`, 'income', 'Servicios', 20000),
      entry('Compra', `${currentMonth}-02`, 'expense', 'Material', 3000),
      entry('Anterior', '2000-01-01', 'expense', 'Antiguo', 9000),
    ]
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).toMatch(/data-dashboard-module="income-expenses"[^>]*--dashboard-span:9/)
    expect(html).toContain('Últimos 12 meses')
    expect(html).toContain('aria-label="Líneas de ingresos y gastos por mes"')
    expect(html).toContain('Ver datos por mes')
    expect(html).toContain('Material')
    expect(html).not.toContain('Antiguo')
    expect(html).toContain('Compra')
    expect(html).toContain('Cobro')
    expect(html.indexOf('Compra')).toBeLessThan(html.indexOf('Cobro'))
    expect(html).toContain('Ver apuntes')
  })
})
