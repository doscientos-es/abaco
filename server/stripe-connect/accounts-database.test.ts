import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const tenantA = 'ab000000-0000-4000-8000-000000000001'
const tenantB = 'ab000000-0000-4000-8000-000000000002'
const adminA = 'ab000000-0000-4000-8000-000000000003'
const adminB = 'ab000000-0000-4000-8000-000000000004'
const viewer = 'ab000000-0000-4000-8000-000000000005'
const state = 'A'.repeat(43)

describe('Stripe account persistence migration', () => {
  const db = new PGlite()

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create table auth.users(id uuid primary key);
      create table public.tenants(id uuid primary key);
      create table public.memberships(tenant_id uuid, user_id uuid, role text,
        primary key(tenant_id, user_id));
      create function public.tenant_can_write(uuid) returns boolean language sql as $$select true$$;
    `)
    const migration = await readFile(
      new URL(
        '../../supabase/migrations/20261122220232_stripe_connect_accounts.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await db.exec(migration)
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261123153336_stripe_connect_status.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query('insert into public.tenants values ($1), ($2)', [tenantA, tenantB])
    await db.query('insert into auth.users values ($1), ($2), ($3)', [adminA, adminB, viewer])
    await db.query(
      `insert into public.memberships values ($1, $3, 'admin'), ($2, $4, 'admin'), ($1, $5, 'viewer')`,
      [tenantA, tenantB, adminA, adminB, viewer],
    )
  }, 30000)

  afterAll(async () => db.close())

  it('permits only tenant administrators and consumes each OAuth state once', async () => {
    await db.exec('set role service_role')
    const save = (userId: string) =>
      db.query(
        `select public.save_stripe_connect_oauth_state($1, $2, $3, clock_timestamp() + interval '10 minutes')`,
        [state, tenantA, userId],
      )
    await expect(save(viewer)).rejects.toMatchObject({ code: '42501' })
    await save(adminA)
    const first = await db.query<{
      value: { tenantId: string; userId: string; expiresAt: number }
    }>('select public.consume_stripe_connect_oauth_state($1) as value', [state])
    expect(first.rows[0]?.value).toMatchObject({ tenantId: tenantA, userId: adminA })
    const second = await db.query<{ value: null }>(
      'select public.consume_stripe_connect_oauth_state($1) as value',
      [state],
    )
    expect(second.rows[0]?.value).toBeNull()
    await db.exec('reset role')
  })

  it('rechecks membership and prevents account reassignment across tenants', async () => {
    await db.exec('set role service_role')
    const connect = (tenant: string, user: string, account: string) =>
      db.query('select public.save_stripe_connect_account($1, $2, $3, false)', [
        tenant,
        user,
        account,
      ])
    await expect(connect(tenantA, viewer, 'acct_Test')).rejects.toMatchObject({ code: '42501' })
    await connect(tenantA, adminA, 'acct_Test')
    const status = (tenant: string, user: string, liveMode: boolean) =>
      db.query<{ connected: boolean }>(
        'select public.stripe_connect_account_exists($1, $2, $3) as connected',
        [tenant, user, liveMode],
      )
    expect((await status(tenantA, adminA, false)).rows[0]?.connected).toBe(true)
    expect((await status(tenantA, adminA, true)).rows[0]?.connected).toBe(false)
    expect((await status(tenantB, adminB, false)).rows[0]?.connected).toBe(false)
    await expect(status(tenantA, adminB, false)).rejects.toMatchObject({ code: '42501' })
    await expect(status(tenantA, viewer, false)).rejects.toMatchObject({ code: '42501' })
    await connect(tenantA, adminA, 'acct_Test')
    await expect(connect(tenantB, adminB, 'acct_Test')).rejects.toMatchObject({ code: '23505' })
    await expect(connect(tenantA, adminA, 'acct_Other')).rejects.toMatchObject({ code: '23505' })
    await db.exec('reset role')
    await db.query(
      "update public.memberships set role = 'viewer' where tenant_id = $1 and user_id = $2",
      [tenantA, adminA],
    )
    await db.exec('set role service_role')
    await expect(connect(tenantA, adminA, 'acct_Test')).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
    await db.exec('set role authenticated')
    await expect(status(tenantA, adminA, false)).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
  })
})
