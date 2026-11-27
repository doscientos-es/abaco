import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const actor = '20000000-0000-4000-8000-000000000001'
const company = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'

describe('superadmin activity ledger', () => {
  const db = new PGlite()
  const mode = (role: 'anon' | 'authenticated', platform = false) =>
    db.exec(
      `reset role; select set_config('test.admin', '${platform ? 'yes' : 'no'}', false); set role ${role}`,
    )
  const read = async (tenant: string | null = null, kind: string | null = null, offset = 0) =>
    (
      await db.query<{ events: unknown[] }>(
        'select public.superadmin_activity($1,$2,$3) as events',
        [tenant, kind, offset],
      )
    ).rows[0]?.events

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql stable return '${actor}'::uuid;
      create function public.is_platform_superadmin() returns boolean language sql stable
        return current_setting('test.admin', true) = 'yes';
      create table auth.users(id uuid primary key,email text);
      create table public.tenants(id uuid primary key,name text);
      create table app_private.platform_company_actions(id bigint,tenant_id uuid,actor_id uuid,performed_at timestamptz,action text);
      create table public.billing_agreement_log(id bigint,tenant_id uuid,actor_id uuid,changed_at timestamptz,previous_terms jsonb,scheduled_terms jsonb);
      create table app_private.subscription_tax_overrides(tenant_id uuid,postal_code text,territory text);
      create table public.billing_catalog(plan text,seats int,monthly_cents int,seat_monthly_cents int);
      create table public.billing_module_catalog(code text,monthly_cents int,yearly_cents int);
      create table public.tenant_modules(tenant_id uuid,module_code text,gifted bool);
      grant insert on public.tenant_modules to authenticated;
      insert into auth.users values ('${actor}','operator@example.test');
      insert into public.tenants values ('${company}','Empresa ficticia'),('${other}','Otra');
      insert into app_private.platform_company_actions values (1,'${company}','${actor}',now()-interval '1 day','pause');
      insert into public.billing_agreement_log values
        (1,'${company}','${actor}',now()-interval '2 days','{"vat_percent":21}','{"vat_percent":0,"tax_id":"PRIVATE"}'),
        (2,'${other}','${actor}',now()-interval '3 days',null,
          '{"plan":"standard","net_cents":{"private":"PRIVATE"},"period":"month","postal_code":"PRIVATE"}');
      insert into public.billing_module_catalog values ('ai',375,4500);
      insert into public.billing_catalog values ('standard',1,2900,800);
    `)
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20261127175636_superadmin_activity.sql', import.meta.url),
        'utf8',
      ),
    )
  }, 30000)
  afterAll(() => db.close())

  it('denies anonymous and ordinary users and blocks direct edits even for admins', async () => {
    await mode('anon')
    await expect(read()).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated')
    await expect(read()).rejects.toMatchObject({ code: '42501' })
    await mode('authenticated', true)
    await expect(
      db.exec('insert into app_private.platform_activity_events default values'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(read(null, 'made-up')).rejects.toMatchObject({ code: '22023' })
    await expect(read(null, null, 5000)).rejects.toMatchObject({ code: '22023' })
  })

  it('reads and filters safe projections from both legacy sources', async () => {
    await mode('authenticated', true)
    const events = await read(company)
    expect(events).toHaveLength(2)
    expect(events).toMatchObject([
      { kind: 'renovacion', subject: 'pause', actor_email: 'operator@example.test' },
      { kind: 'iva', before: { vat_percent: 21 }, after: { vat_percent: 0 } },
    ])
    expect((await read(other, 'acuerdo'))?.[0]).toMatchObject({
      after: { plan: 'standard', period: 'month' },
    })
    expect(JSON.stringify(await read())).not.toContain('PRIVATE')
  })

  it('audits allowed platform changes, not client changes, no-ops or rollbacks', async () => {
    await mode('authenticated')
    await db.query("insert into public.tenant_modules values($1,'ai',true)", [other])
    await db.exec(`reset role; select set_config('test.admin','yes',false);
      update public.billing_module_catalog set monthly_cents=400 where code='ai';
      update public.billing_module_catalog set monthly_cents=400 where code='ai';
      insert into app_private.subscription_tax_overrides values('${company}','PRIVATE','canary');
      insert into public.tenant_modules values('${company}','ai',true);`)
    await db.exec('begin; update public.billing_catalog set monthly_cents=9999; rollback;')
    await mode('authenticated', true)
    expect(await read(null, 'tarifa_modulo')).toMatchObject([
      { subject: 'ai', before: { monthly_cents: 375 }, after: { monthly_cents: 400 } },
    ])
    expect(await read(null, 'tarifa_plan')).toEqual([])
    expect(await read(null, 'cortesia_modulo')).toMatchObject([
      { tenant_id: company, after: { gifted: true } },
    ])
    expect(JSON.stringify(await read(company, 'territorio'))).not.toContain('PRIVATE')
  })
})
