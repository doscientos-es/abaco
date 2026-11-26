import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('guided company onboarding persistence', () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const legacy = '00000000-0000-4000-8000-000000000003'

  beforeAll(async () => {
    await db.exec(
      await readFile(
        new URL('../../../supabase/tests/fixtures/guided-company-onboarding.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL(
          '../../../supabase/migrations/20261126185711_guided_company_onboarding.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)

  afterAll(async () => db.close())

  it('blocks direct workspace before pay + matching booking, rolls back bad checkout and deduplicates callbacks', async () => {
    const setActor = (uid: string) => db.query("select set_config('test.uid',$1,false)", [uid])
    await setActor(owner)
    const tenant = (
      await db.query<{ tenant: string }>("select public.create_company('Empresa ficticia') tenant")
    ).rows[0]?.tenant
    expect(tenant).toBeTruthy()
    const access = async (id: string | undefined) =>
      (await db.query<{ allowed: boolean }>('select public.tenant_can_write($1) allowed', [id]))
        .rows[0]?.allowed
    const state = async () =>
      (
        await db.query<{ status: { stage: string; booking_reference: string | null } }>(
          'select public.company_onboarding_status($1) status',
          [tenant],
        )
      ).rows[0]?.status
    const reference = (
      await db.query<{ booking_reference: string }>(
        'select booking_reference from app_private.company_onboarding where tenant_id=$1',
        [tenant],
      )
    ).rows[0]?.booking_reference
    const book = async (email: string) =>
      (
        await db.query<{ booked: boolean }>(
          "select public.confirm_onboarding_booking($1,'cal-uid',now()+interval '2 days',array[$2::text]) booked",
          [reference, email],
        )
      ).rows[0]?.booked
    const reserve = (actor: string, total: number) =>
      db.query(
        "select public.reserve_onboarding_payment($1,'{}','1234ABC1',$2,'month',1,$3,array['workers'])",
        [tenant, actor, total],
      )

    expect(await access(legacy)).toBe(true)
    expect(await access(tenant)).toBe(false)
    expect(await state()).toMatchObject({ stage: 'selection', booking_reference: null })
    expect(await book('owner@example.test')).toBe(false)
    await expect(reserve(other, 5185)).rejects.toThrow('No autorizado')
    await expect(reserve(owner, 1)).rejects.toThrow('invalid quote')
    expect((await db.query('select * from public.tenant_modules')).rows).toHaveLength(0)
    await reserve(owner, 5185)
    expect(await state()).toMatchObject({ stage: 'pending', booking_reference: null })
    await expect(reserve(owner, 5185)).rejects.toThrow('pago pendiente')
    await db.query("update public.billing_payments set status='succeeded' where tenant_id=$1", [
      tenant,
    ])
    await db.query(
      "update public.tenants set subscription_status='active',current_period_end=now()+interval '1 month' where id=$1",
      [tenant],
    )
    expect(await state()).toMatchObject({ stage: 'booking', booking_reference: reference })
    expect(await access(tenant)).toBe(false)
    await db.query('insert into public.clients values ($1)', [tenant])
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.clients')).rows).toHaveLength(0)
    await expect(book('owner@example.test')).rejects.toThrow('permission denied')
    await db.exec('reset role')
    expect(await book('other@example.test')).toBe(false)
    await setActor(other)
    await expect(state()).rejects.toThrow('No autorizado')
    await setActor(owner)
    expect(await book('owner@example.test')).toBe(true)
    expect(await book('owner@example.test')).toBe(false)
    expect(await access(tenant)).toBe(true)
    expect(await state()).toMatchObject({ stage: 'complete', booking_reference: null })
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.clients')).rows).toHaveLength(1)
    await db.exec('reset role')
  })
})
