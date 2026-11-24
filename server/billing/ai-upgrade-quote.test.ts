import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe('AI upgrade quote', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const user = '00000000-0000-4000-8000-000000000002'
  const other = '00000000-0000-4000-8000-000000000003'
  const quote = async (person = user) =>
    (
      await db.query<{ quote: Record<string, unknown> }>(
        'select app_private.ai_upgrade_quote($1,$2) as quote',
        [tenant, person],
      )
    ).rows[0]?.quote

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private; create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.tenants (id uuid primary key, is_complimentary boolean not null,
        subscription_status text not null, cancel_at_period_end boolean not null,
        current_period_end timestamptz, billing_interval text not null, billing_vat_percent integer);
      create table public.memberships (tenant_id uuid, user_id uuid, role text,
        primary key (tenant_id,user_id));
      create table public.billing_payments (tenant_id uuid, status text);
      create table app_private.billing_paid_cycles (tenant_id uuid primary key,
        starts_at timestamptz not null, ends_at timestamptz not null);
      create function public.tenant_can_write(uuid) returns boolean language sql as $$ select true $$;
      create function app_private.billing_total(integer, integer) returns integer language sql
        immutable strict as $$ select (($1::bigint * (100 + $2) + 50) / 100)::integer $$;
    `)
    for (const migration of [
      '20261123215616_prorated_upgrade_calculation.sql',
      '20261123221018_ai_access_reservations.sql',
      '20261123223704_ai_upgrade_quote.sql',
      '20261124074348_ai_upgrade_quote_for_admin.sql',
    ]) {
      await db.exec(
        await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'),
      )
    }
  }, 30000)
  afterAll(async () => db.close())

  beforeEach(async () => {
    await db.exec(`
      truncate app_private.ai_assignments, app_private.billing_paid_cycles,
        public.billing_payments, public.memberships, public.tenants cascade;
      insert into public.tenants values
        ('${tenant}',false,'active',false,now()+interval '180 days','month',21);
      insert into app_private.billing_paid_cycles values
        ('${tenant}',now()-interval '180 days'+interval '1 hour',now()+interval '180 days');
      insert into public.memberships values ('${tenant}','${user}','admin'),('${tenant}','${other}','user');
      select set_config('test.uid', '${user}', false);
    `)
  })

  it('quotes the remaining half-cycle and VAT for monthly and annual prices', async () => {
    expect(await quote()).toMatchObject({
      full_net_cents: 375,
      net_cents: 188,
      total_cents: 227,
      vat_percent: 21,
      already_paid: false,
      already_enabled: false,
    })
    await db.query("update public.tenants set billing_interval='year' where id=$1", [tenant])
    expect(await quote()).toMatchObject({
      full_net_cents: 4500,
      net_cents: 2250,
      total_cents: 2723,
    })
  })

  it('recognizes a disabled paid assignment without charging it twice', async () => {
    await db.query(
      `insert into app_private.ai_assignments
      select $1,$2,false,current_period_end from public.tenants where id=$1`,
      [tenant, user],
    )
    expect(await quote()).toMatchObject({
      already_paid: true,
      already_enabled: false,
      net_cents: 0,
      total_cents: 0,
    })
    await db.query('update app_private.ai_assignments set enabled=true where user_id=$1', [user])
    expect(await quote()).toMatchObject({ already_paid: true, already_enabled: true })
  })

  it('does not treat an earlier expiry as payment for the current cycle', async () => {
    await db.query(
      `insert into app_private.ai_assignments
      select $1,$2,false,current_period_end-interval '1 second' from public.tenants where id=$1`,
      [tenant, user],
    )
    expect(await quote()).toMatchObject({ already_paid: false, net_cents: 188 })
  })

  it('rejects users who cannot use AI and missing or mismatched cycle dates', async () => {
    await expect(quote(other)).rejects.toThrow('permisos')
    await db.query(
      "update app_private.billing_paid_cycles set ends_at=ends_at-interval '1 second' where tenant_id=$1",
      [tenant],
    )
    await expect(quote()).rejects.toThrow('ciclo de pago exacto')
    await db.query('delete from app_private.billing_paid_cycles where tenant_id=$1', [tenant])
    await expect(quote()).rejects.toThrow('ciclo de pago exacto')
  })

  it('rejects pending payments, cancelled and expired subscriptions', async () => {
    await db.query("insert into public.billing_payments values ($1,'pending')", [tenant])
    await expect(quote()).rejects.toThrow('pago pendiente')
    await db.query('delete from public.billing_payments where tenant_id=$1', [tenant])
    await db.query('update public.tenants set cancel_at_period_end=true where id=$1', [tenant])
    await expect(quote()).rejects.toThrow('ciclo de pago activo')
    await db.query(
      'update public.tenants set cancel_at_period_end=false, current_period_end=now() where id=$1',
      [tenant],
    )
    await expect(quote()).rejects.toThrow('ciclo de pago activo')
  })

  it('cannot be called directly by anonymous, authenticated or service roles', async () => {
    const { rows } = await db.query<{ blocked: boolean }>(`
      select not has_function_privilege('anon','app_private.ai_upgrade_quote(uuid,uuid)','execute')
        and not has_function_privilege('authenticated','app_private.ai_upgrade_quote(uuid,uuid)','execute')
        and not has_function_privilege('service_role','app_private.ai_upgrade_quote(uuid,uuid)','execute') as blocked`)
    expect(rows[0]?.blocked).toBe(true)
  })

  it('lets only tenant admins request a quote for an eligible member', async () => {
    const publicQuote = () =>
      db.query<{ quote: Record<string, unknown> }>(
        'select public.quote_ai_upgrade($1,$2) as quote',
        [tenant, user],
      )
    expect((await publicQuote()).rows[0]?.quote).toMatchObject({ net_cents: 188, total_cents: 227 })
    await db.query("select set_config('test.uid',$1,false)", [other])
    await expect(publicQuote()).rejects.toThrow('Solo un administrador')
    await db.query("select set_config('test.uid','',false)")
    await expect(publicQuote()).rejects.toThrow('Solo un administrador')
    await db.query("select set_config('test.uid',$1,false)", [user])
    await expect(
      db.query('select public.quote_ai_upgrade($1,$2)', [tenant, other]),
    ).rejects.toThrow('permisos')
  })

  it('grants quote access only to authenticated callers', async () => {
    const { rows } = await db.query<{ allowed: boolean }>(`
      select not has_function_privilege('anon','public.quote_ai_upgrade(uuid,uuid)','execute')
        and has_function_privilege('authenticated','public.quote_ai_upgrade(uuid,uuid)','execute')
        and not has_function_privilege('service_role','public.quote_ai_upgrade(uuid,uuid)','execute') as allowed`)
    expect(rows[0]?.allowed).toBe(true)
  })
})
