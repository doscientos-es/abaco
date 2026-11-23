import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('automatic installment drafts', () => {
  const db = new PGlite()
  const tenant = 'ab000000-0000-4000-8000-000000000001'
  const client = 'ab000000-0000-4000-8000-000000000002'
  const estimate = 'ab000000-0000-4000-8000-000000000003'
  const first = 'ab000000-0000-4000-8000-000000000004'
  const second = 'ab000000-0000-4000-8000-000000000005'

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema app_private;
      create table public.estimates (
        id uuid primary key, tenant_id uuid, client_id uuid, title text, status text,
        conversion_destination text, vat_rate numeric, responded_at timestamptz
      );
      create table public.estimate_milestones (
        id uuid primary key, tenant_id uuid, estimate_id uuid, position integer,
        label text, percent numeric
      );
      create table public.invoice_milestone_drafts (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, estimate_id uuid,
        milestone_id uuid, client_id uuid, concept text, total_cents bigint, vat_rate numeric,
        due_date date not null, status text not null default 'draft', unique(estimate_id, milestone_id)
      );
      create table public.invoices (estimate_id uuid, milestone_id uuid);
      create table public.estimate_publications (estimate_id uuid, tenant_id uuid, snapshot jsonb);
      create function app_private.estimate_agreement_metadata(jsonb) returns jsonb
        language sql as $$select '{}'::jsonb$$;
      create function public.prepare_first_invoice_draft_on_acceptance() returns trigger
        language plpgsql as $$begin return new; end$$;
      create trigger estimates_prepare_first_invoice_draft_after_acceptance
        after update of status on public.estimates for each row
        execute function public.prepare_first_invoice_draft_on_acceptance();
    `)
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261123074454_prepare_installment_invoice_drafts.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)

  afterAll(async () => db.close())

  async function fixture(percent1: number, percent2: number, gross: number, destination = 'work') {
    await db.exec(
      'truncate public.invoice_milestone_drafts, public.estimate_milestones, public.estimate_publications, public.estimates, public.invoices',
    )
    await db.query(
      `insert into public.estimates values ($1, $2, $3, 'Servicio', 'sent', $4, 21, null)`,
      [estimate, tenant, client, destination],
    )
    await db.query(
      `insert into public.estimate_milestones values
      ($1, $3, $4, 0, 'Primero', $5), ($2, $3, $4, 1, 'Segundo', $6)`,
      [first, second, tenant, estimate, percent1, percent2],
    )
    await db.query(
      `insert into public.estimate_publications values ($1, $2, jsonb_build_object('agreement', jsonb_build_object('price', jsonb_build_object('totalCents', $3::int))))`,
      [estimate, tenant, gross],
    )
  }

  async function accept() {
    return db.query(
      `update public.estimates set status = 'accepted', responded_at = now() where id = $1`,
      [estimate],
    )
  }

  it('prepares all drafts with exact rounding, no invoice, and no invented future due date', async () => {
    await fixture(50, 50, 10001)
    await accept()
    const drafts = await db.query<{
      milestone_id: string
      total_cents: number
      due_date: Date | null
    }>(
      `select milestone_id, total_cents, due_date from public.invoice_milestone_drafts order by milestone_id`,
    )
    expect(drafts.rows.map((row) => Number(row.total_cents))).toEqual([5001, 5000])
    expect(drafts.rows[0]?.due_date).not.toBeNull()
    expect(drafts.rows[1]?.due_date).toBeNull()
    const count = await db.query<{ count: number }>('select count(*) as count from public.invoices')
    expect(Number(count.rows[0]?.count)).toBe(0)
    const retry = await db.query<{ id: string }>(
      'select public.build_invoice_milestone_draft($1, $2, $3) as id',
      [tenant, estimate, second],
    )
    const original = await db.query<{ id: string }>(
      'select id from public.invoice_milestone_drafts where milestone_id = $1',
      [second],
    )
    expect(retry.rows[0]?.id).toBe(original.rows[0]?.id)
  })

  it('retains the original first-only behavior for incomplete legacy payment plans', async () => {
    await fixture(30, 30, 10000)
    await accept()
    const drafts = await db.query<{ total_cents: number }>(
      'select total_cents from public.invoice_milestone_drafts',
    )
    expect(drafts.rows.map((row) => Number(row.total_cents))).toEqual([3000])
  })

  it('does not create milestone drafts for contracts', async () => {
    await fixture(50, 50, 10000, 'contract')
    await accept()
    const result = await db.query<{ count: number }>(
      'select count(*) as count from public.invoice_milestone_drafts',
    )
    expect(Number(result.rows[0]?.count)).toBe(0)
  })

  it('never prepares drafts whose rounded amounts exceed the agreed total', async () => {
    await fixture(50, 50, 1)
    await db.query(
      `insert into public.estimate_milestones values
      ('ab000000-0000-4000-8000-000000000006', $1, $2, 2, 'Final', 0)`,
      [tenant, estimate],
    )
    await expect(accept()).rejects.toMatchObject({ code: 'P0409' })
    const result = await db.query<{ count: number }>(
      'select count(*) as count from public.invoice_milestone_drafts',
    )
    expect(Number(result.rows[0]?.count)).toBe(0)
  })
})
