import { describe, expect, it } from 'vitest'

import { tenantFromRow, tenantToRow } from './supabase-mappers'

describe('company settings mapping', () => {
  it('preserves reminders without reading or writing the retired weekly summary setting', () => {
    const tenant = tenantFromRow({
      id: 'tenant-1',
      name: 'Empresa',
      auto_reminders: true,
      weekly_summary: false,
    })

    expect(tenant.autoReminders).toBe(true)
    expect(tenant).not.toHaveProperty('weeklySummary')
    expect(tenantToRow(tenant)).toMatchObject({ auto_reminders: true })
    expect(tenantToRow(tenant)).not.toHaveProperty('weekly_summary')
  })
})
