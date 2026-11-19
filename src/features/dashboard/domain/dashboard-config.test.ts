import { describe, expect, it } from 'vitest'

import type { DashboardConfig } from '@/shared/domain/types'
import { tenantFromRow, tenantToRow } from '@/shared/store/supabase-mappers'

import {
  dashboardConfigFrom,
  defaultDashboardWidgets,
  newDashboardWidget,
  resolveDashboardChart,
  resolveDashboardCharts,
  resolveDashboardLayout,
  resolveDashboardWidgets,
} from './dashboard-config'

describe('dashboard configuration', () => {
  it('keeps old layouts and defaults invalid or missing chart options safely', () => {
    const old = { version: 1, widgets: ['clients', 'income-expenses'] } as const
    expect(resolveDashboardWidgets({ ...old, widgets: [...old.widgets] })).toEqual(old.widgets)
    expect(resolveDashboardChart({ ...old, widgets: [...old.widgets] })).toEqual({
      incomeChart: 'bars',
      incomeMonths: 6,
    })
    expect(
      resolveDashboardChart({
        version: 1,
        widgets: [],
        incomeChart: 'invalid',
        incomeMonths: 99,
      } as unknown as DashboardConfig),
    ).toEqual({ incomeChart: 'bars', incomeMonths: 6 })
    expect(resolveDashboardWidgets()).toEqual(defaultDashboardWidgets)
    expect(
      resolveDashboardLayout({ version: 1, widgets: ['key-metrics', 'income-expenses'] }).modules,
    ).toEqual([
      { id: 'key-metrics', width: 12 },
      { id: 'income-expenses', width: 6 },
    ])
  })

  it.each(['ranking', 'radial'] as const)(
    'round-trips the %s format through tenant persistence',
    (format) => {
      const config: DashboardConfig = {
        version: 1,
        widgets: ['recent-movements', 'expense-categories', 'income-expenses'],
        widths: { 'recent-movements': 8, 'income-expenses': 9 },
        incomeChart: 'lines',
        incomeMonths: 12,
        charts: {
          'expense-categories': { format, months: 6 },
          'estimate-status': { metric: 'count', months: 'all' },
        },
      }
      const tenant = tenantFromRow({ id: 'test', dashboard_config: config })
      expect(resolveDashboardWidgets(tenant.dashboardConfig)).toEqual(config.widgets)
      const { modules } = resolveDashboardLayout(tenant.dashboardConfig)
      const charts = resolveDashboardCharts(tenant.dashboardConfig)
      expect(charts).toEqual({
        incomeChart: 'lines',
        incomeMonths: 12,
        ...config.charts,
      })
      expect(
        tenantToRow({
          ...tenant,
          dashboardConfig: dashboardConfigFrom({
            modules: [...modules, newDashboardWidget('clients')],
            charts,
          }),
        }).dashboard_config,
      ).toEqual({
        ...config,
        widgets: [...config.widgets, 'clients'],
        widths: { ...config.widths, 'expense-categories': 6, clients: 6 },
      })
    },
  )
})
