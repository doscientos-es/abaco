import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('platform overview and shared public prices', () => {
  const db = new PGlite()
  const mode = (role: 'authenticated' | 'anon', admin = false) =>
    db.exec(
      `reset role; select set_config('test.admin', '${admin ? 'yes' : 'no'}', false); set role ${role}`,
    )

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private;
      create function public.is_platform_superadmin() returns boolean language sql stable
        return current_setting('test.admin', true) = 'yes';
      create table public.tenants (
        id uuid primary key default gen_random_uuid(), name text, plan text,
        subscription_status text, billing_interval text, current_period_end timestamptz,
        is_complimentary boolean not null default false
      );
      create table public.memberships(tenant_id uuid);
      create table public.billing_payments (
        amount_cents integer, status text, settled_at timestamptz, created_at timestamptz default now()
      );
      insert into public.tenants(name,plan,subscription_status,current_period_end,is_complimentary)
        values ('Vencida','standard','active',now()-interval '1 day',false),
        ('Cortesía','trial','trialing',null,true),('Pendiente','standard','past_due',null,false);
      insert into public.tenants(name,plan,subscription_status,current_period_end)
        select 'Activa ' || i,'standard','active',now()+interval '1 day' from generate_series(1,51) i;
      insert into public.billing_payments(amount_cents,status,settled_at)
        values (12000,'succeeded',now()), (9000,'pending',null), (100,'failed',now()),
          (10000,'succeeded',now()-interval '8 months');
      create table public.billing_catalog (
        plan text, seats integer, monthly_cents integer,
        yearly_cents integer generated always as (monthly_cents*10) stored, seat_monthly_cents integer
      );
      insert into public.billing_catalog (plan,seats,monthly_cents,seat_monthly_cents)
        values ('standard',1,3480,800);
      create table public.billing_module_catalog (code text primary key, status text, monthly_cents integer, yearly_cents integer);
      alter table public.billing_module_catalog enable row level security;
      create policy module_public on public.billing_module_catalog for select to anon, authenticated using (status='pilot');
      insert into public.billing_module_catalog values ('ai','pilot',375,4500),('procurement','pilot',1500,15000),
        ('supplier_logistics','planned',2900,29000);
      grant select on public.billing_catalog, public.billing_module_catalog to anon, authenticated;
    `)
    for (const migration of [
      '20261127164315_platform_overview',
      '20261127164726_platform_pricing_catalog',
    ])
      await db.exec(
        await readFile(new URL(`../supabase/migrations/${migration}.sql`, import.meta.url), 'utf8'),
      )
  }, 30_000)

  afterAll(() => db.close())

  it('rejects anonymous and regular accounts while allowing the aggregate RPC for superadmins', async () => {
    await mode('anon')
    await expect(db.query('select public.superadmin_overview()')).rejects.toMatchObject({
      code: '42501',
    })
    await mode('authenticated')
    await expect(db.query('select public.superadmin_overview()')).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      db.query("select * from public.superadmin_company_directory('',0,null)"),
    ).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated', true)
    const { rows } = await db.query<{
      stats: { companies: object; collections: { cents: number; count: number }[] }
    }>('select public.superadmin_overview() as stats')
    expect(rows[0]?.stats.companies).toEqual({ active: 51, courtesy: 1, attention: 2 })
    expect(rows[0]?.stats.collections).toHaveLength(6)
    expect(rows[0]?.stats.collections.at(-1)).toMatchObject({ cents: 12000, count: 1 })
  })

  it('finds overdue customers separately and returns a real pagination lookahead', async () => {
    await mode('authenticated', true)
    const page = (offset: number, status: string) =>
      db.query<{ name: string }>('select name from public.superadmin_company_directory($1,$2,$3)', [
        '',
        offset,
        status,
      ])
    expect((await page(0, 'attention')).rows.map((row) => row.name)).toEqual([
      'Pendiente',
      'Vencida',
    ])
    expect((await page(0, 'active')).rows).toHaveLength(51)
    expect((await page(50, 'active')).rows).toHaveLength(1)
  })

  it('publishes exactly the same rates to anon, preserves units, and blocks stale module edits', async () => {
    await mode('anon')
    const pricing = () =>
      db.query<{ rates: object }>('select public.menoslios_public_pricing() as rates')
    const update = (expected: number, next: number) =>
      db.query("select public.superadmin_update_module_price('ai',$1,4500,$2,4800)", [
        expected,
        next,
      ])
    expect((await pricing()).rows[0]?.rates).toMatchObject({
      base_monthly_cents: 2900,
      base_yearly_cents: 29000,
      seat_monthly_cents: 800,
      seat_yearly_cents: 9600,
      modules: [
        { code: 'ai', unit: 'person' },
        { code: 'procurement', unit: 'company' },
      ],
    })
    await expect(update(375, 400)).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated')
    await expect(update(375, 400)).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated', true)
    await update(375, 400)
    await expect(update(375, 500)).rejects.toMatchObject({ code: '40001' })
    await mode('anon')
    expect((await pricing()).rows[0]?.rates).toMatchObject({
      modules: [{ code: 'ai', monthly_cents: 400, yearly_cents: 4800 }, { code: 'procurement' }],
    })
  })
})
