import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('DEV-59 internal material review', () => {
  const db = new PGlite()
  const ids = (id: number) => `ab590000-0000-4000-8000-${String(id).padStart(12, '0')}`
  const tenant = ids(1)
  const other = ids(2)
  const unconfigured = ids(3)
  const owner = ids(4)
  const assigned = ids(5)
  const teammate = ids(6)
  const outsider = ids(7)
  const viewer = ids(8)
  const team = ids(9)
  const visit = ids(10)
  const teamVisit = ids(11)
  const closed = ids(12)
  const foreign = ids(13)
  const unknownPlan = ids(14)
  const legacyEntry = ids(15)
  const otherOffice = ids(16)
  const unassigned = ids(17)
  const readOnly = ids(18)
  const readOnlyVisit = ids(19)
  type RecordedEntry = { id: string }
  const actor = async (uid: string, role: 'authenticated' | 'anon' = 'authenticated') => {
    await db.exec(`reset role; set role ${role}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
  }
  const apply = async (relative: string) =>
    db.exec(await readFile(new URL(relative, import.meta.url), 'utf8'))
  const session = '2026-10-20 09:00:00+00'
  const save = (
    operation: number,
    {
      company = tenant,
      target = visit,
      quantity = 2,
      review = true,
      kind = 'material',
      unit = 'ud',
      supersedes = null,
      legacy = false,
    }: {
      company?: string
      target?: string
      quantity?: number
      review?: boolean | null
      kind?: string
      unit?: string
      supersedes?: string | null
      legacy?: boolean
    } = {},
  ) =>
    db.query<RecordedEntry>(
      `select public.${legacy ? 'record_service_visit_field_entry' : 'record_service_visit_material'}($1,$2,$3,$4,$5,$6,$7,$8,$9${legacy ? '' : ',$10'}) id`,
      [
        company,
        target,
        kind,
        'Arandela de prueba',
        quantity,
        unit,
        session,
        supersedes,
        ids(operation),
        ...(legacy ? [] : [review]),
      ],
    )
  const choices = (company = tenant, target: string | null = visit, search = '') =>
    db.query('select * from public.list_service_visit_material_choices($1,$2,$3)', [
      company,
      target,
      search,
    ])
  const officeReview = (company = tenant, target = visit, offset = 0) =>
    db.query('select * from public.list_service_visit_materials_for_review($1,$2,$3)', [
      company,
      target,
      offset,
    ])

  beforeAll(async () => {
    await apply('../supabase/tests/fixtures/visit-quick-materials.sql')
    await apply('../supabase/migrations/20261027143818_visit_field_entries.sql')
    // Apply the exact admin/user role-migration callback that rewrites old
    // RPCs; the newer team assignment migration then replaces the predicate.
    const roleMigration = await readFile(
      new URL('../supabase/migrations/20261109143327_admin_user_roles.sql', import.meta.url),
      'utf8',
    )
    const roleCallback = /do \$migration\$[\s\S]*?\$migration\$;/.exec(roleMigration)?.[0]
    if (!roleCallback) throw new Error('Missing role migration callback')
    await db.exec(roleCallback)
    await db.exec(`do $migration$
      declare definition text; updated text;
      begin
        select pg_get_functiondef('public.record_service_visit_field_entry(uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid)'::regprocedure) into strict definition;
        updated := replace(definition, 'target.assigned_user_id = (select auth.uid())',
          'public.can_access_assigned_visit(p_tenant_id, p_visit_id)');
        if updated = definition then raise exception 'Unexpected field entry definition'; end if;
        execute updated;
      end; $migration$;`)
    // Mirror the RLS predicate installed by 20261112115459 for the real field ledger.
    await db.exec(`alter policy service_visit_field_entries_select on public.service_visit_field_entries
      using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[])
      or public.can_access_assigned_visit(tenant_id,visit_id));`)
    await db.query('insert into public.tenant_write_status values ($1,true),($2,true),($3,false)', [
      tenant,
      other,
      readOnly,
    ])
    await db.query(
      `insert into public.memberships values ($1,$5,'owner'),($1,$6,'user'),
      ($1,$7,'technician'),($1,$8,'technician'),($1,$9,'viewer'),($2,$10,'owner'),($3,$6,'user'),($4,$6,'user')`,
      [
        tenant,
        other,
        unconfigured,
        readOnly,
        owner,
        assigned,
        teammate,
        outsider,
        viewer,
        otherOffice,
      ],
    )
    await db.query(
      `insert into public.service_visits values
      ($1,$8,$10,null,'scheduled',null,null),($2,$8,null,$11,'in_progress',null,null),
      ($3,$8,$10,null,'completed',null,null),($4,$9,null,null,'scheduled',null,null),
      ($5,$12,$10,null,'scheduled',null,null),($6,$8,null,null,'scheduled',null,null),
      ($7,$13,$10,null,'scheduled',null,null)`,
      [
        visit,
        teamVisit,
        closed,
        foreign,
        unknownPlan,
        unassigned,
        readOnlyVisit,
        tenant,
        other,
        assigned,
        team,
        unconfigured,
        readOnly,
      ],
    )
    await db.query('insert into public.work_team_members values ($1,$2,$3)', [
      team,
      tenant,
      teammate,
    ])
    await db.query(
      `insert into public.catalog_items values
      ($1,$5,'material','Arandela','ud',12999,'SKU_SECRETO','NOTA_SECRETA'),
      ($2,$5,'material','Junta','',5,'SKU_SECRETO','NOTA_SECRETA'),
      ($3,$6,'material','AJENA','L',1,'SKU_SECRETO','NOTA_SECRETA'),
      ($4,$5,'labor','MANO_DE_OBRA','h',1,'SKU_SECRETO','NOTA_SECRETA')`,
      [ids(30), ids(31), ids(32), ids(33), tenant, other],
    )
    await db.query(
      `insert into public.service_visit_field_entries (id, operation_id, tenant_id, visit_id, kind, description, quantity, unit, occurred_at, recorded_by)
      values ($1,$2,$3,$4,'material','Material de versión anterior',1,'ud',$5,$6)`,
      [legacyEntry, ids(34), tenant, visit, session, assigned],
    )
    const oldDefinition = () =>
      db.query(
        "select pg_get_functiondef('public.record_service_visit_field_entry(uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid)'::regprocedure) definition",
      )
    const before = (await oldDefinition()).rows
    await apply('../supabase/migrations/20261128152804_service_visit_quick_materials.sql')
    expect((await oldDefinition()).rows).toEqual(before)
  }, 30_000)

  afterAll(async () => db.close())

  it('returns only the requested tenant’s allowed material names and units, never pricing or stock', async () => {
    await actor(assigned)
    expect((await choices()).rows).toEqual([
      { id: ids(30), name: 'Arandela', unit: 'ud' },
      { id: ids(31), name: 'Junta', unit: 'ud' },
    ])
    expect((await choices(tenant, visit, 'RAN')).rows).toHaveLength(1)
    expect((await choices(tenant, visit, '%')).rows).toEqual([])
    expect((await choices(tenant, null)).rows).toEqual([])
    expect((await choices(tenant, closed)).rows).toEqual([])
    expect((await choices(other, foreign)).rows).toEqual([])
    expect((await db.query('select * from public.catalog_items')).rows).toEqual([])
  })

  it('offers a bounded lookup only for current assigned users, their team and office', async () => {
    await actor(teammate)
    expect((await choices(tenant, teamVisit)).rows).toHaveLength(2)
    expect((await choices(tenant, visit)).rows).toHaveLength(0)
    await actor(viewer)
    expect((await choices()).rows).toHaveLength(0)
    await actor(outsider)
    expect((await choices(tenant, unassigned)).rows).toHaveLength(0)
    await actor(owner)
    expect((await choices()).rows).toHaveLength(2)
    await db.exec('reset role')
    await db.query(
      `insert into public.catalog_items
      select gen_random_uuid(), $1::uuid, 'material', 'Z material ' || n, 'u', 0, '', ''
      from generate_series(1,50) n`,
      [tenant],
    )
    await actor(assigned)
    expect((await choices()).rows).toHaveLength(40)
  })

  it('keeps compatible writes and legacy flags off, records exact idempotent review metadata', async () => {
    await actor(assigned)
    const previous = await db.query(
      'select office_review_requested from public.service_visit_field_entries where id = $1',
      [legacyEntry],
    )
    expect(previous.rows).toEqual([{ office_review_requested: false }])
    const first = (await save(90)).rows
    expect(first).toHaveLength(1)
    expect((await save(90)).rows).toEqual(first)
    await expect(save(90, { review: false })).rejects.toMatchObject({ code: '23505' })
    await expect(save(90, { quantity: 3 })).rejects.toMatchObject({ code: '23505' })
    expect((await save(91, { legacy: true })).rows).toHaveLength(1)
    await actor(owner)
    await expect(save(90)).rejects.toMatchObject({ code: '23505' })
    expect((await officeReview()).rows).toMatchObject([{ id: first[0]?.id, quantity: '2.000' }])
    await actor(assigned)
    expect((await officeReview()).rows).toEqual([])
    await actor(otherOffice)
    expect((await officeReview(tenant, visit)).rows).toEqual([])
  })

  it('shows only the latest explicitly flagged correction in the office while preserving the ledger', async () => {
    await actor(assigned)
    const original = (await save(92)).rows[0]?.id
    if (!original) throw new Error('Missing original ledger row')
    const correction = (await save(93, { supersedes: original, review: false, quantity: 2.125 }))
      .rows[0]?.id
    if (!correction) throw new Error('Missing first correction')
    const second = (await save(94, { supersedes: correction, review: true, quantity: 3.625 }))
      .rows[0]?.id
    if (!second) throw new Error('Missing second correction')
    await actor(owner)
    const reviews = (await officeReview()).rows
    expect(reviews).toContainEqual(expect.objectContaining({ id: second, quantity: '3.625' }))
    expect(reviews).not.toContainEqual(expect.objectContaining({ id: original }))
    expect(reviews).not.toContainEqual(expect.objectContaining({ id: correction }))
    expect(
      (
        await db.query('select id from public.service_visit_field_entries where id in ($1,$2,$3)', [
          original,
          correction,
          second,
        ])
      ).rows,
    ).toHaveLength(3)
    expect((await officeReview(tenant, visit, -1)).rows).toEqual([])
  })

  it('rejects absent and changed assignment, invalid markers, write-disabled tenant and closed changes', async () => {
    await actor(outsider)
    await expect(save(100)).rejects.toMatchObject({ code: '42501' })
    await expect(save(100, { target: unassigned })).rejects.toMatchObject({ code: '42501' })
    await actor('')
    await expect(save(101)).rejects.toMatchObject({ code: '42501' })
    expect((await choices()).rows).toEqual([])
    await actor(assigned)
    await expect(save(102, { target: closed })).rejects.toMatchObject({ code: 'P0409' })
    await expect(save(103, { company: unconfigured, target: unknownPlan })).rejects.toMatchObject({
      code: 'P0402',
    })
    await expect(save(103, { company: readOnly, target: readOnlyVisit })).rejects.toMatchObject({
      code: 'P0402',
    })
    await expect(save(104, { kind: 'labor', unit: 'min' })).rejects.toMatchObject({ code: '22023' })
    await expect(save(105, { review: null })).rejects.toMatchObject({ code: '22023' })
    await expect(save(106, { quantity: 1.0001 })).rejects.toMatchObject({ code: '22023' })
    await actor(teammate)
    expect((await save(107, { target: teamVisit })).rows).toHaveLength(1)
    await db.exec('reset role')
    await db.query('delete from public.work_team_members where team_id = $1', [team])
    await actor(teammate)
    expect((await choices(tenant, teamVisit)).rows).toEqual([])
    await expect(save(108, { target: teamVisit })).rejects.toMatchObject({ code: '42501' })
  })

  it('does not grant anonymous execution, direct table writes, or name resolution into the definer schema', async () => {
    await actor('', 'anon')
    await expect(choices()).rejects.toMatchObject({ code: '42501' })
    await expect(officeReview()).rejects.toMatchObject({ code: '42501' })
    await expect(save(109)).rejects.toMatchObject({ code: '42501' })
    await actor(owner)
    await expect(
      db.query('update public.service_visit_field_entries set office_review_requested = true'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.query('select * from app_private.list_service_visit_material_choices($1,$2,$3)', [
        tenant,
        visit,
        '',
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    expect(
      (
        await db.query<{
          public_write_is_invoker: boolean
          private_usage: boolean
        }>(`select not prosecdef as public_write_is_invoker, has_schema_privilege('authenticated','app_private','usage') as private_usage
      from pg_catalog.pg_proc where oid = 'public.record_service_visit_material(uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid,boolean)'::regprocedure`)
      ).rows,
    ).toEqual([{ public_write_is_invoker: true, private_usage: false }])
  })
})
