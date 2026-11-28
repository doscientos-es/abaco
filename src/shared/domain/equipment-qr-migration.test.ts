import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('equipment QR labels, exact assignment and revocation', () => {
  const db = new PGlite()
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const a = id(1),
    b = id(2),
    admin = id(3),
    worker = id(4),
    teamWorker = id(5),
    viewer = id(6),
    foreign = id(7)
  const centre = id(8),
    otherCentre = id(9),
    foreignCentre = id(10)
  const target = id(11),
    foreignTarget = id(12),
    wrongAsset = id(13),
    retired = id(14)
  const valid = id(21),
    other = id(22),
    closed = id(23),
    teamVisit = id(24),
    team = id(30)
  const goodAsset = id(31),
    badAsset = id(32),
    outsideAsset = id(33)
  let token = ''

  beforeAll(async () => {
    for (const file of [
      'tests/fixtures/equipment-qr.sql',
      'migrations/20261128164000_equipment_qr_labels.sql',
      'migrations/20261128164100_register_equipment_for_qr.sql',
    ]) {
      await db.exec(await readFile(new URL(`../../../supabase/${file}`, import.meta.url), 'utf8'))
    }
    await db.query('insert into public.test_tenants values ($1,true),($2,false)', [a, b])
    await db.query(
      "insert into public.memberships values ($1,$3,'admin'),($1,$4,'user'),($1,$5,'technician'),($1,$6,'viewer'),($2,$7,'owner')",
      [a, b, admin, worker, teamWorker, viewer, foreign],
    )
    await db.query(
      "insert into public.service_locations values ($1,$4,true,'service'),($2,$4,true,'both'),($3,$5,true,'service')",
      [centre, otherCentre, foreignCentre, a, b],
    )
    await db.query(
      "insert into public.service_assets values ($1,$4,$6,'active'),($2,$4,$7,'active'),($3,$5,$8,'active')",
      [goodAsset, badAsset, outsideAsset, a, b, centre, otherCentre, foreignCentre],
    )
    await db.query(
      `insert into public.installed_equipment (id,tenant_id,asset_id,kind,manufacturer,model,status) values
      ($1,$5,$7,'Bomba','Marca','Modelo','active'),
      ($2,$6,$9,'Private tenant','Private','Private','active'),
      ($3,$5,$8,'Wrong centre','Private','Private','active'),
      ($4,$5,$7,'Retired','Private','Private','retired')`,
      [target, foreignTarget, wrongAsset, retired, a, b, goodAsset, badAsset, outsideAsset],
    )
    await db.query(
      `insert into public.service_visits values
      ($1,$5,$6,$7,'scheduled',$8,null),
      ($2,$5,$10,$11,'scheduled',$8,null),
      ($3,$5,$6,$7,'completed',$8,null),
      ($4,$5,$6,$7,'in_progress',null,$9)`,
      [valid, other, closed, teamVisit, a, goodAsset, centre, worker, team, badAsset, otherCentre],
    )
    await db.query('insert into public.work_team_members values ($1,$2,$3)', [a, team, teamWorker])
    await db.query(
      `insert into public.service_incidents (id,tenant_id,source_visit_id,equipment_id,asset_id,location_id,status,created_at) values
        ($1,$5,$6,$9,$10,$11,'open',now()),
        ($2,$5,$7,$9,$12,$13,'resolved',now()),
        ($3,$5,$8,$9,$10,$11,'in_progress',now()),
        ($4,$5,$14,$9,$10,$11,'canceled',now())`,
      [
        id(41),
        id(42),
        id(43),
        id(44),
        a,
        valid,
        other,
        teamVisit,
        target,
        goodAsset,
        centre,
        badAsset,
        otherCentre,
        closed,
      ],
    )
    await db.query(
      `insert into public.installed_equipment_history values ($1,$2,$3,null,
         '{"status":"active","notes":"PRIVATE_LIFECYCLE"}',now())`,
      [id(50), a, target],
    )
  }, 30000)
  afterAll(async () => db.close())

  const act = async (uid: string, role = 'authenticated') => {
    await db.exec(`set role ${role}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
  }
  const list = (location = centre, tenant = a) =>
    db.query<{ token: string | null; revision: number; equipment_id: string }>(
      'select * from public.list_centre_equipment_labels($1,$2,0)',
      [tenant, location],
    )
  const write = (
    equipment: string,
    expected: number,
    action: string,
    op: number,
    location = centre,
    tenant = a,
  ) =>
    db.query<{ revision: number }>(
      'select public.change_equipment_label($1,$2,$3,$4,$5,$6) revision',
      [tenant, location, equipment, expected, action, id(op)],
    )
  const scan = async (tag: string, tenant = a) =>
    (
      await db.query<{ data: Record<string, unknown> | null }>(
        'select public.scan_equipment_label($1,$2) data',
        [tenant, tag],
      )
    ).rows[0]?.data

  it('permits scoped office creation and rejects unrelated centre, inactive equipment and stale writes', async () => {
    await act(admin)
    expect((await list()).rows).toMatchObject([{ equipment_id: target, revision: 0, token: null }])
    await expect(write(wrongAsset, 0, 'issue', 101)).rejects.toMatchObject({ code: 'P0002' })
    await expect(write(foreignTarget, 0, 'issue', 101)).rejects.toMatchObject({ code: 'P0002' })
    await expect(write(retired, 0, 'issue', 101)).rejects.toMatchObject({ code: 'P0002' })
    expect((await write(target, 0, 'issue', 102)).rows).toEqual([{ revision: 1 }])
    token = (await list()).rows[0]?.token ?? ''
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect((await write(target, 0, 'issue', 102)).rows).toEqual([{ revision: 1 }])
    await expect(write(target, 0, 'rotate', 103)).rejects.toMatchObject({ code: 'P0409' })
    const result = await scan(token)
    expect(result).toMatchObject({
      kind: 'Bomba',
      activity: [{ type: 'equipment', status: 'active' }],
    })
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })

  it('shows only activity from that exact assigned active visit, without private projection fields', async () => {
    await act(worker)
    await expect(list()).rejects.toMatchObject({ code: '42501' })
    await expect(write(target, 1, 'rotate', 109)).rejects.toMatchObject({ code: '42501' })
    const result = await scan(token)
    expect(Object.keys(result ?? {}).sort()).toEqual(['activity', 'kind', 'manufacturer', 'model'])
    expect(result).toMatchObject({ activity: [{ type: 'incident', status: 'open' }] })
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
    expect(await scan(token, b)).toBeNull()
    await act(teamWorker)
    expect(await scan(token)).toMatchObject({
      activity: [{ type: 'incident', status: 'in_progress' }],
    })
    await act(viewer)
    expect(await scan(token)).toBeNull()
    await act(foreign)
    expect(await scan(token, a)).toBeNull()
    await expect(write(foreignTarget, 0, 'issue', 110, foreignCentre, b)).rejects.toMatchObject({
      code: '42501',
    })
    await db.exec('reset role')
    await db.query("update public.service_visits set status='completed' where id=$1", [valid])
    await act(worker)
    expect(await scan(token)).toBeNull()
  })

  it('invalidates old labels after rotation, revokes the latest, and seals private schema and anonymous calls', async () => {
    await act(admin)
    expect((await write(target, 1, 'rotate', 120)).rows).toEqual([{ revision: 2 }])
    const renewed = (await list()).rows[0]?.token ?? ''
    expect(renewed).not.toBe(token)
    expect(await scan(token)).toBeNull()
    expect(await scan(renewed)).toMatchObject({ kind: 'Bomba' })
    expect((await write(target, 2, 'revoke', 121)).rows).toEqual([{ revision: 3 }])
    expect((await list()).rows[0]?.token).toBeNull()
    expect(await scan(renewed)).toBeNull()
    expect(
      (await db.query("select has_schema_privilege('authenticated','app_private','USAGE') allowed"))
        .rows,
    ).toEqual([{ allowed: false }])
    await expect(
      db.query('select app_private.scan_equipment_label($1,$2)', [a, renewed]),
    ).rejects.toMatchObject({ code: '42501' })
    await act('', 'anon')
    await expect(scan(renewed)).rejects.toMatchObject({ code: '42501' })
  })
  it('registers a physical child only with explicit scoped office approval, then issues an assigned-worker label', async () => {
    const register = async ({
      tenant = a,
      location = centre,
      asset = goodAsset,
      kind = '  Válvula física ',
      confirmed = true,
      op = id(201),
    } = {}) =>
      (
        await db.query<{ equipment_id: string }>(
          'select public.register_equipment_for_qr($1,$2,$3,$4,$5,$6,$7,$8) as equipment_id',
          [tenant, location, asset, kind, 'Marca', '', confirmed, op],
        )
      ).rows[0]?.equipment_id ?? ''
    const assets = (location = centre, tenant = a) =>
      db.query<{ id: string; name: string }>(
        'select * from public.list_equipment_registration_assets($1,$2,0)',
        [tenant, location],
      )
    await act(admin)
    expect((await assets()).rows).toEqual([{ id: goodAsset, name: 'Activo de prueba' }])
    await expect(register({ confirmed: false })).rejects.toMatchObject({ code: '22023' })
    await expect(register({ kind: '  ' })).rejects.toMatchObject({ code: '22023' })
    await expect(register({ kind: 'Parte\n privada' })).rejects.toMatchObject({ code: '22023' })
    await expect(register({ asset: badAsset })).rejects.toMatchObject({ code: 'P0002' })
    await expect(register({ asset: outsideAsset })).rejects.toMatchObject({ code: 'P0002' })
    await expect(register({ tenant: b })).rejects.toMatchObject({ code: '42501' })
    await act(foreign)
    await expect(
      register({ tenant: b, asset: outsideAsset, location: foreignCentre }),
    ).rejects.toMatchObject({ code: '42501' })
    for (const actor of [worker, viewer]) {
      await act(actor)
      await expect(assets()).rejects.toMatchObject({ code: '42501' })
      await expect(register()).rejects.toMatchObject({ code: '42501' })
    }
    await act('', 'anon')
    await expect(register()).rejects.toMatchObject({ code: '42501' })
    await act(admin)
    await expect(
      db.query('select * from app_private.equipment_registration_receipts'),
    ).rejects.toMatchObject({ code: '42501' })
    const created = await register()
    expect(created).toMatch(/^[0-9a-f-]{36}$/)
    expect(await register()).toBe(created)
    await expect(register({ kind: 'Otro tipo' })).rejects.toMatchObject({ code: 'P0409' })
    expect((await list()).rows.map((row) => row.equipment_id)).toEqual([created, target])
    await write(created, 0, 'issue', 202)
    const issued = (await list()).rows[0]?.token ?? ''
    expect(issued).toMatch(/^[0-9a-f-]{36}$/)
    await act(worker)
    // Existing same worker's visit at another asset does not grant access.
    expect(await scan(issued)).toBeNull()
    await act(teamWorker)
    expect(await scan(issued)).toMatchObject({
      kind: 'Válvula física',
      manufacturer: 'Marca',
      model: '',
      activity: [],
    })
    await db.exec('reset role')
    const receipts = await db.query<{ actor_id: string }>(
      'select actor_id from app_private.equipment_registration_receipts where equipment_id=$1',
      [created],
    )
    expect(receipts.rows).toEqual([{ actor_id: admin }])
    await db.query("update public.service_locations set kind='billing' where id=$1", [centre])
    await act(admin)
    expect((await assets()).rows).toEqual([])
    await expect(register()).rejects.toMatchObject({ code: 'P0002' })
    expect(await scan(issued)).toBeNull()
  })
})
