import { describe, expect, it } from 'vitest'

import type { DashboardConfig } from '@/shared/domain/types'
import { tenantFromRow, tenantToRow } from '@/shared/store/supabase-mappers'

import {
  defaultDashboardWidgets,
  resolveDashboardChart,
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
    }
    const tenant = tenantFromRow({ id: 'test', dashboard_config: config })
    expect(resolveDashboardWidgets(tenant.dashboardConfig)).toEqual(config.widgets)
    expect(resolveDashboardChart(tenant.dashboardConfig)).toEqual({
      incomeChart: 'lines',
      incomeMonths: 12,
    })
    expect(tenantToRow(tenant).dashboard_config).toEqual(config)
  })
})
