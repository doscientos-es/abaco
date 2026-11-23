import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('referral invoice reservations', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const refer = '00000000-0000-4000-8000-000000000002'
  const reserve = async (order: string) =>
    (
      await db.query<{ amount: number }>(
        "select public.reserve_subscription_invoice_payment($1, '{}', $2, null, 'renewal', null, null, null, null) as amount",
        [tenant, order],
      )
    ).rows[0]?.amount

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private;
      create table public.tenants(id uuid primary key, current_period_end timestamptz, billing_net_cents integer);
      create table public.billing_payments(
        id uuid primary key default gen_random_uuid(), tenant_id uuid, merchant_order text unique,
        kind text, plan text, period text, net_cents integer, vat_percent integer,
        amount_cents integer constraint billing_payments_amount_cents_check check (amount_cents > 0),
        status text default 'pending', settled_at timestamptz, invoice_status text);
      create table app_private.referral_card_payments(referrer_id uuid, paid_month date, paid_cents integer);
      create table app_private.subscription_invoice_handoffs(payment_id uuid, recipient jsonb, payload jsonb);
      create function app_private.billing_total(n integer, v integer) returns integer
        language sql immutable strict as $$ select ((n::bigint * (100 + v) + 50) / 100)::integer $$;
      create function app_private.queue_confirmed_subscription_invoice() returns trigger language plpgsql as $$
        begin return new; end $$;
      create trigger queue_confirmed_subscription_invoice after update of status on public.billing_payments
        for each row when (old.status = 'pending' and new.status = 'succeeded')
        execute function app_private.queue_confirmed_subscription_invoice();
      create function public.reserve_subscription_invoice_payment(uuid,jsonb,text,uuid,text,text,text,integer,integer)
        returns integer language plpgsql as $$
        declare payment uuid;
        begin
          perform 1 from public.tenants where id = $1 for update;
          insert into public.billing_payments(tenant_id,merchant_order,kind,plan,period,net_cents,vat_percent,amount_cents)
            values ($1,$3,'renewal','standard','month',1000,21,1210) returning id into payment;
          insert into app_private.subscription_invoice_handoffs values (payment,$2,null);
          return 1210;
        end $$;
      create function public.apply_billing_payment(p_order text,p_success boolean,p_code text,p_reference text)
        returns text language plpgsql as $$
        declare pay public.billing_payments;
        begin
          select * into pay from public.billing_payments where merchant_order=p_order for update;
          if pay.status <> 'pending' then return 'duplicate'; end if;
          update public.billing_payments set status=case when p_success then 'succeeded' else 'failed' end,
            settled_at=now() where id=pay.id;
          if p_success then update public.tenants set billing_net_cents=pay.net_cents where id=pay.tenant_id; end if;
          return case when p_success then 'succeeded' else 'failed' end;
        end $$;
    `)
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261123202311_referral_discount_calculation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261123203427_referral_invoice_reservations.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query(
      "insert into public.tenants values ($1, '2026-03-15T00:00:00Z', 1000), ($2, null, null)",
      [tenant, refer],
    )
    await db.query(
      "insert into app_private.referral_card_payments values ($1, '2026-02-01', 3000), ($1, '2026-01-01', 90000)",
      [tenant],
    )
  }, 30000)
  afterAll(async () => db.close())

  it('keeps the rollout disabled by default', async () => {
    expect(await reserve('disabled')).toBe(1210)
    await db.exec(
      "update public.billing_payments set status='failed' where merchant_order='disabled'",
    )
    await db.exec('update app_private.referral_rewards_config set enabled=true')
  })

  it('freezes the previous month discount across failed retries and invoices the discounted base', async () => {
    expect(await reserve('failed')).toBe(910)
    await db.exec("select public.apply_billing_payment('failed',false,'x',null)")
    await db.query(
      "insert into app_private.referral_card_payments values ($1, '2026-02-01', 20000)",
      [tenant],
    )
    expect(await reserve('retry')).toBe(910)
    await db.exec("select public.apply_billing_payment('retry',true,'0000',null)")
    const { rows } = await db.query<{
      payload: { netCents: number; totalCents: number; referralDiscount: unknown }
      billing_net_cents: number
    }>(`
      select h.payload, t.billing_net_cents from public.billing_payments p
      join app_private.subscription_invoice_handoffs h on h.payment_id=p.id
      join public.tenants t on t.id=p.tenant_id where p.merchant_order='retry'`)
    expect(rows[0]).toMatchObject({
      billing_net_cents: 1000,
      payload: {
        netCents: 752,
        totalCents: 910,
        referralDiscount: { originalNetCents: 1000, discountCents: 300 },
      },
    })
    expect(await reserve('same-month')).toBe(1210)
  })

  it('settles a fully discounted invoice without inventing a card payment', async () => {
    await db.exec("update public.tenants set current_period_end='2026-04-15T00:00:00Z'")
    await db.query(
      "insert into app_private.referral_card_payments values ($1, '2026-03-01', 20000)",
      [tenant],
    )
    expect(await reserve('free')).toBe(0)
    const { rows } = await db.query<{
      status: string
      amount_cents: number
      payload: { totalCents: number }
    }>(`
      select p.status,p.amount_cents,h.payload from public.billing_payments p
      join app_private.subscription_invoice_handoffs h on h.payment_id=p.id where p.merchant_order='free'`)
    expect(rows[0]).toMatchObject({
      status: 'succeeded',
      amount_cents: 0,
      payload: { totalCents: 0 },
    })
  })
})
