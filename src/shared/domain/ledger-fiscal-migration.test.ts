import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('ledger fiscal migration', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const entry = '00000000-0000-4000-8000-000000000002'
  const work = '00000000-0000-4000-8000-000000000003'
  const user = '00000000-0000-4000-8000-000000000004'
  const lines = [
    { rate: 21, baseCents: 10000, vatCents: 2100 },
    { rate: 10, baseCents: 10000, vatCents: 1000 },
  ]

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create type public.app_role as enum ('owner', 'admin');
      create function public.has_role(uuid, public.app_role[]) returns boolean language sql as $$ select true $$;
      create function public.tenant_can_write(uuid) returns boolean language sql as $$ select true $$;
      create table public.ledger_entries (id uuid primary key, tenant_id uuid, kind text, amount_cents bigint, vat_rate numeric);
      create table public.work_orders (id uuid, tenant_id uuid);
      create table public.service_contracts (id uuid, tenant_id uuid);
      create table public.work_cost_entries (id uuid, tenant_id uuid, work_order_id uuid, reversal_of uuid, signed_total_cost_cents bigint);
      create table public.contract_cost_entries (id uuid, tenant_id uuid, contract_id uuid, reversal_of uuid, signed_total_cost_cents bigint);
      create table public.ledger_expense_allocations (
        id uuid default gen_random_uuid(), tenant_id uuid, ledger_entry_id uuid, work_order_id uuid,
        contract_id uuid, gross_cents bigint, net_cents bigint, work_cost_entry_id uuid,
        contract_cost_entry_id uuid, operation_id uuid, reversal_of uuid
      );
    `)
    await db.exec(
      await readFile(
        new URL(
          '../../../supabase/migrations/20261124230000_ledger_fiscal_breakdown.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query("select set_config('test.uid', $1, false)", [user])
    await db.query('insert into public.work_orders values ($1, $2)', [work, tenant])
    await db.query(
      "insert into public.ledger_entries (id, tenant_id, kind, amount_cents, vat_rate, vat_breakdown) values ($1,$2,'expense',23100,21,$3)",
      [entry, tenant, JSON.stringify(lines)],
    )
  }, 30000)
  afterAll(async () => db.close())

  it('enforces valid, complete breakdowns in the database', async () => {
    const valid = async (value: unknown, gross = 23100) =>
      (
        await db.query<{ valid: boolean }>(
          'select public.valid_ledger_vat_breakdown($1::jsonb, $2) as valid',
          [JSON.stringify(value), gross],
        )
      ).rows[0]?.valid
    expect(await valid(lines)).toBe(true)
    expect(await valid(lines, 23099)).toBe(false)
    expect(await valid([])).toBe(false)
    expect(await valid([{ ...lines[0], rate: 101 }], 12100)).toBe(false)
    expect(await valid([{ ...lines[0], unexpected: 1 }], 12100)).toBe(false)
    await expect(
      db.query('update public.ledger_entries set vat_breakdown=$1 where id=$2', [
        JSON.stringify(lines.slice(0, 1)),
        entry,
      ]),
    ).rejects.toThrow()
  })

  it('allocates the actual net base across partial allocations, including the rounding remainder', async () => {
    for (const [index, gross] of [7700, 7700, 7700].entries()) {
      await db.query('select public.allocate_ledger_expense($1,$2,$3,null,$4,null,null,$5)', [
        tenant,
        entry,
        work,
        gross,
        `00000000-0000-4000-8000-00000000001${index}`,
      ])
    }
    const result = await db.query<{ gross: string; net: string }>(
      'select sum(gross_cents)::text gross, sum(net_cents)::text net from public.ledger_expense_allocations',
    )
    expect(result.rows[0]).toEqual({ gross: '23100', net: '20000' })
  })
})
