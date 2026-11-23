import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('referral card payment history', () => {
  const db = new PGlite()
  const referrer = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const referred = '00000000-0000-4000-8000-000000000003'
  const payment = '00000000-0000-4000-8000-000000000004'
  const historical = '00000000-0000-4000-8000-000000000005'
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create schema app_private;
      create table public.tenants (id uuid primary key);
      create table public.billing_payments (id uuid primary key, tenant_id uuid, amount_cents integer,
        status text, settled_at timestamptz);
      create table app_private.referral_attributions (tenant_id uuid primary key, referrer_id uuid,
        created_at timestamptz);
      create table app_private.referral_attribution_audit (id uuid primary key, tenant_id uuid,
        previous_referrer_id uuid, changed_at timestamptz);
    `)
    await db.query('insert into public.tenants values ($1), ($2), ($3)', [
      referrer,
      other,
      referred,
    ])
    await db.query('insert into app_private.referral_attributions values ($1, $2, $3)', [
      referred,
      referrer,
      '2026-01-01T00:00:00Z',
    ])
    await db.query(
      "insert into public.billing_payments values ($1, $2, 500, 'succeeded', '2026-01-10T00:00:00Z')",
      [historical, referred],
    )
    await db.query(
      "insert into app_private.referral_attribution_audit values ($1, $2, $3, '2026-02-01T00:00:00Z')",
      ['00000000-0000-4000-8000-000000000006', referred, other],
    )
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261123203041_referral_card_payments.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)
  afterAll(async () => db.close())

  it('reconstructs historical attribution before a later correction', async () => {
    const result = await db.query<{ referrer_id: string }>(
      'select referrer_id from app_private.referral_card_payments where payment_id = $1',
      [historical],
    )
    expect(result.rows[0]?.referrer_id).toBe(other)
  })

  it('records only a successful card payment, using the Madrid calendar month', async () => {
    await db.query("insert into public.billing_payments values ($1, $2, 1210, 'pending', null)", [
      payment,
      referred,
    ])
    await db.query(
      "update public.billing_payments set status = 'failed', settled_at = '2026-02-28T23:30:00Z' where id = $1",
      [payment],
    )
    expect(
      (
        await db.query('select * from app_private.referral_card_payments where payment_id = $1', [
          payment,
        ])
      ).rows,
    ).toHaveLength(0)
    await db.query("update public.billing_payments set status = 'pending' where id = $1", [payment])
    await db.query("update public.billing_payments set status = 'succeeded' where id = $1", [
      payment,
    ])
    const result = await db.query<{ referrer_id: string; paid_cents: number; month: string }>(
      'select referrer_id, paid_cents, paid_month::text as month from app_private.referral_card_payments where payment_id = $1',
      [payment],
    )
    expect(result.rows).toEqual([{ referrer_id: referrer, paid_cents: 1210, month: '2026-03-01' }])
  })

  it('preserves attribution after a superadmin correction', async () => {
    await db.query(
      'update app_private.referral_attributions set referrer_id = $1 where tenant_id = $2',
      [other, referred],
    )
    expect(
      (
        await db.query<{ referrer_id: string }>(
          'select referrer_id from app_private.referral_card_payments where payment_id = $1',
          [payment],
        )
      ).rows[0]?.referrer_id,
    ).toBe(referrer)
  })
})
