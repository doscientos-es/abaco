import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const event = {
  id: 'evt_Test123',
  object: 'event',
  account: 'acct_Test123',
  livemode: false,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_Test123',
      object: 'checkout.session',
      livemode: false,
      mode: 'payment',
      payment_status: 'paid',
      amount_total: 1234,
      currency: 'eur',
      client_reference_id: 'bd000000-0000-4000-8000-000000000001',
      payment_intent: 'pi_Test123',
      customer_email: 'private@example.test',
      metadata: { operation_id: 'bd000000-0000-4000-8000-000000000001', private: 'private' },
    },
  },
}

describe('Stripe event inbox migration', () => {
  const db = new PGlite()

  beforeAll(async () => {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    await db.exec('create schema app_private;')
    const migration = await readFile(
      new URL(
        '../../supabase/migrations/20261122215900_stripe_connect_event_inbox.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await db.exec(migration)
  }, 30000)

  afterAll(async () => db.close())

  it('fails closed until processing is enabled and restricts access to the server RPC', async () => {
    const permissions = await db.query<{ auth: boolean; service: boolean; table: boolean }>(
      `select has_function_privilege('authenticated', 'public.receive_stripe_connect_event(jsonb)', 'execute') as auth,
              has_function_privilege('service_role', 'public.receive_stripe_connect_event(jsonb)', 'execute') as service,
              has_table_privilege('service_role', 'app_private.stripe_connect_events', 'select') as "table"`,
    )
    expect(permissions.rows).toEqual([{ auth: false, service: true, table: false }])
    await expect(
      db.query('select public.receive_stripe_connect_event($1::jsonb)', [JSON.stringify(event)]),
    ).rejects.toMatchObject({ code: '55000', message: 'stripe_connect_not_ready' })
    expect((await db.query('select * from app_private.stripe_connect_events')).rows).toHaveLength(0)
  })

  it('deduplicates the same event, rejects conflicting events and strips unrelated personal data', async () => {
    await db.exec('update app_private.stripe_connect_runtime set ingress_enabled = true')
    await db.exec('set role service_role')
    const receive = (value: unknown) =>
      db.query('select public.receive_stripe_connect_event($1::jsonb)', [JSON.stringify(value)])
    await receive(event)
    await receive(event)
    await expect(
      receive({ ...event, data: { object: { ...event.data.object, amount_total: 9999 } } }),
    ).rejects.toMatchObject({ code: '23505', message: 'stripe_event_conflict' })
    await expect(receive({})).rejects.toMatchObject({
      code: '22023',
      message: 'invalid_stripe_event',
    })
    await db.exec('reset role')
    const stored = await db.query<{ payload: typeof event }>(
      'select payload from app_private.stripe_connect_events',
    )
    expect(stored.rows).toHaveLength(1)
    expect(stored.rows[0]?.payload.data.object).not.toHaveProperty('customer_email')
    expect(stored.rows[0]?.payload.data.object.metadata).toEqual({
      operation_id: event.data.object.metadata.operation_id,
    })
  })
})
