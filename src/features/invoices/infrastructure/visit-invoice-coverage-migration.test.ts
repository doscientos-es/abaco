import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const key = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const tenant = key(1)
const otherTenant = key(2)
const client = key(3)
const otherClient = key(4)
const visit = key(5)
const report = key(6)
const invoice = key(7)
const mismatch = key(8)
const crossTenant = key(9)
const zeroInvoice = key(10)
const another = key(11)
const admin = key(12)

describe('visit invoice coverage migration', () => {
  const db = new PGlite()
  const coverage = (input: {
    invoiceId?: string
    visitId?: string
    tenantId?: string
    action?: 'attach' | 'detach'
    confirmation?: boolean
    reason?: string
    operation: number
  }) =>
    db.query('select public.set_service_visit_invoice_coverage($1,$2,$3,$4,$5,$6,$7)', [
      input.tenantId ?? tenant,
      input.visitId ?? visit,
      input.invoiceId ?? invoice,
      input.action ?? 'attach',
      input.confirmation ?? input.action !== 'detach',
      input.reason ?? 'Coherente con el parte y las líneas de la factura',
      key(input.operation),
    ])
  const readCoverage = async () =>
    (
      await db.query<{ coverage_invoice_id: string | null }>(
        'select coverage_invoice_id from public.service_visit_billing_reviews where visit_id=$1',
        [visit],
      )
    ).rows[0]?.coverage_invoice_id

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create schema app_private;
      revoke all on schema app_private from public, anon, authenticated;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create type public.app_role as enum ('owner', 'admin', 'editor', 'technician');
      create function public.has_role(target uuid, allowed public.app_role[]) returns boolean
        language sql as $$ select target::text = current_setting('test.tenant', true)
          and nullif(current_setting('test.role', true), '')::public.app_role = any(allowed) $$;
      create function public.tenant_can_write(uuid) returns boolean
        language sql as $$ select current_setting('test.write', true) = 'yes' $$;
      create function public.company_onboarding_allows_workspace(uuid) returns boolean
        language sql as $$ select current_setting('test.onboarded', true) = 'yes' $$;
      create function public.reject_work_history_change() returns trigger
        language plpgsql as $$ begin raise exception 'immutable'; end; $$;
      create table public.clients(id uuid, tenant_id uuid, primary key(id,tenant_id));
      create table public.invoices(id uuid, tenant_id uuid, client_id uuid, status text, total_cents bigint,
        primary key(id,tenant_id));
      create table public.service_visits(id uuid, tenant_id uuid, client_id uuid, status text,
        contract_id uuid, work_order_id uuid, actual_end_at timestamptz, updated_at timestamptz default now(), primary key(id,tenant_id));
      create table public.service_visit_report_versions(id uuid, visit_id uuid, tenant_id uuid, version integer);
      create table public.service_visit_report_reviews(report_version_id uuid primary key, tenant_id uuid);
    `)
    const migrations = [
      '20261027144101_visit_billing_reviews.sql',
      '20261128143700_visit_invoice_coverage.sql',
    ]
    for (const migration of migrations)
      await db.exec(
        await readFile(
          new URL(`../../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )
    await db.exec(`
      insert into public.clients values ('${client}','${tenant}'), ('${otherClient}','${tenant}');
      insert into public.service_visits(id,tenant_id,client_id,status,contract_id,work_order_id) values ('${visit}','${tenant}','${client}','completed',null,null);
      insert into public.service_visit_billing_reviews(visit_id,tenant_id,client_id,source_kind,status)
        values ('${visit}','${tenant}','${client}','standalone','bill_separately');
      insert into public.invoices values
        ('${invoice}','${tenant}','${client}','issued',4500),
        ('${mismatch}','${tenant}','${otherClient}','issued',4500),
        ('${crossTenant}','${otherTenant}','${client}','issued',4500),
        ('${zeroInvoice}','${tenant}','${client}','issued',0),
        ('${another}','${tenant}','${client}','issued',4500);
      insert into public.service_visit_report_versions values ('${report}','${visit}','${tenant}',1);
      select set_config('test.uid','${admin}',false), set_config('test.tenant','${tenant}',false),
        set_config('test.role','admin',false), set_config('test.write','yes',false), set_config('test.onboarded','yes',false);
      set role authenticated;
    `)
  }, 30000)
  afterAll(async () => db.close())

  it('keeps historical work visible, rejects anonymous/direct writes, and enforces owner/admin, tenant and workspace', async () => {
    expect(await readCoverage()).toBeNull()
    await db.exec('reset role; set role anon')
    await expect(coverage({ operation: 21 })).rejects.toMatchObject({ code: '42501' })
    await db.exec(
      "reset role; set role authenticated; select set_config('test.role','editor',false)",
    )
    expect(await readCoverage()).toBeUndefined()
    await expect(coverage({ operation: 22 })).rejects.toMatchObject({ code: '42501' })
    await db.exec(
      "select set_config('test.role','admin',false), set_config('test.onboarded','no',false)",
    )
    await expect(coverage({ operation: 23 })).rejects.toMatchObject({ code: '42501' })
    await db.exec(
      "select set_config('test.onboarded','yes',false), set_config('test.write','no',false)",
    )
    await expect(coverage({ operation: 24 })).rejects.toMatchObject({ code: '42501' })
    await db.exec("select set_config('test.write','yes',false)")
    await expect(coverage({ tenantId: otherTenant, operation: 25 })).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      db.query('update public.service_visit_billing_reviews set coverage_invoice_id=$1', [invoice]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.query('select app_private.set_service_visit_invoice_coverage($1,$2,$3,$4,$5,$6,$7)', [
        tenant,
        visit,
        invoice,
        'attach',
        true,
        'No direct calls',
        key(26),
      ]),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('requires a reviewed latest report, a reason and explicit full coverage by a positive issued invoice of this client', async () => {
    await expect(coverage({ operation: 31 })).rejects.toMatchObject({ code: 'P0409' })
    await db.exec(`reset role;
      insert into public.service_visit_report_reviews values ('${report}','${tenant}');
      insert into public.service_visit_report_versions values ('${key(30)}','${visit}','${tenant}',2);
      set role authenticated;
    `)
    await expect(coverage({ operation: 32 })).rejects.toMatchObject({ code: 'P0409' })
    await db.exec(`reset role;
      insert into public.service_visit_report_reviews values ('${key(30)}','${tenant}');
      set role authenticated;
    `)
    await expect(coverage({ confirmation: false, operation: 33 })).rejects.toMatchObject({
      code: '22023',
    })
    await expect(coverage({ reason: '  ', operation: 34 })).rejects.toMatchObject({ code: '22023' })
    for (const [index, invoiceId] of [mismatch, crossTenant, zeroInvoice].entries())
      await expect(coverage({ invoiceId, operation: 35 + index })).rejects.toMatchObject({
        code: 'P0002',
      })
    expect(await readCoverage()).toBeNull()
  })

  it('records immutable attachment and undo with replay safety without changing invoices', async () => {
    await db.exec(`reset role;
      insert into public.service_visit_report_reviews values ('${report}','${tenant}') on conflict do nothing;
      insert into public.service_visit_report_reviews values ('${key(30)}','${tenant}') on conflict do nothing;
      set role authenticated;
    `)
    const action = { operation: 41 }
    await coverage(action)
    await coverage(action)
    expect(await readCoverage()).toBe(invoice)
    await expect(coverage({ invoiceId: another, operation: 42 })).rejects.toMatchObject({
      code: 'P0409',
    })
    await expect(coverage({ ...action, reason: 'Otro motivo' })).rejects.toMatchObject({
      code: '23505',
    })
    await expect(
      coverage({ action: 'detach', invoiceId: another, operation: 43 }),
    ).rejects.toMatchObject({ code: 'P0409' })
    await coverage({ action: 'detach', reason: 'Corregir la asociación', operation: 44 })
    await coverage(action)
    expect(await readCoverage()).toBeNull()
    expect(
      (
        await db.query(
          'select action, invoice_id, actor_id from public.service_visit_invoice_coverage_events order by occurred_at',
        )
      ).rows,
    ).toEqual([
      { action: 'attach', invoice_id: invoice, actor_id: admin },
      { action: 'detach', invoice_id: invoice, actor_id: admin },
    ])
    await db.exec('reset role')
    await expect(
      db.query('delete from public.service_visit_invoice_coverage_events'),
    ).rejects.toThrow('immutable')
    expect(
      (
        await db.query('select status, total_cents::text from public.invoices where id=$1', [
          invoice,
        ])
      ).rows,
    ).toEqual([{ status: 'issued', total_cents: '4500' }])
    await db.exec('set role authenticated')
  })
})
