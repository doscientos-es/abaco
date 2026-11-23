import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('AI access reservations', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const user = '00000000-0000-4000-8000-000000000002'
  const other = '00000000-0000-4000-8000-000000000003'
  const reserve = async (person: string, task: string) =>
    (
      await db.query<{ result: string }>('select public.reserve_ai_request($1,$2,$3) as result', [
        tenant,
        person,
        task,
      ])
    ).rows[0]?.result

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.tenants (id uuid primary key, can_write boolean not null);
      create table public.memberships (tenant_id uuid, user_id uuid, role text,
        primary key (tenant_id,user_id));
      create function public.tenant_can_write(p_tenant uuid) returns boolean language sql as $$
        select coalesce((select can_write from public.tenants where id=p_tenant),false) $$;
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
    await db.query('insert into public.tenants values ($1,true)', [tenant])
    await db.query('insert into public.memberships values ($1,$2,$3),($1,$4,$5)', [
      tenant,
      user,
      'admin',
      other,
      'editor',
    ])
  }, 30000)
  afterAll(async () => db.close())

  it('denies unassigned, unknown and expired users before reserving anything', async () => {
    expect(await reserve(user, 'estimate')).toBe('forbidden')
    await db.query(
      "insert into app_private.ai_assignments values ($1,$2,true,now() - interval '1 second')",
      [tenant, user],
    )
    expect(await reserve(user, 'estimate')).toBe('forbidden')
    expect(await reserve(other, 'unknown')).toBe('forbidden')
    expect((await db.query('select * from app_private.ai_monthly_usage')).rows).toHaveLength(0)
  })

  it('enforces each user’s actual task permissions and tenant status', async () => {
    await db.query(
      "update app_private.ai_assignments set valid_until=now()+interval '1 day' where user_id=$1",
      [user],
    )
    await db.query(
      "insert into app_private.ai_assignments values ($1,$2,true,now()+interval '1 day')",
      [tenant, other],
    )
    expect(await reserve(other, 'receipt')).toBe('forbidden')
    expect(await reserve(other, 'estimate')).toBe('allowed')
    expect(await reserve(user, 'receipt')).toBe('allowed')
    await db.query('update public.tenants set can_write=false where id=$1', [tenant])
    expect(await reserve(user, 'estimate')).toBe('forbidden')
    await db.query('update public.tenants set can_write=true where id=$1', [tenant])
  })

  it('keeps the monthly cap after deactivation and reactivation', async () => {
    await db.query(
      'update app_private.ai_monthly_usage set requests=199 where tenant_id=$1 and user_id=$2',
      [tenant, user],
    )
    expect(await reserve(user, 'estimate')).toBe('allowed')
    expect(await reserve(user, 'estimate')).toBe('limit')
    await db.query('update app_private.ai_assignments set enabled=false where user_id=$1', [user])
    expect(await reserve(user, 'estimate')).toBe('forbidden')
    await db.query('update app_private.ai_assignments set enabled=true where user_id=$1', [user])
    expect(await reserve(user, 'estimate')).toBe('limit')
  })

  it('keeps reservation and assignment writes inaccessible to authenticated users', async () => {
    const { rows } = await db.query<{ reserve: boolean; write: boolean; read: boolean }>(`
      select has_function_privilege('authenticated','public.reserve_ai_request(uuid,uuid,text)','execute') as reserve,
        has_table_privilege('authenticated','app_private.ai_assignments','insert') as write,
        has_table_privilege('authenticated','app_private.ai_assignments','select') as read
    `)
    expect(rows[0]).toEqual({ reserve: false, write: false, read: false })
  })

  it('reports only the current member’s access and follows revocation', async () => {
    await db.query("select set_config('test.uid', $1, false)", [user])
    expect(
      (await db.query<{ access: boolean }>('select public.ai_my_access($1) as access', [tenant]))
        .rows[0]?.access,
    ).toBe(true)
    await db.query('update app_private.ai_assignments set enabled=false where user_id=$1', [user])
    expect(
      (await db.query<{ access: boolean }>('select public.ai_my_access($1) as access', [tenant]))
        .rows[0]?.access,
    ).toBe(false)
    await db.query("select set_config('test.uid', $1, false)", [
      '00000000-0000-4000-8000-000000000099',
    ])
    expect(
      (await db.query<{ access: boolean }>('select public.ai_my_access($1) as access', [tenant]))
        .rows[0]?.access,
    ).toBe(false)
  })

  it('allows the authenticated access check but blocks direct writes and reservations', async () => {
    await db.query('update app_private.ai_assignments set enabled=true where user_id=$1', [user])
    await db.query("select set_config('test.uid', $1, false)", [user])
    await db.exec('set role authenticated')
    try {
      const result = await db.query<{ access: boolean }>(
        'select public.ai_my_access($1) as access',
        [tenant],
      )
      expect(result.rows[0]?.access).toBe(true)
      await expect(reserve(user, 'receipt')).rejects.toThrow(/permission denied/i)
      await expect(db.query('select * from app_private.ai_assignments')).rejects.toThrow(
        /permission denied/i,
      )
    } finally {
      await db.exec('reset role')
    }
  })
})
