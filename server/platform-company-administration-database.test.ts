import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const paid = '00000000-0000-4000-8000-000000000010'
const courtesy = '00000000-0000-4000-8000-000000000020'
const overdue = '00000000-0000-4000-8000-000000000030'
const actor = '00000000-0000-4000-8000-000000000040'

describe('superadmin company controls and scoped invoices', () => {
  const db = new PGlite()
  const mode = (role: 'authenticated' | 'anon', admin = false) =>
    db.exec(
      `reset role; select set_config('test.admin', '${admin ? 'yes' : 'no'}', false); set role ${role}`,
    )
  const directory = async (
    status: string | null = null,
    period: string | null = null,
    name = '',
    sort = 'name',
    offset = 0,
  ) =>
    (
      await db.query<{
        result: {
          total: number
          counts: Record<string, number>
          rows: { id: string; archived_at: string; member_count: number; billing_bucket: string }[]
        }
      }>('select public.superadmin_company_directory_v2($1,$2,$3,$4,$5) as result', [
        name,
        offset,
        status,
        period,
        sort,
      ])
    ).rows[0]?.result
  const action = (id: string, kind: string, pause = false, archivedAt: string | null = null) =>
    db.query('select public.superadmin_company_action($1,$2,$3,$4)', [id, kind, pause, archivedAt])
  const invoices = (company: string | null, reference?: string) =>
    db.query<{ tenant_id: string; invoice_number: string }>(
      'select tenant_id, invoice_number from public.superadmin_subscription_invoice_directory($1,0,null,$2,$3)',
      ['', company, reference ?? null],
    )

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema app_private;
      create schema auth;
      create function auth.uid() returns uuid language sql stable return '${actor}'::uuid;
      create function public.is_platform_superadmin() returns boolean language sql stable
        return current_setting('test.admin', true) = 'yes';
      create table public.tenants (
        id uuid primary key, name text not null, plan text not null, subscription_status text not null,
        billing_interval text, current_period_end timestamptz, is_complimentary boolean not null,
        created_at timestamptz not null, cancel_at_period_end boolean not null default false
      );
      create table public.memberships(tenant_id uuid);
      create table public.billing_payments (
        id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
        invoice_number text, invoice_status text, invoice_portal_url text, merchant_order text,
        amount_cents integer, status text, settled_at timestamptz, created_at timestamptz default now()
      );
      insert into public.tenants values
        ('${paid}','Taller Norte','standard','active','month',now()+interval '1 month',false,now()-interval '3 days',false),
        ('${courtesy}','Taller Norte','trial','trialing',null,null,true,now()-interval '2 days',false),
        ('${overdue}','Taller Este','standard','past_due','year',now()-interval '1 day',false,now()-interval '1 day',false);
      insert into public.memberships values ('${paid}'), ('${paid}');
      insert into public.billing_payments (tenant_id, merchant_order, status, invoice_number, invoice_status, amount_cents, settled_at) values
        ('${paid}','2401AAAA','succeeded','ML-SUS-1','sent',3500,now()),
        ('${courtesy}','2401BBBB','succeeded','ML-SUS-2','sent',500,now()),
        ('${overdue}','2401CCCC','pending',null,null,3500,null);
    `)
    for (const migration of [
      '20261127164315_platform_overview',
      '20261127171520_platform_company_administration',
    ]) {
      await db.exec(
        await readFile(new URL(`../supabase/migrations/${migration}.sql`, import.meta.url), 'utf8'),
      )
    }
  }, 30_000)

  afterAll(() => db.close())

  it('rejects anonymous and regular authenticated clients for every operation', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await mode(role)
      await expect(directory()).rejects.toMatchObject({ code: '42501' })
      await expect(invoices(paid)).rejects.toMatchObject({ code: '42501' })
      await expect(action(paid, 'pause')).rejects.toMatchObject({ code: '42501' })
    }
  })

  it('counts and filters deterministically by state, period and exact company ID', async () => {
    await mode('authenticated', true)
    const result = await directory(null, null, 'Taller', 'newest')
    expect(result?.counts).toEqual({ active: 1, attention: 1, courtesy: 1 })
    expect(result?.rows.map(({ id }) => id)).toEqual([overdue, courtesy, paid])
    expect((await directory(null, null, 'Taller', 'newest', 1))?.rows.map(({ id }) => id)).toEqual([
      courtesy,
      paid,
    ])
    expect((await directory(null, 'month', paid))?.rows).toMatchObject([
      { id: paid, member_count: 2 },
    ])
    expect((await directory('courtesy', 'none'))?.total).toBe(1)
    expect((await directory('courtesy', 'year'))?.total).toBe(0)
  })

  it('guards outstanding payments and makes pause, archive and restore safe and reversible', async () => {
    await mode('authenticated', true)
    const {
      rows: [before],
    } = await invoices(paid)
    await expect(action(overdue, 'pause')).rejects.toThrow('Hay un pago en curso')
    await expect(action(paid, 'archive')).rejects.toThrow('Pausa la renovación')
    await action(paid, 'pause')
    await expect(action(paid, 'resume')).rejects.toMatchObject({ code: '40001' })
    expect((await directory('paused'))?.total).toBe(1)
    await action(paid, 'archive', true)
    expect((await directory())?.rows.some(({ id }) => id === paid)).toBe(false)
    const archived = (await directory('archived'))?.rows[0]
    expect(archived?.id).toBe(paid)
    expect(archived?.archived_at).toMatch(/202/)
    expect((await invoices(paid)).rows).toEqual([before])
    await expect(action(paid, 'resume', true, archived?.archived_at)).rejects.toThrow(
      'no tiene una renovación',
    )
    await action(paid, 'restore', true, archived?.archived_at)
    await db.exec('reset role')
    const retained = await db.query<{ restored: boolean }>(
      'select restored_at is not null as restored from app_private.platform_archived_companies where tenant_id = $1',
      [paid],
    )
    expect(retained.rows[0]?.restored).toBe(true)
    await db.exec('set role authenticated')
    expect((await directory('paused'))?.total).toBe(1)
    await action(paid, 'resume', true)
    expect((await directory('active'))?.total).toBe(1)
    await db.exec('reset role')
    const result = await db.query<{ action: string; actor_id: string }>(
      'select action,actor_id from app_private.platform_company_actions order by id',
    )
    expect(result.rows).toEqual(
      ['pause', 'archive', 'restore', 'resume'].map((kind) => ({ action: kind, actor_id: actor })),
    )
    expect((await db.query('select * from public.billing_payments')).rows).toHaveLength(3)
  })

  it('surfaces an archived company again for review when it resumes its own renewal', async () => {
    await mode('authenticated', true)
    await action(paid, 'pause')
    await action(paid, 'archive', true)
    await db.exec('reset role')
    await db.query('update public.tenants set cancel_at_period_end = false where id = $1', [paid])
    await mode('authenticated', true)
    const main = await directory()
    expect(main?.total).toBe(3)
    expect(main?.counts).toMatchObject({ archived: 1, attention: 2 })
    expect(main?.rows.find(({ id }) => id === paid)?.billing_bucket).toBe('attention')
    const archived = (await directory('archived'))?.rows[0]
    expect(archived).toMatchObject({ id: paid, billing_bucket: 'attention' })
    await action(paid, 'restore', false, archived?.archived_at)
  })

  it('scopes invoice records to the exact tenant, even for identical company names', async () => {
    await mode('authenticated', true)
    expect((await invoices(paid)).rows).toEqual([{ tenant_id: paid, invoice_number: 'ML-SUS-1' }])
    expect((await invoices(courtesy)).rows).toEqual([
      { tenant_id: courtesy, invoice_number: 'ML-SUS-2' },
    ])
    expect((await invoices(paid, '2401BBBB')).rows).toEqual([])
    expect((await invoices(null, '2401BBBB')).rows).toEqual([
      { tenant_id: courtesy, invoice_number: 'ML-SUS-2' },
    ])
  })
})
