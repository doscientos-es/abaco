import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const referrer = 'ab000000-0000-4000-8000-000000000001'
const admin = 'ab000000-0000-4000-8000-000000000002'
const signup = 'ab000000-0000-4000-8000-000000000003'
const superadmin = 'ab000000-0000-4000-8000-000000000004'
const outsider = 'ab000000-0000-4000-8000-000000000005'

describe('referral attribution migration', () => {
  const db = new PGlite()
  let code: string
  let created: string
  const identity = (id: string) => db.query("select set_config('request.user_id', $1, false)", [id])

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema app_private;
      create type public.app_role as enum ('admin', 'user');
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.user_id', true), '')::uuid
      $$;
      create table public.tenants(id uuid primary key default gen_random_uuid(), name text not null);
      create table public.memberships(tenant_id uuid, user_id uuid, role public.app_role);
      create function public.has_role(target uuid, allowed public.app_role[]) returns boolean
        language sql security definer as $$
        select exists(select 1 from public.memberships where tenant_id = target and user_id = auth.uid() and role = any(allowed))
      $$;
      create function public.is_platform_superadmin() returns boolean language sql as $$
        select auth.uid() = 'ab000000-0000-4000-8000-000000000004'::uuid
      $$;
    `)
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20261123173124_referral_attribution.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.query('insert into public.tenants(id, name) values ($1, $2)', [
      referrer,
      'Recomendadora',
    ])
    await db.query('insert into auth.users(id) values ($1), ($2), ($3), ($4)', [
      admin,
      signup,
      superadmin,
      outsider,
    ])
    await db.query("insert into public.memberships values ($1, $2, 'admin')", [referrer, admin])
  }, 30000)
  afterAll(async () => db.close())

  it('issues a stable private code only to an authorized company administrator', async () => {
    await identity(outsider)
    await db.exec('set role authenticated')
    await expect(
      db.query('select public.referral_program_status($1)', [referrer]),
    ).rejects.toMatchObject({ code: '42501' })
    await identity(admin)
    const status = () =>
      db.query<{ value: { code: string; rewards_active: boolean } }>(
        'select public.referral_program_status($1) as value',
        [referrer],
      )
    const first = (await status()).rows[0]?.value
    if (!first) throw new Error('Missing referral status')
    code = first.code
    expect(code).toMatch(/^[A-F0-9]{16}$/)
    expect(first.rewards_active).toBe(false)
    expect((await status()).rows[0]?.value.code).toBe(code)
    await expect(db.query('select * from app_private.referral_codes')).rejects.toMatchObject({
      code: '42501',
    })
    await db.exec('reset role')
  })

  it('attributes signup exactly once and ignores later changes to user metadata', async () => {
    await db.query('update auth.users set raw_user_meta_data = $2 where id = $1', [
      signup,
      JSON.stringify({ abaco_referral_code: code }),
    ])
    await identity(signup)
    await db.exec('set role authenticated')
    const result = await db.query<{ id: string }>("select public.create_company('Invitada') as id")
    const id = result.rows[0]?.id
    if (!id) throw new Error('Missing company id')
    created = id
    await db.exec('reset role')
    await db.query('update auth.users set raw_user_meta_data = $2 where id = $1', [
      signup,
      JSON.stringify({ abaco_referral_code: '0000000000000000' }),
    ])
    await db.exec('set role authenticated')
    const status = await db.query<{ value: { recommended_by: string } }>(
      'select public.referral_program_status($1) as value',
      [created],
    )
    expect(status.rows[0]?.value.recommended_by).toBe('Recomendadora')
    const second = await db.query<{ id: string }>(
      "select public.create_company('Otra empresa') as id",
    )
    await db.exec('reset role')
    const rows = await db.query<{ tenant_id: string; referrer_id: string }>(
      'select tenant_id, referrer_id from app_private.referral_attributions order by tenant_id',
    )
    expect(rows.rows).toEqual([{ tenant_id: created, referrer_id: referrer }])
    expect(second.rows[0]?.id).not.toBe(created)
    await identity(signup)
    await db.exec('set role authenticated')
    await expect(
      db.query('select public.superadmin_set_company_referral($1, null, $2)', [created, referrer]),
    ).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
  })

  it('allows audited superadmin corrections, rejects stale changes and cycles', async () => {
    await identity(superadmin)
    await db.exec('set role authenticated')
    await expect(
      db.query('select public.superadmin_set_company_referral($1, $2, null)', [referrer, created]),
    ).rejects.toMatchObject({ code: '22023' })
    await expect(
      db.query('select public.superadmin_set_company_referral($1, null, null)', [created]),
    ).rejects.toMatchObject({ code: '40001' })
    await db.query('select public.superadmin_set_company_referral($1, null, $2)', [
      created,
      referrer,
    ])
    const result = await db.query<{ value: { referrer_id: string | null } }>(
      'select public.superadmin_company_referral($1) as value',
      [created],
    )
    expect(result.rows[0]?.value.referrer_id).toBeNull()
    await db.exec('reset role')
    const audit = await db.query<{
      actor_id: string
      previous_referrer_id: string
      new_referrer_id: string | null
    }>(
      'select actor_id, previous_referrer_id, new_referrer_id from app_private.referral_attribution_audit',
    )
    expect(audit.rows).toEqual([
      { actor_id: superadmin, previous_referrer_id: referrer, new_referrer_id: null },
    ])
  })
})
