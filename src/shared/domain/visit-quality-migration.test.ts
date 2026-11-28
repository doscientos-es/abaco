import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('office-only visit quality persistence', () => {
  const db = new PGlite()
  const a = '00000000-0000-4000-8000-000000000001'
  const b = '00000000-0000-4000-8000-000000000002'
  const admin = '00000000-0000-4000-8000-000000000003'
  const second = '00000000-0000-4000-8000-000000000004'
  const worker = '00000000-0000-4000-8000-000000000005'
  const foreign = '00000000-0000-4000-8000-000000000006'
  const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  let week = ''
  let foreignReport = ''
  type Row = { report_version_id: string; visit_id: string; status: string | null; version: number }

  beforeAll(async () => {
    await db.exec(
      await readFile(
        new URL('../../../supabase/tests/fixtures/visit-quality-review.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL(
          '../../../supabase/migrations/20261128145000_visit_quality_review.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query('insert into public.test_tenants values ($1,true),($2,false)', [a, b])
    await db.query(
      "insert into public.memberships values ($1,$3,'admin'),($1,$4,'admin'),($1,$5,'user'),($2,$6,'admin')",
      [a, b, admin, second, worker, foreign],
    )
    week =
      (
        await db.query<{ week: string }>(
          "select (date_trunc('week', now() at time zone 'Europe/Madrid')::date - 7)::text as week",
        )
      ).rows[0]?.week ?? ''
    const seed = (sql: string, args: unknown[]) =>
      db.query(
        `insert into public.service_visit_report_versions
        select $1::uuid, $2::uuid, $3::uuid, $4::integer,
        '{"visit":{"title":"Visita ficticia"},"client":{"name":"Cliente ficticio"},"private":"DO_NOT_INCLUDE"}'::jsonb,
        $5::date::timestamp at time zone 'Europe/Madrid' + interval '${sql}'`,
        args,
      )
    for (let i = 0; i < 11; i++) {
      await seed('12 hours', [ids(100 + i), a, ids(20 + i), 1, week])
      await seed('1 day', [ids(200 + i), a, ids(20 + i), 2, week])
      await seed('7 days 1 hour', [ids(300 + i), a, ids(20 + i), 3, week])
    }
    await seed('-1 day', [ids(120), a, ids(50), 1, week])
    await seed('5 days', [ids(220), a, ids(50), 2, week])
    foreignReport = ids(130)
    await seed('1 day', [foreignReport, b, ids(60), 1, week])
  }, 30_000)

  afterAll(async () => db.close())

  const actor = async (uid: string, role = 'authenticated') => {
    await db.exec(`set role ${role}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
  }
  const list = (tenant: string, mode = 'sample', anchor = week) =>
    db.query<Row>('select * from public.list_visit_quality_reviews($1,$2,$3)', [
      tenant,
      anchor,
      mode,
    ])
  const save = (
    tenant: string,
    report: string,
    expected: number,
    status: string,
    category: string | null,
    owner: string | null,
    operation: number,
  ) =>
    db.query<{ revision: number }>(
      'select public.record_visit_quality_review($1,$2,$3,$4,$5,$6,$7) revision',
      [tenant, report, expected, status, category, owner, ids(operation)],
    )
  const history = () =>
    db.query<{ actor_id: string; owner_id: string; status: string; revision: number }>(
      'select actor_id,owner_id,status,revision from public.service_visit_quality_events order by revision',
    )

  it('samples unique initial closures, keeps the selected immutable version, and never returns raw payload', async () => {
    await actor(admin)
    const first = (await list(a)).rows
    expect(first).toHaveLength(2)
    expect(new Set(first.map((item) => item.visit_id)).size).toBe(2)
    expect(first.every(({ visit_id, version }) => visit_id !== ids(50) && version === 2)).toBe(true)
    expect((await list(a)).rows).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('DO_NOT_INCLUDE')
    await expect(list(b)).rejects.toMatchObject({ code: '42501' })
    await expect(list(a, 'sample', '2026-11-18')).rejects.toMatchObject({ code: '22023' })
  })

  it('registers and resolves corrections with an auditable owner, optimistic revision and operation retry', async () => {
    await actor(admin)
    const candidate = (await list(a)).rows[0]?.report_version_id
    if (!candidate) throw new Error('Missing sample')
    await expect(save(a, candidate, 0, 'in_progress', 'service', admin, 500)).rejects.toMatchObject(
      { code: '22023' },
    )
    await expect(
      save(a, candidate, 0, 'pending', 'sensitive free text', admin, 501),
    ).rejects.toMatchObject({ code: '22023' })
    await expect(save(a, candidate, 0, 'pending', 'evidence', worker, 502)).rejects.toMatchObject({
      code: '22023',
    })
    await expect(save(a, candidate, 0, 'pending', 'evidence', foreign, 503)).rejects.toMatchObject({
      code: '22023',
    })
    await expect(save(a, foreignReport, 0, 'reviewed', null, null, 504)).rejects.toMatchObject({
      code: 'P0002',
    })
    expect((await save(a, candidate, 0, 'pending', 'evidence', admin, 505)).rows[0]?.revision).toBe(
      1,
    )
    expect((await save(a, candidate, 0, 'pending', 'evidence', admin, 505)).rows[0]?.revision).toBe(
      1,
    )
    await expect(save(a, candidate, 0, 'pending', 'service', admin, 505)).rejects.toMatchObject({
      code: 'P0409',
    })
    await actor(second)
    await expect(save(a, candidate, 0, 'pending', 'evidence', second, 506)).rejects.toMatchObject({
      code: 'P0409',
    })
    expect((await list(a, 'open')).rows).toMatchObject([
      { report_version_id: candidate, status: 'pending' },
    ])
    expect(
      (await save(a, candidate, 1, 'in_progress', 'evidence', second, 507)).rows[0]?.revision,
    ).toBe(2)
    expect(
      (await save(a, candidate, 2, 'corrected', 'evidence', second, 508)).rows[0]?.revision,
    ).toBe(3)
    expect((await list(a, 'open')).rows).toEqual([])
    expect((await list(a)).rows[0]).toMatchObject({
      report_version_id: candidate,
      status: 'corrected',
    })
    expect((await history()).rows).toEqual([
      { actor_id: admin, owner_id: admin, status: 'pending', revision: 1 },
      { actor_id: second, owner_id: second, status: 'in_progress', revision: 2 },
      { actor_id: second, owner_id: second, status: 'corrected', revision: 3 },
    ])
    await expect(
      db.exec("update public.service_visit_quality_events set status='pending'"),
    ).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
    await expect(db.exec('delete from public.service_visit_quality_events')).rejects.toThrow(
      'inmutable',
    )
  })

  it('keeps both QA and its history unavailable to other roles and blocks writes for read-only companies', async () => {
    await actor(worker)
    await expect(list(a)).rejects.toMatchObject({ code: '42501' })
    expect((await history()).rows).toEqual([])
    await expect(save(a, ids(200), 0, 'reviewed', null, null, 510)).rejects.toMatchObject({
      code: '42501',
    })
    await actor(foreign)
    expect((await history()).rows).toEqual([])
    expect((await list(b)).rows).toHaveLength(1)
    await expect(save(b, foreignReport, 0, 'reviewed', null, null, 511)).rejects.toMatchObject({
      code: '42501',
    })
    await actor('', 'anon')
    await expect(list(a)).rejects.toMatchObject({ code: '42501' })
  })
})
