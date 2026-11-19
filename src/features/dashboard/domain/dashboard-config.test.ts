import { describe, expect, it } from 'vitest'

import type { DashboardConfig } from '@/shared/domain/types'
import { tenantFromRow, tenantToRow } from '@/shared/store/supabase-mappers'

import {
  dashboardConfigFrom,
  defaultDashboardWidgets,
  resolveDashboardChart,
  resolveDashboardCharts,
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
  })

  it('round-trips selected widgets and chart options through tenant persistence', () => {
    const config: DashboardConfig = {
      version: 1,
      widgets: ['recent-movements', 'expense-categories', 'income-expenses'],
      incomeChart: 'lines',
      incomeMonths: 12,
      charts: {
        'expense-categories': { format: 'ranking', months: 6 },
        'estimate-status': { metric: 'count', months: 'all' },
      },
    }
    const tenant = tenantFromRow({ id: 'test', dashboard_config: config })
    expect(resolveDashboardWidgets(tenant.dashboardConfig)).toEqual(config.widgets)
    const widgets = resolveDashboardWidgets(tenant.dashboardConfig)
    const charts = resolveDashboardCharts(tenant.dashboardConfig)
    expect(charts).toEqual({
      incomeChart: 'lines',
      incomeMonths: 12,
      ...config.charts,
    })
    expect(
      tenantToRow({
        ...tenant,
        dashboardConfig: dashboardConfigFrom([...widgets, 'clients'], charts),
      }).dashboard_config,
    ).toEqual({
      ...config,
      widgets: [...config.widgets, 'clients'],
    })
  })
})
