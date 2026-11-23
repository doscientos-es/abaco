import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('prorated upgrade calculation', () => {
  const db = new PGlite()
  const calculate = async (cents: number, start: string, end: string, at: string) =>
    (
      await db.query<{ cents: number }>(
        'select app_private.prorated_upgrade_net($1,$2,$3,$4) as cents',
        [cents, start, end, at],
      )
    ).rows[0]?.cents

  beforeAll(async () => {
    await db.exec('create schema app_private; create role anon; create role authenticated;')
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261123215616_prorated_upgrade_calculation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)
  afterAll(async () => db.close())

  it('charges the actual proportion of an annual or monthly cycle', async () => {
    expect(await calculate(4500, '2026-01-01Z', '2027-01-01Z', '2026-07-02T12:00Z')).toBe(2250)
    expect(await calculate(375, '2026-02-01Z', '2026-03-01Z', '2026-02-15Z')).toBe(188)
  })

  it('handles cycle boundaries and rounds only once to a cent', async () => {
    expect(await calculate(375, '2026-01-01Z', '2026-02-01Z', '2026-01-01Z')).toBe(375)
    expect(await calculate(375, '2026-01-01Z', '2026-02-01Z', '2026-02-01Z')).toBe(0)
    expect(await calculate(1, '2026-01-01Z', '2026-01-03Z', '2026-01-02Z')).toBe(1)
  })

  it('uses elapsed time rather than calendar-month assumptions across a clock change', async () => {
    const start = '2026-03-28T12:00:00+01:00'
    const end = '2026-03-30T12:00:00+02:00'
    expect(await calculate(4700, start, end, '2026-03-29T12:00:00+02:00')).toBe(2400)
  })

  it('rejects negative amounts and timestamps outside a valid cycle', async () => {
    await expect(calculate(-1, '2026-01-01Z', '2026-02-01Z', '2026-01-15Z')).rejects.toThrow()
    await expect(calculate(375, '2026-01-01Z', '2026-01-01Z', '2026-01-01Z')).rejects.toThrow()
    await expect(calculate(375, '2026-01-01Z', '2026-02-01Z', '2026-02-02Z')).rejects.toThrow()
    await expect(calculate(375, '2026-01-01Z', '2026-02-01Z', '2025-12-31Z')).rejects.toThrow()
  })
})
