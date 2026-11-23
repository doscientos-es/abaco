import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('referral discount calculation', () => {
  const db = new PGlite()
  const calculate = async (net: number, paid: number) => {
    const result = await db.query<{
      original_cents: number
      credit_cents: number
      net_cents: number
      total_cents: number
      discount_cents: number
    }>('select * from app_private.referral_discount_breakdown($1, $2)', [net, paid])
    return result.rows[0]
  }

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create schema app_private;
      create function app_private.billing_total(p_net integer, p_vat integer) returns integer
      language sql immutable strict as $$ select ((p_net::bigint * (100 + p_vat) + 50) / 100)::integer $$;
    `)
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261123202311_referral_discount_calculation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)
  afterAll(async () => db.close())

  it('calculates 10% of gross payments and keeps VAT consistent', async () => {
    expect(await calculate(1000, 3000)).toEqual({
      original_cents: 1210,
      credit_cents: 300,
      net_cents: 752,
      total_cents: 910,
      discount_cents: 300,
    })
  })

  it('rounds the gross payable down when exact VAT-inclusive cents are impossible', async () => {
    expect(await calculate(1000, 200)).toEqual({
      original_cents: 1210,
      credit_cents: 20,
      net_cents: 983,
      total_cents: 1189,
      discount_cents: 21,
    })
  })

  it('caps credit at the invoice total and rejects negative amounts', async () => {
    expect(await calculate(1000, 20000)).toEqual({
      original_cents: 1210,
      credit_cents: 1210,
      net_cents: 0,
      total_cents: 0,
      discount_cents: 1210,
    })
    await expect(calculate(-1, 10)).rejects.toMatchObject({ code: '22023' })
    await expect(calculate(10, -1)).rejects.toMatchObject({ code: '22023' })
  })

  it('always chooses the largest representable amount no greater than the target', async () => {
    const { rows } = await db.query<{ errors: number }>(`
      select count(*)::integer as errors from generate_series(0, 500) n
      cross join generate_series(0, 500, 7) paid
      cross join lateral app_private.referral_discount_breakdown(n, paid) d
      where d.total_cents > d.original_cents - d.credit_cents
        or d.total_cents <> app_private.billing_total(d.net_cents, 21)
        or (d.net_cents < n and app_private.billing_total(d.net_cents + 1, 21)
          <= d.original_cents - d.credit_cents)
    `)
    expect(rows[0]?.errors).toBe(0)
  })
})
