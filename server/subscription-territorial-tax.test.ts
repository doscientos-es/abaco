import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const tenant = '10000000-0000-4000-8000-000000000001'
const payment = '10000000-0000-4000-8000-000000000002'

describe('territorial tax before subscription reservation', () => {
  const db = new PGlite()
  const mode = (role: 'authenticated' | 'service_role' | 'anon', actor = 'outsider') =>
    db.exec(`reset role; select set_config('test.actor', '${actor}', false); set role ${role}`)
  const detail = () =>
    db.query<{ tax: { status: string; territory: string; override: string | null } }>(
      'select public.subscription_billing_tax($1) as tax',
      [tenant],
    )
  const override = (territory: string | null) =>
    db.query('select public.superadmin_set_subscription_tax_territory($1,$2)', [tenant, territory])
  const postcode = (value: string) =>
    db.query('update public.subscription_billing_profiles set postal_code=$1 where tenant_id=$2', [
      value,
      tenant,
    ])

  beforeAll(async () => {
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create schema auth; create schema app_private;
      create type public.app_role as enum ('admin','owner','user');
      create function auth.uid() returns uuid language sql stable
        return case when current_setting('test.actor', true)='platform' then '20000000-0000-4000-8000-000000000001'::uuid end;
      create function auth.role() returns text language sql stable
        return case when current_setting('test.actor',true)='system' then 'service_role' else 'authenticated' end;
      create function public.is_platform_superadmin() returns boolean language sql stable
        return current_setting('test.actor',true)='platform';
      create function public.has_role(uuid, public.app_role[]) returns boolean language sql stable
        return current_setting('test.actor',true)='owner'
          and $1='10000000-0000-4000-8000-000000000001'::uuid;
      create table public.tenants(id uuid primary key, billing_vat_percent int);
      create table public.subscription_billing_profiles(tenant_id uuid primary key, postal_code text);
      create table public.billing_payments(id uuid primary key, tenant_id uuid, status text, vat_percent int);
      create table app_private.subscription_invoice_handoffs(payment_id uuid, recipient jsonb);
      insert into public.tenants values ('${tenant}',21);
      insert into public.subscription_billing_profiles values ('${tenant}','08001');
      insert into public.billing_payments values ('${payment}','${tenant}','failed',21);
    `)
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261127174639_subscription_territorial_tax.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)
  afterAll(() => db.close())

  it('classifies mainland, Balearics, Canarias, Ceuta and Melilla with current issuer support', async () => {
    for (const [postal, territory, status] of [
      ['08001', 'mainland', 'ready'],
      ['07001', 'balearic', 'ready'],
      ['35001', 'canary', 'outside_iva'],
      ['38001', 'canary', 'outside_iva'],
      ['51001', 'ceuta', 'outside_iva'],
      ['52001', 'melilla', 'outside_iva'],
      ['53000', 'review', 'review'],
    ] as const) {
      await db.exec('reset role')
      await postcode(postal)
      await mode('authenticated', 'owner')
      expect((await detail()).rows[0]?.tax).toMatchObject({ territory, status })
    }
  })

  it('blocks other tenants and anonymous callers and permits only platform admins to override', async () => {
    await mode('anon')
    await expect(detail()).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated')
    await expect(detail()).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated', 'owner')
    await expect(override('mainland')).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
    await postcode('35001')
    await mode('authenticated', 'platform')
    await override('mainland')
    expect((await detail()).rows[0]?.tax).toMatchObject({ status: 'review', territory: 'mainland' })
    await db.exec('reset role')
    await postcode('07001')
    await mode('service_role', 'system')
    expect((await detail()).rows[0]?.tax).toMatchObject({ status: 'ready', override: null })
  })

  it('rejects unsupported territorial invoices from the database before a charge is reserved', async () => {
    await db.exec('reset role')
    const handoff = (postal: string) =>
      db.query(
        "insert into app_private.subscription_invoice_handoffs values($1,jsonb_build_object('postal_code',$2::text))",
        [payment, postal],
      )
    await expect(handoff('52001')).rejects.toMatchObject({ code: '22023' })
    await expect(handoff('07001')).resolves.toBeDefined()
    await db.query('update public.billing_payments set vat_percent=0 where id=$1', [payment])
    await expect(handoff('07001')).rejects.toMatchObject({ code: '22023' })
  })
})
