import { describe, expect, it } from 'vitest'

import { moduleNetForPlan, type ModuleSubscription } from './modules'

const subscriptions: ModuleSubscription[] = [
  {
    module_code: 'workers',
    enabled: true,
    next_enabled: null,
    gifted: false,
    monthly_cents: 500,
    yearly_cents: 5000,
  },
  {
    module_code: 'procurement',
    enabled: true,
    next_enabled: null,
    gifted: false,
    monthly_cents: 1000,
    yearly_cents: 10000,
  },
  {
    module_code: 'mcp',
    enabled: false,
    next_enabled: true,
    gifted: false,
    monthly_cents: 700,
    yearly_cents: 7000,
  },
  {
    module_code: 'supplier_logistics',
    enabled: true,
    next_enabled: null,
    gifted: true,
    monthly_cents: 2900,
    yearly_cents: 29000,
  },
]

describe('module charges by plan', () => {
  it('charges only active, non-gifted modules not included in the selected plan', () => {
    expect(moduleNetForPlan('team', 'month', subscriptions)).toBe(1700)
    expect(moduleNetForPlan('team', 'year', subscriptions)).toBe(17000)
  })

  it('does not charge modules included in Enterprise or modules gifted by a superadmin', () => {
    expect(moduleNetForPlan('scale', 'month', subscriptions)).toBe(0)
  })

  it('counts a scheduled activation when quoting the next payment', () => {
    expect(moduleNetForPlan('solo', 'month', subscriptions)).toBe(2200)
  })
})
