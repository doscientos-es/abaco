import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAiHandler } from './http'

describe('AI HTTP authorization with database reservations', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const otherTenant = '00000000-0000-4000-8000-000000000002'
  const admin = '00000000-0000-4000-8000-000000000003'
  const worker = '00000000-0000-4000-8000-000000000004'
  const generate = vi.fn(async () => ({ message: 'Propuesta', lines: [] }))
  const handler = createAiHandler({
    origin: 'https://app.example',
    authenticate: async (token) => ({ admin, worker })[token as 'admin' | 'worker'] ?? null,
    reserve: async (tenantId, userId, task) => {
      const result = await db.query<{ result: 'allowed' | 'forbidden' | 'limit' }>(
        'select public.reserve_ai_request($1,$2,$3) as result',
        [tenantId, userId, task],
      )
      const reservation = result.rows[0]?.result
      if (!reservation) throw new Error('Reservation unavailable')
      return reservation
    },
    generate,
  })
  const invoke = async (
    token: string,
    tenantId = tenant,
    task: 'estimate' | 'receipt' = 'estimate',
  ) => {
    const input =
      task === 'estimate'
        ? { task, messages: [{ role: 'user', text: 'Pintar una habitación' }] }
        : { task, document: { mimeType: 'application/pdf', data: 'JVBERi0=' } }
    const body = JSON.stringify({ tenantId, request: input })
    const request = Object.assign(Readable.from([body]), {
      method: 'POST',
      headers: { origin: 'https://app.example', authorization: `Bearer ${token}` },
    }) as IncomingMessage
    let text = ''
    const response = {
      statusCode: 200,
      setHeader() {},
      end(value: string) {
        text = value
      },
    }
    await handler(request, response as unknown as ServerResponse)
    return { status: response.statusCode, body: JSON.parse(text) as unknown }
  }

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table public.tenants (id uuid primary key, can_write boolean not null);
      create table public.memberships (tenant_id uuid, user_id uuid, role text,
        primary key (tenant_id, user_id));
      create function public.tenant_can_write(p_tenant uuid) returns boolean language sql as $$
        select coalesce((select can_write from public.tenants where id=p_tenant), false) $$;
    `)
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261123221018_ai_access_reservations.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query('insert into public.tenants values ($1,true),($2,true)', [tenant, otherTenant])
    await db.query('insert into public.memberships values ($1,$2,$3),($1,$4,$5)', [
      tenant,
      admin,
      'admin',
      worker,
      'user',
    ])
  }, 30000)
  beforeEach(async () => {
    generate.mockClear()
    await db.exec('truncate app_private.ai_assignments, app_private.ai_monthly_usage')
  })
  afterAll(async () => db.close())

  it('only invokes the model for a paid assignment and the matching tenant', async () => {
    expect((await invoke('admin')).status).toBe(403)
    await db.query(
      "insert into app_private.ai_assignments values ($1,$2,true,now()+interval '1 day')",
      [tenant, admin],
    )
    expect((await invoke('admin', otherTenant)).status).toBe(403)
    expect((await invoke('admin', tenant, 'receipt')).status).toBe(200)
    expect((await invoke('admin')).status).toBe(200)
    expect(generate).toHaveBeenCalledTimes(2)
    const usage = await db.query<{ requests: number }>(
      'select requests from app_private.ai_monthly_usage',
    )
    expect(usage.rows).toEqual([{ requests: 2 }])
  })

  it('enforces membership permissions even for an assigned user', async () => {
    await db.query(
      "insert into app_private.ai_assignments values ($1,$2,true,now()+interval '1 day')",
      [tenant, worker],
    )
    expect((await invoke('worker')).status).toBe(403)
    expect((await invoke('worker', tenant, 'receipt')).status).toBe(403)
    expect(generate).not.toHaveBeenCalled()
    expect((await db.query('select * from app_private.ai_monthly_usage')).rows).toHaveLength(0)
  })

  it('enforces the shared monthly cap before calling the provider', async () => {
    await db.query(
      "insert into app_private.ai_assignments values ($1,$2,true,now()+interval '1 day')",
      [tenant, admin],
    )
    await db.query(
      "insert into app_private.ai_monthly_usage values ($1,$2,date_trunc('month',now() at time zone 'Europe/Madrid')::date,199)",
      [tenant, admin],
    )
    expect((await invoke('admin')).status).toBe(200)
    expect((await invoke('admin', tenant, 'receipt')).status).toBe(429)
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
