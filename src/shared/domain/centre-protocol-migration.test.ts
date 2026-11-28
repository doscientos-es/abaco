import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('versioned centre protocols', () => {
  const db = new PGlite()
  const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
  const [a, b, owner, worker, otherWorker, editor, foreign] = [1, 2, 3, 4, 5, 6, 7].map(id) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  const centre = id(11)
  const otherCentre = id(12)
  const foreignCentre = id(13)
  const billing = id(14)
  const directVisit = id(21)
  const teamVisit = id(22)
  const earlierDirect = id(23)
  const earlierTeam = id(24)
  const unrelated = id(25)
  const otherCentreVisit = id(26)
  const foreignVisit = id(27)
  const team = id(30)

  beforeAll(async () => {
    for (const file of [
      'tests/fixtures/centre-protocol.sql',
      'migrations/20261128160500_service_location_protocol.sql',
    ]) {
      await db.exec(await readFile(new URL(`../../../supabase/${file}`, import.meta.url), 'utf8'))
    }
    await db.query('insert into public.test_tenants values ($1,true),($2,false)', [a, b])
    await db.query(
      "insert into public.memberships values ($1,$3,'owner'),($1,$4,'user'),($1,$5,'technician'),($1,$6,'editor'),($2,$7,'admin')",
      [a, b, owner, worker, otherWorker, editor, foreign],
    )
    await db.query(
      "insert into public.service_locations (id,tenant_id,active,kind) values ($1,$5,true,'service'),($2,$5,true,'service'),($3,$6,true,'service'),($4,$5,true,'billing')",
      [centre, otherCentre, foreignCentre, billing, a, b],
    )
    await db.query(
      `insert into public.service_visits values
      ($1,$8,$10,'scheduled',null,$13,null),($2,$8,$10,'in_progress',null,null,$15),
      ($3,$8,$10,'completed',now()-interval '1 day',$13,null),
      ($4,$8,$10,'completed',now()-interval '3 hours',null,$15),
      ($5,$8,$10,'scheduled',null,$14,null),($6,$8,$11,'scheduled',null,$13,null),
      ($7,$9,$12,'scheduled',null,$16,null)`,
      [
        directVisit,
        teamVisit,
        earlierDirect,
        earlierTeam,
        unrelated,
        otherCentreVisit,
        foreignVisit,
        a,
        b,
        centre,
        otherCentre,
        foreignCentre,
        worker,
        otherWorker,
        team,
        foreign,
      ],
    )
    await db.query('insert into public.work_team_members values ($1,$2,$3),($1,$2,$4)', [
      a,
      team,
      worker,
      otherWorker,
    ])
    await db.query(
      'insert into public.service_visit_events values ($1,$2,\'status_changed\',$3,\'{"to":"completed","reason":"PRIVATE_EVENT"}\')',
      [a, earlierTeam, worker],
    )
    await db.query(
      `insert into public.service_location_protocol_versions
      (tenant_id,location_id,revision,operation_id,items,shared,edited_by,edited_at)
      values ($1,$2,1,$3,array['Old removed instruction','Keep instruction'],true,$4,now()-interval '2 days')`,
      [a, centre, id(100), owner],
    )
  }, 30000)
  afterAll(async () => db.close())

  const actor = async (uid: string, role = 'authenticated') => {
    await db.exec(`set role ${role}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
  }
  const save = (
    location: string,
    version: number,
    items: string[],
    shared: boolean,
    reviewed: boolean,
    operation: number,
    tenant = a,
  ) =>
    db.query<{ revision: number }>(
      'select public.save_service_location_protocol($1,$2,$3,$4,$5,$6,$7) revision',
      [tenant, location, version, items, shared, reviewed, id(operation)],
    )
  const read = (visits: string[], tenant = a) =>
    db.query('select * from public.list_assigned_visit_protocols($1,$2)', [tenant, visits])
  const versions = () =>
    db.query(
      'select revision,items,shared from public.service_location_protocol_versions order by revision',
    )

  it('allows owner drafts with guarded rows and edit version, without shared access', async () => {
    await actor(owner)
    await expect(
      save(foreignCentre, 0, ['wrong company'], false, false, 201),
    ).rejects.toMatchObject({ code: 'P0002' })
    await expect(save(billing, 0, ['wrong centre kind'], false, false, 212)).rejects.toMatchObject({
      code: 'P0002',
    })
    await expect(save(centre, 1, ['draft'], true, false, 202)).rejects.toMatchObject({
      code: '22023',
    })
    await expect(
      save(
        centre,
        1,
        Array.from({ length: 7 }, () => 'row'),
        false,
        false,
        203,
      ),
    ).rejects.toMatchObject({ code: '22023' })
    await expect(save(centre, 1, ['one', 'one'], false, false, 204)).rejects.toMatchObject({
      code: '22023',
    })
    await expect(save(centre, 1, ['x'.repeat(161)], false, false, 205)).rejects.toMatchObject({
      code: '22023',
    })
    await expect(save(centre, 1, ['multiple\nlines'], false, false, 206)).rejects.toMatchObject({
      code: '22023',
    })
    await expect(
      save(otherCentre, 0, ['Other centre draft'], false, false, 207),
    ).rejects.toMatchObject({ code: '22023' })
    expect((await save(otherCentre, 0, ['Other centre draft'], false, true, 207)).rows).toEqual([
      { revision: 1 },
    ])
    await actor(worker)
    expect((await read([otherCentreVisit])).rows).toEqual([])
    expect((await versions()).rows).toEqual([])
    await expect(save(otherCentre, 1, ['Not office'], true, true, 208)).rejects.toMatchObject({
      code: '42501',
    })
  })

  it('compares only current shared items against proven previous visits and isolates visits and centres', async () => {
    await actor(owner)
    const publish = () => save(centre, 1, ['Keep instruction', 'Current step'], true, true, 210)
    expect((await publish()).rows).toEqual([{ revision: 2 }])
    expect((await publish()).rows).toEqual([{ revision: 2 }])
    await expect(save(centre, 1, ['Stale write'], true, true, 211)).rejects.toMatchObject({
      code: 'P0409',
    })
    expect((await read([directVisit])).rows).toEqual([])
    await actor(worker)
    const result = (
      await read([
        directVisit,
        directVisit,
        teamVisit,
        earlierDirect,
        unrelated,
        otherCentreVisit,
        foreignVisit,
      ])
    ).rows
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      visit_id: directVisit,
      revision: 2,
      items: ['Keep instruction', 'Current step'],
      state: 'changed',
      changed_items: ['Current step'],
      removed_count: 1,
    })
    expect(result).toContainEqual({
      visit_id: teamVisit,
      revision: 2,
      items: ['Keep instruction', 'Current step'],
      state: 'changed',
      changed_items: ['Current step'],
      removed_count: 1,
    })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Old removed/)
    await expect(read([foreignVisit], b)).rejects.toMatchObject({ code: '42501' })
    await expect(read(Array.from({ length: 51 }, () => directVisit))).rejects.toMatchObject({
      code: '22023',
    })
    await actor(otherWorker)
    expect((await read([teamVisit])).rows).toMatchObject([
      { state: 'no_baseline', changed_items: [], removed_count: 0 },
    ])
  })

  it('withdraws immediately, denies unauthorized roles and does not require private schema access', async () => {
    await actor(owner)
    expect(
      (await save(centre, 2, ['Keep instruction', 'Current step'], false, false, 220)).rows,
    ).toEqual([{ revision: 3 }])
    expect((await versions()).rows).toHaveLength(4)
    expect(
      (await db.query("select has_schema_privilege('authenticated','app_private','USAGE') allowed"))
        .rows,
    ).toEqual([{ allowed: false }])
    await expect(
      db.query('select * from app_private.list_assigned_visit_protocols($1,$2)', [
        a,
        [directVisit],
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.exec('delete from public.service_location_protocol_versions'),
    ).rejects.toMatchObject({ code: '42501' })
    await actor(worker)
    expect((await read([directVisit, teamVisit])).rows).toEqual([])
    await actor(editor)
    await expect(read([directVisit])).rejects.toMatchObject({ code: '42501' })
    await expect(save(centre, 3, ['No editor'], true, true, 221)).rejects.toMatchObject({
      code: '42501',
    })
    await actor(foreign)
    expect((await versions()).rows).toEqual([])
    await expect(save(foreignCentre, 0, ['Read-only'], true, true, 222, b)).rejects.toMatchObject({
      code: '42501',
    })
  })
})
