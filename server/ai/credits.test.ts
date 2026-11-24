import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('AI monthly and purchased credits', () => {
  const db = new PGlite()
  const tenant = '00000000-0000-4000-8000-000000000001'
  const user = '00000000-0000-4000-8000-000000000002'
  const other = '00000000-0000-4000-8000-000000000003'
  const reserve = async (who = user, task = 'estimate') =>
    (
      await db.query<{ result: string }>('select public.reserve_ai_request($1,$2,$3) result', [
        tenant,
        who,
        task,
      ])
    ).rows[0]?.result

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table public.tenants (id uuid primary key, can_write boolean not null, is_complimentary boolean not null);
      create table public.memberships (tenant_id uuid, user_id uuid, role text, primary key (tenant_id,user_id));
      create function public.tenant_can_write(p_tenant uuid) returns boolean language sql as $$
        select coalesce((select can_write from public.tenants where id=p_tenant),false) $$;
    `)
    for (const file of [
      '20261123221018_ai_access_reservations.sql',
      '20261124194446_ai_monthly_credits.sql',
    ]) {
      await db.exec(
        await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'),
      )
    }
    await db.query('insert into public.tenants values ($1,true,true)', [tenant])
    await db.query('insert into public.memberships values ($1,$2,$3),($1,$4,$5)', [
      tenant,
      user,
      'admin',
      other,
      'editor',
    ])
    await db.query("select set_config('test.uid',$1,false)", [user])
  }, 30000)
  afterAll(async () => db.close())

  it('grants complimentary members 500, but enforces role and tenant restrictions', async () => {
    expect(await reserve()).toBe('allowed')
    expect(await reserve(other, 'receipt')).toBe('forbidden')
    expect(await reserve(other, 'estimate')).toBe('allowed')
    await db.query('update public.tenants set can_write=false where id=$1', [tenant])
    expect(await reserve()).toBe('forbidden')
    await db.query('update public.tenants set can_write=true where id=$1', [tenant])
  })

  it('consumes monthly credits first and paid credits once exhausted', async () => {
    await db.query('insert into app_private.ai_credit_balances values ($1,$2,2)', [tenant, user])
    await db.query(
      'update app_private.ai_monthly_usage set requests=499 where tenant_id=$1 and user_id=$2',
      [tenant, user],
    )
    expect(await reserve()).toBe('allowed')
    expect(await reserve()).toBe('allowed')
    expect(await reserve()).toBe('allowed')
    expect(await reserve()).toBe('limit')
    const status = await db.query<{ status: unknown }>('select public.ai_my_credits($1) status', [
      tenant,
    ])
    expect(status.rows[0]?.status).toEqual({
      monthly_limit: 500,
      monthly_used: 500,
      extra_remaining: 0,
    })
  })

  it('never grants non-courtesy users without a valid paid assignment', async () => {
    await db.query('update public.tenants set is_complimentary=false where id=$1', [tenant])
    expect(await reserve()).toBe('forbidden')
    await db.query(
      "insert into app_private.ai_assignments values ($1,$2,true,now()+interval '1 day')",
      [tenant, user],
    )
    expect(await reserve()).toBe('limit')
  })

  it('does not expose balance writes or reservation calls to authenticated users', async () => {
    const result = await db.query<{ balance: boolean; reserve: boolean }>(`select
      has_table_privilege('authenticated','app_private.ai_credit_balances','update') balance,
      has_function_privilege('authenticated','public.reserve_ai_request(uuid,uuid,text)','execute') reserve`)
    expect(result.rows[0]).toEqual({ balance: false, reserve: false })
  })
})
