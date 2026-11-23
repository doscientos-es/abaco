import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('paid billing cycle', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const existingTenant = '00000000-0000-4000-8000-000000000002'

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema app_private;
      create table public.tenants (id uuid primary key, current_period_end timestamptz);
      create table public.billing_payments (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, status text,
        kind text, period text, settled_at timestamptz
      );
      create table app_private.subscription_invoice_handoffs (payment_id uuid, payload jsonb);
    `)
    await db.query(
      "insert into public.tenants (id,current_period_end) values ($1,'2026-02-28T12:00:00Z')",
      [existingTenant],
    )
    await db.query(
      `
      with payment as (
        insert into public.billing_payments (tenant_id,status,kind,period,settled_at)
        values ($1,'succeeded','first','month','2026-01-31T12:00:00Z') returning id
      ) insert into app_private.subscription_invoice_handoffs
      select id, '{"startsAt":"2026-01-31T12:00:00Z","endsAt":"2026-02-28T12:00:00Z"}'::jsonb
      from payment`,
      [existingTenant],
    )
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261123222348_paid_billing_cycle_start.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query('insert into public.tenants (id) values ($1)', [tenant])
  }, 30000)
  afterAll(async () => db.close())

  it('backfills a cycle from its exact invoice dates', async () => {
    const { rows } = await db.query<{ starts_at: Date; ends_at: Date }>(
      'select starts_at,ends_at from app_private.billing_paid_cycles where tenant_id=$1',
      [existingTenant],
    )
    expect(rows[0]?.starts_at.toISOString()).toBe('2026-01-31T12:00:00.000Z')
    expect(rows[0]?.ends_at.toISOString()).toBe('2026-02-28T12:00:00.000Z')
  })

  it('records the exact first payment time only when payment succeeds', async () => {
    await db.query(
      "insert into public.billing_payments (tenant_id,status,kind,period) values ($1,'pending','first','month')",
      [tenant],
    )
    await db.exec("update public.billing_payments set status='failed' where status='pending'")
    expect(
      (await db.query('select * from app_private.billing_paid_cycles where tenant_id=$1', [tenant]))
        .rows,
    ).toHaveLength(0)
    await db.query(
      "insert into public.billing_payments (tenant_id,status,kind,period) values ($1,'pending','first','month')",
      [tenant],
    )
    await db.exec(
      "update public.billing_payments set status='succeeded', settled_at=now() where status='pending'",
    )
    const { rows } = await db.query<{ same_start: boolean; same_end: boolean }>(`
      select c.starts_at=p.settled_at as same_start,
        c.ends_at=p.settled_at+interval '1 month' as same_end
      from app_private.billing_paid_cycles c join public.billing_payments p on p.tenant_id=c.tenant_id
      where p.status='succeeded' and c.tenant_id='00000000-0000-4000-8000-000000000001'`)
    expect(rows[0]).toEqual({ same_start: true, same_end: true })
  })

  it('starts renewal at the previous end, even after a month-end cycle', async () => {
    await db.query(
      "update public.tenants set current_period_end='2026-02-28T12:00:00Z' where id=$1",
      [tenant],
    )
    await db.query(
      "insert into public.billing_payments (tenant_id,status,kind,period) values ($1,'pending','renewal','month')",
      [tenant],
    )
    await db.exec(
      "update public.billing_payments set status='succeeded', settled_at=now() where status='pending'",
    )
    const { rows } = await db.query<{ starts_at: Date; ends_at: Date }>(
      'select starts_at,ends_at from app_private.billing_paid_cycles where tenant_id=$1',
      [tenant],
    )
    expect(rows[0]?.starts_at.toISOString()).toBe('2026-02-28T12:00:00.000Z')
    expect(rows[0]?.ends_at.toISOString()).toBe('2026-03-28T12:00:00.000Z')
  })

  it('does not let authenticated users alter cycle dates', async () => {
    const { rows } = await db.query<{ can_write: boolean }>(
      "select has_table_privilege('authenticated','app_private.billing_paid_cycles','update') as can_write",
    )
    expect(rows[0]?.can_write).toBe(false)
  })
})
