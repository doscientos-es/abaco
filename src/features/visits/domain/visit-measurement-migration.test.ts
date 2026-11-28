import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function migration(name: string) {
  return readFileSync(new URL(`../../../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

const sql = migration('20261128152638_visit_measurement_comparison.sql')
const existingMeasurements = migration('20261027143749_pool_measurements.sql')
const roles = migration('20261109143327_admin_user_roles.sql')
const rolePatch = roles.slice(
  roles.indexOf('do $migration$'),
  roles.indexOf('$migration$;') + '$migration$;'.length,
)
const team = migration('20261112115459_team_visit_permissions.sql')
const scope = team.split('alter policy service_visits_select')[0]
const commandStart = team.indexOf('do $commands$')
const commandPatch =
  team.slice(commandStart, team.indexOf('\n  select pg_catalog.pg_get_functiondef', commandStart)) +
  '\nend;\n$commands$;'
const id = (n: number) => `ab740000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1),
  foreign = id(2),
  worker = id(3),
  colleague = id(4),
  outsider = id(5)
const admin = id(6),
  group = id(7),
  pool = id(8),
  anotherPool = id(9),
  lift = id(10)
const visit = id(11),
  noPoolVisit = id(12),
  oldVisit = id(13),
  cancelledVisit = id(14),
  otherPoolVisit = id(15)
const recordId = id(16)
const sampleAt = '2026-11-26T13:00:00Z'
type Parameter = { id: string; label: string; unit: string; version: string }
type Context = {
  supported: boolean
  parameters: Parameter[]
  readings: Array<{
    id: string
    value: number
    unit: string
    method: string
    previous: Record<string, unknown> | null
  }>
}

let db: PGlite
let parameter: Parameter

async function authAs<T>(user: string, action: () => Promise<T>, role = 'authenticated') {
  await db.exec(`set role ${role}; set request.jwt.claim.sub = '${user}';`)
  try {
    return await action()
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub')
  }
}

async function read(company = tenant, target = visit): Promise<Context> {
  const { rows } = await db.query<{ body: Context }>(
    'select public.visit_measurement_context($1,$2) as body',
    [company, target],
  )
  assert.ok(rows[0])
  return rows[0].body
}
async function record(
  stated = parameter,
  operationId = recordId,
  value = 7.2,
  method = 'Sonda digital',
  target = visit,
) {
  const { rows } = await db.query<{ id: string }>(
    'select public.record_visit_measurement_with_unit($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
    [tenant, target, stated.id, stated.unit, stated.version, value, method, sampleAt, operationId],
  )
  return rows[0]?.id
}

describe('pool measurement context and explicit unit', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      revoke all on schema app_private from public, anon, authenticated, service_role;
      create function auth.uid() returns uuid language sql stable
        as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create type public.app_role as enum ('owner','admin','editor','viewer','technician','user');
      create table public.memberships (tenant_id uuid, user_id uuid, role public.app_role, primary key(tenant_id,user_id));
      create function public.has_role(t uuid, roles public.app_role[]) returns boolean language sql stable security definer
        as $$select exists (select 1 from public.memberships where tenant_id=t and user_id=auth.uid() and role=any(roles))$$;
      create function public.tenant_can_write(t uuid) returns boolean language sql stable as $$select t is not null$$;
      create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at := clock_timestamp(); return new; end$$;
      create function public.reject_work_history_change() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
      create table public.service_assets (id uuid primary key, tenant_id uuid, name text, kind text);
      create table public.pool_profiles (asset_id uuid, tenant_id uuid, primary key(asset_id,tenant_id));
      create table public.service_visits (id uuid primary key, tenant_id uuid, asset_id uuid, status text,
        assigned_user_id uuid, work_team_id uuid, actual_end_at timestamptz);
      create table public.work_team_members (tenant_id uuid, team_id uuid, user_id uuid);
      ${existingMeasurements}
      ${rolePatch}
      ${scope}
      ${commandPatch}
      ${sql}
      insert into public.memberships values
        ('${tenant}','${worker}','user'), ('${tenant}','${colleague}','user'),
        ('${tenant}','${admin}','admin'), ('${foreign}','${outsider}','admin');
      insert into public.work_team_members values ('${tenant}','${group}','${worker}');
      insert into public.service_assets values ('${pool}','${tenant}','Piscina actual','pool'),
        ('${anotherPool}','${tenant}','Piscina distinta','pool'), ('${lift}','${tenant}','Montacargas','equipment');
      insert into public.pool_profiles values ('${pool}','${tenant}'), ('${anotherPool}','${tenant}');
      insert into public.service_visits values
        ('${visit}','${tenant}','${pool}','in_progress',null,'${group}',null),
        ('${noPoolVisit}','${tenant}','${lift}','scheduled','${worker}',null,null),
        ('${oldVisit}','${tenant}','${pool}','completed','${colleague}',null,'2026-11-25T18:00:00Z'),
        ('${cancelledVisit}','${tenant}','${pool}','canceled','${colleague}',null,'2026-11-25T18:00:00Z'),
        ('${otherPoolVisit}','${tenant}','${anotherPool}','completed','${colleague}',null,'2026-11-25T18:00:00Z');
    `)
    const picked = await authAs(worker, async () =>
      (await read()).parameters.find((item) => item.label === 'pH'),
    )
    assert.ok(picked)
    parameter = picked
    await db.exec(`
      insert into public.service_visit_measurements (
        id, operation_id, tenant_id, visit_id, asset_id, parameter_id, value, code_snapshot,
        label_snapshot, unit_snapshot, assessment, method, measured_at, recorded_by, supersedes_id
      )
      select samples.id::uuid, gen_random_uuid(),'${tenant}',samples.visit_id::uuid,m.asset_id,m.id,
        samples.value,'ph','Etiqueta antigua privada',samples.unit,'unconfigured',samples.method,
        samples.at::timestamptz,'${colleague}',samples.supersedes::uuid
      from (values
        ('${id(30)}','${oldVisit}','${pool}',7.31,'pH','Sonda digital','2026-11-20T10:00:00Z',null),
        ('${id(31)}','${oldVisit}','${pool}',7.88,'pH','Sonda digital','2026-11-21T10:00:00Z',null),
        ('${id(32)}','${oldVisit}','${pool}',7.53,'pH','Sonda digital','2026-11-21T10:00:00Z','${id(31)}'),
        ('${id(33)}','${oldVisit}','${pool}',7.90,'pH','Tiras','2026-11-22T10:00:00Z',null),
        ('${id(34)}','${oldVisit}','${pool}',99.00,'unidad antigua','Sonda digital','2026-11-23T10:00:00Z',null),
        ('${id(35)}','${otherPoolVisit}','${anotherPool}',7.91,'pH','Sonda digital','2026-11-24T10:00:00Z',null),
        ('${id(36)}','${cancelledVisit}','${pool}',7.92,'pH','Sonda digital','2026-11-25T10:00:00Z',null),
        ('${id(37)}','${oldVisit}','${pool}',7.93,'pH','Sonda digital','2026-11-27T10:00:00Z',null)
      ) samples(id,visit_id,asset_id,value,unit,method,at,supersedes)
      join public.pool_measurement_parameters m on m.asset_id=samples.asset_id::uuid and m.code='ph'
      order by samples.id;
    `)
  }, 60_000)
  afterAll(async () => db?.close())

  it('does not conflate unsupported assets or an unrecorded reading with no comparable history', async () => {
    await authAs(worker, async () => {
      expect(await read(tenant, noPoolVisit)).toEqual({
        supported: false,
        parameters: [],
        readings: [],
      })
      expect(await read()).toMatchObject({ supported: true, readings: [] })
      await expect(read(tenant, oldVisit)).rejects.toMatchObject({ code: '42501' })
    })
    await authAs(outsider, async () => {
      await expect(read()).rejects.toMatchObject({ code: '42501' })
      await expect(read(foreign, visit)).rejects.toMatchObject({ code: 'P0002' })
      await expect(record()).rejects.toMatchObject({ code: '42501' })
    })
    await authAs(
      worker,
      async () => {
        await expect(read()).rejects.toMatchObject({ code: '42501' })
      },
      'anon',
    )
  })

  it('registers the typed reading via the existing writer and reveals only its latest comparable prior value', async () => {
    await authAs(worker, async () => {
      await expect(record({ ...parameter, unit: 'mV' })).rejects.toMatchObject({ code: 'P0409' })
      await expect(record(parameter, recordId, 7.2001)).rejects.toMatchObject({ code: '22023' })
      const recorded = await record()
      expect(recorded).toMatch(/^[a-f0-9-]{36}$/)
      expect(await record()).toBe(recorded)
      const { readings } = await read()
      expect(readings).toHaveLength(1)
      expect(readings[0]).toMatchObject({
        id: recorded,
        value: 7.2,
        unit: 'pH',
        method: 'Sonda digital',
        previous: { value: 7.53, unit: 'pH', measured_at: '2026-11-21T10:00:00+00:00' },
      })
      expect(Object.keys(readings[0]?.previous ?? {}).sort()).toEqual([
        'measured_at',
        'unit',
        'value',
      ])
      expect(JSON.stringify(readings)).not.toContain('Etiqueta antigua privada')
      await record(parameter, id(41), 7.3, 'Método no comparable')
      expect(
        (await read()).readings.find(({ method }) => method === 'Método no comparable')?.previous,
      ).toBeNull()
    })
  })

  it('prevents silently saving changed units, permits an identical retry, and respects reassignment and closing', async () => {
    await db.exec(
      `update public.pool_measurement_parameters set unit='otra unidad' where id='${parameter.id}';`,
    )
    await authAs(worker, async () => {
      await expect(record(parameter, id(43))).rejects.toMatchObject({ code: 'P0409' })
      expect(await record()).toMatch(/^[a-f0-9-]{36}$/)
      const next = (await read()).parameters.find(({ id }) => id === parameter.id)
      assert.ok(next)
      expect(next.unit).toBe('otra unidad')
      await record(next, id(44), 7.2)
      const reading = (await read()).readings.find(({ unit }) => unit === 'otra unidad')
      expect(reading?.previous).toBeNull()
    })
    await db.exec(
      `update public.service_visits set assigned_user_id='${colleague}',work_team_id=null where id='${visit}';`,
    )
    await authAs(worker, async () => {
      await expect(read()).rejects.toMatchObject({ code: '42501' })
      await expect(record()).rejects.toMatchObject({ code: '42501' })
    })
    await db.exec(
      `update public.service_visits set status='completed',actual_end_at='2026-11-27T10:00:00Z' where id='${visit}';`,
    )
    await authAs(admin, async () => {
      const { parameters, readings } = await read()
      const fresh = parameters.find(({ id }) => id === parameter.id)
      assert.ok(fresh)
      expect(readings).toHaveLength(3)
      await expect(record(fresh, id(45))).rejects.toMatchObject({ code: 'P0409' })
    })
  })
})
