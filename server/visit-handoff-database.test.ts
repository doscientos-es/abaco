import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { VisitHandoffs } from '../src/features/visits/infrastructure/visit-handoff-repository'

const id = (n: number) => `78000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const client = id(3)
const site = id(5)
const person = id(11)
const replacement = id(12)
const laterWorker = id(13)
const outsider = id(14)
const office = id(15)
const teamWorker = id(16)
const team = id(17)
const source = id(20)
const first = id(21)
const next = id(22)
const wrongSite = id(23)
const wrongAsset = id(24)
const wrongContract = id(25)
const wrongWork = id(26)
const unassigned = id(27)
const other = id(28)
const anonymous = ''

function firstValue<T>(result: { rows: { value: T }[] }): T {
  const [row] = result.rows
  if (!row) throw new Error('RPC did not return a row')
  return row.value
}

function rpcError(code: string) {
  return expect.objectContaining({ code })
}

describe('DEV-78 private handoffs between assigned visits', () => {
  const db = new PGlite()
  const identity = (value: string) =>
    db.query("select set_config('request.user_id', $1, false)", [value])
  const read = async (visit: string | null, tenantId: string | null = tenant) =>
    firstValue(
      await db.query<{ value: VisitHandoffs }>(
        'select public.list_service_visit_handoffs($1,$2) value',
        [tenantId, visit],
      ),
    )
  const create = async (
    visit: string | null = source,
    title = 'Revisar presión',
    operation: string | null = id(100),
    tenantId: string | null = tenant,
  ) =>
    firstValue(
      await db.query<{ value: string }>(
        'select public.create_service_visit_handoff($1,$2,$3,$4) value',
        [tenantId, visit, title, operation],
      ),
    )
  const resolve = async (
    visit: string | null,
    handoff: string | null,
    operation: string | null = id(200),
    tenantId: string | null = tenant,
  ) =>
    firstValue(
      await db.query<{ value: string }>(
        'select public.resolve_service_visit_handoff($1,$2,$3,$4) value',
        [tenantId, visit, handoff, operation],
      ),
    )
  async function maintenance(statement: string, values: unknown[] = []) {
    await db.exec('reset role')
    try {
      await db.query(statement, values)
    } finally {
      await db.exec('set role authenticated')
    }
  }
  const closeSource = () =>
    maintenance(
      "update public.service_visits set status='completed', actual_end_at=now() where id=$1",
      [source],
    )

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create type public.app_role as enum ('owner','admin','editor','technician','user','viewer');
      create table public.tenants(id uuid primary key, writable boolean default true);
      create table public.memberships(tenant_id uuid not null, user_id uuid not null,
        role public.app_role not null, primary key(tenant_id,user_id));
      create table public.work_teams(id uuid primary key, tenant_id uuid not null, archived_at timestamptz);
      create table public.work_team_members(tenant_id uuid, team_id uuid, user_id uuid,
        primary key(tenant_id,team_id,user_id));
      create table public.service_visits(
        id uuid primary key, tenant_id uuid not null, client_id uuid not null,
        location_id uuid, asset_id uuid, work_order_id uuid, contract_id uuid, contract_rule_id uuid,
        work_team_id uuid, assigned_user_id uuid, status text not null,
        scheduled_start_at timestamptz not null, scheduled_end_at timestamptz not null, actual_end_at timestamptz,
        notes text not null default 'NOTA PRIVADA ORIGEN', unique(id,tenant_id)
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.user_id', true), '')::uuid
      $$;
      create function public.has_role(t uuid, roles public.app_role[]) returns boolean
      language sql stable security definer set search_path='' as $$
        select m.role=any(roles) from public.memberships m
          where m.tenant_id=t and m.user_id=(select auth.uid())

      $$;
      create function public.tenant_can_write(t uuid) returns boolean
      language sql stable security definer set search_path='' as $$
        select writable from public.tenants where id=t
      $$;
    `)
    const assignment = await readFile(
      new URL('../supabase/migrations/20261112115459_team_visit_permissions.sql', import.meta.url),
      'utf8',
    )
    const boundary = assignment.indexOf('alter policy service_visits_select')
    expect(boundary).toBeGreaterThan(0)
    await db.exec(assignment.slice(0, boundary))
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20261128144833_visit_handoffs.sql', import.meta.url),
        'utf8',
      ),
    )
  }, 30000)

  beforeEach(async () => {
    await db.exec(
      'reset role; truncate app_private.service_visit_handoffs, public.service_visits, public.work_team_members, public.work_teams, public.memberships, public.tenants;',
    )
    await db.query(`insert into public.tenants (id) values ($1),($2)`, [tenant, otherTenant])
    await db.query(
      `
      insert into public.memberships values ($1,$3,'technician'),($1,$4,'user'),
        ($1,$5,'user'),($2,$6,'admin'),($1,$7,'admin'),($1,$8,'user');
    `,
      [tenant, otherTenant, person, replacement, laterWorker, outsider, office, teamWorker],
    )
    await db.query('insert into public.work_teams values ($1,$2,null)', [team, tenant])
    await db.query('insert into public.work_team_members values ($1,$2,$3)', [
      tenant,
      team,
      teamWorker,
    ])
    const visits = [
      [source, tenant, client, site, null, null, null, null, null, person, 'in_progress', -120],
      [first, tenant, client, site, null, null, null, null, team, replacement, 'scheduled', 30],
      [next, tenant, client, site, null, null, null, null, null, laterWorker, 'scheduled', 90],
      [
        wrongSite,
        tenant,
        client,
        id(6),
        null,
        null,
        null,
        null,
        null,
        replacement,
        'scheduled',
        10,
      ],
      [
        wrongAsset,
        tenant,
        client,
        site,
        id(7),
        null,
        null,
        null,
        null,
        replacement,
        'scheduled',
        15,
      ],
      [
        wrongContract,
        tenant,
        client,
        site,
        null,
        null,
        id(8),
        id(9),
        null,
        replacement,
        'scheduled',
        20,
      ],
      [
        wrongWork,
        tenant,
        client,
        site,
        null,
        id(10),
        null,
        null,
        null,
        replacement,
        'scheduled',
        22,
      ],
      [unassigned, tenant, client, site, null, null, null, null, null, null, 'scheduled', 25],
      [other, otherTenant, id(4), id(6), null, null, null, null, null, outsider, 'scheduled', 30],
    ]
    for (const visit of visits) {
      await db.query(
        `insert into public.service_visits(id,tenant_id,client_id,location_id,asset_id,
        work_order_id,contract_id,contract_rule_id,work_team_id,assigned_user_id,status,
        scheduled_start_at,scheduled_end_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        now()+make_interval(mins=>$12),now()+make_interval(mins=>$12+25))`,
        visit,
      )
    }
    await db.exec('set role authenticated')
    await identity(anonymous)
  })

  afterAll(async () => db.close())

  it('carries only the consciously entered title and only to the globally earliest matching scope', async () => {
    await identity(person)
    const handoff = await create()
    expect((await read(source)).outgoing).toEqual([
      { id: handoff, title: 'Revisar presión', status: 'pending' },
    ])
    await identity(replacement)
    expect((await read(first)).incoming).toEqual([])
    await closeSource()
    const target = await read(first)
    expect(target.incoming).toEqual([{ id: handoff, title: 'Revisar presión', status: 'pending' }])
    expect(target.can_resolve).toBe(false)
    expect(JSON.stringify(target)).not.toMatch(/NOTA PRIVADA|source_visit_id|created_by/)
    for (const excluded of [wrongSite, wrongAsset, wrongContract, wrongWork]) {
      expect((await read(excluded)).incoming).toEqual([])
    }
    await identity(laterWorker)
    expect((await read(next)).incoming).toEqual([])
    await expect(resolve(next, handoff)).rejects.toEqual(rpcError('42501'))
    await identity(teamWorker)
    await expect(read(first)).rejects.toEqual(rpcError('42501'))
    await expect(create(first)).rejects.toEqual(rpcError('42501'))
    await identity(outsider)
    expect((await read(other, otherTenant)).incoming).toEqual([])
    await expect(resolve(other, handoff, id(301), otherTenant)).rejects.toEqual(rpcError('42501'))
    await expect(read(first)).rejects.toEqual(rpcError('42501'))
    await expect(db.query('select * from app_private.service_visit_handoffs')).rejects.toEqual(
      rpcError('42501'),
    )
    await db.exec('reset role; set role anon')
    await expect(read(first)).rejects.toEqual(rpcError('42501'))
    await db.exec('reset role; set role service_role')
    await expect(read(first)).rejects.toEqual(rpcError('42501'))
    await expect(db.query('select * from app_private.service_visit_handoffs')).rejects.toEqual(
      rpcError('42501'),
    )
  })

  it('fails closed on unauthenticated, missing and null scopes or plans without broad schema access', async () => {
    await expect(read(source)).rejects.toEqual(rpcError('42501'))
    await identity(person)
    await expect(read(source, null)).rejects.toEqual(rpcError('22023'))
    await expect(read(null)).rejects.toEqual(rpcError('22023'))
    await expect(read(source, id(999))).rejects.toEqual(rpcError('42501'))
    await expect(create(source, 'Válido', id(100), null)).rejects.toEqual(rpcError('22023'))
    await expect(create(null)).rejects.toEqual(rpcError('22023'))
    await expect(create(source, 'Válido', null)).rejects.toEqual(rpcError('22023'))
    await expect(create(source, 'Válido', id(100), id(999))).rejects.toEqual(rpcError('42501'))
    await expect(resolve(null, id(150))).rejects.toEqual(rpcError('22023'))
    await expect(resolve(source, null)).rejects.toEqual(rpcError('22023'))
    await expect(resolve(source, id(150), null)).rejects.toEqual(rpcError('22023'))
    await expect(resolve(source, id(150), id(100), null)).rejects.toEqual(rpcError('22023'))
    await expect(resolve(source, id(150), id(100), id(999))).rejects.toEqual(rpcError('42501'))
    expect(
      (await db.query("select has_schema_privilege('app_private','usage') as allowed")).rows,
    ).toEqual([{ allowed: false }])
    await expect(
      db.query('select app_private.list_service_visit_handoffs($1,$2)', [tenant, source]),
    ).rejects.toEqual(rpcError('42501'))

    for (const disabled of [false, null]) {
      await maintenance('update public.tenants set writable=$1 where id=$2', [disabled, tenant])
      expect((await read(source)).can_create).toBe(false)
      expect((await read(source)).can_resolve).toBe(false)
      await expect(create()).rejects.toEqual(rpcError('P0402'))
      await expect(resolve(source, id(150))).rejects.toEqual(rpcError('P0402'))
    }
    await db.exec('reset role; set role anon')
    await expect(read(source)).rejects.toEqual(rpcError('42501'))
    await expect(create()).rejects.toEqual(rpcError('42501'))
    await expect(resolve(source, id(150))).rejects.toEqual(rpcError('42501'))
  })

  it('reflows on replan/cancellation/omit, without duplicating overdue or unassigned occurrences', async () => {
    await identity(person)
    const handoff = await create()
    await closeSource()
    await identity(replacement)
    expect((await read(first)).incoming.map(({ id: row }) => row)).toEqual([handoff])
    await maintenance(
      "update public.service_visits set scheduled_start_at=now()+interval '3 hours', scheduled_end_at=now()+interval '4 hours' where id=$1",
      [first],
    )
    expect((await read(first)).incoming).toEqual([])
    await identity(laterWorker)
    expect((await read(next)).incoming.map(({ id: row }) => row)).toEqual([handoff])
    await maintenance("update public.service_visits set status='skipped' where id=$1", [next])
    expect((await read(next)).incoming).toEqual([])
    await identity(replacement)
    expect((await read(first)).incoming.map(({ id: row }) => row)).toEqual([handoff])
    await maintenance("update public.service_visits set status='canceled' where id=$1", [first])
    expect((await read(first)).incoming).toEqual([])
    await identity(person)
    expect((await read(source)).outgoing.map(({ id: row }) => row)).toEqual([handoff])
    // A new appropriate visit recovers the pending item after the rest changed.
    await maintenance('update public.service_visits set assigned_user_id=$1 where id=$2', [
      person,
      unassigned,
    ])
    expect((await read(unassigned)).incoming.map(({ id: row }) => row)).toEqual([handoff])
  })

  it('keeps an omitted source internal and does not forward a missed scheduled target', async () => {
    await identity(person)
    const handoff = await create()
    await maintenance("update public.service_visits set status='skipped' where id=$1", [source])
    expect((await read(source)).outgoing[0]?.status).toBe('not_forwarded')
    await identity(replacement)
    expect((await read(first)).incoming).toEqual([])
    // Simulate a handoff old enough for the first planned target to have elapsed.
    await maintenance(
      "update app_private.service_visit_handoffs set created_at=now()-interval '90 minutes' where id=$1",
      [handoff],
    )
    await maintenance(
      "update public.service_visits set status='completed', actual_end_at=now()-interval '80 minutes' where id=$1",
      [source],
    )
    await maintenance(
      "update public.service_visits set scheduled_start_at=now()-interval '70 minutes', scheduled_end_at=now()-interval '45 minutes' where id=$1",
      [first],
    )
    expect((await read(first)).incoming).toEqual([])
    await identity(laterWorker)
    expect((await read(next)).incoming[0]?.id).toBe(handoff)
  })

  it('preserves operation IDs and deduplicates repeat requests and case/whitespace equivalents', async () => {
    await identity(person)
    const [a, b, c] = await Promise.all([
      create(source, 'Revisar presión', id(91)),
      create(source, 'Revisar presión', id(91)),
      create(source, '  REVISAR\n PRESIÓN  ', id(92)),
    ])
    expect(new Set([a, b, c])).toHaveProperty('size', 1)
    expect((await read(source)).outgoing).toHaveLength(1)
    await expect(create(source, 'Distinta', id(91))).rejects.toEqual(rpcError('23505'))
    await expect(create(source, '\n\t  ', id(95))).rejects.toEqual(rpcError('22023'))
    await expect(create(source, 'x'.repeat(161), id(96))).rejects.toEqual(rpcError('22023'))
  })

  it('does not clone a pending item already carried to the current visit', async () => {
    await identity(person)
    const handoff = await create()
    await closeSource()
    await identity(replacement)
    expect(await create(first, 'REVISAR PRESIÓN', id(119))).toBe(handoff)
    expect((await read(first)).outgoing).toEqual([])
    await maintenance("update public.service_visits set status='completed' where id=$1", [first])
    await identity(laterWorker)
    expect((await read(next)).incoming.map(({ id: row }) => row)).toEqual([handoff])
  })

  it('only resolves once with a current in-progress assignee and never carries resolved work again', async () => {
    await identity(person)
    const handoff = await create()
    await closeSource()
    await identity(replacement)
    await expect(resolve(first, handoff)).rejects.toEqual(rpcError('P0409'))
    // Removing direct assignment activates the team; the former direct assignee loses access.
    await maintenance(
      "update public.service_visits set status='in_progress', assigned_user_id=null where id=$1",
      [first],
    )
    await expect(read(first)).rejects.toEqual(rpcError('42501'))
    await expect(resolve(first, handoff)).rejects.toEqual(rpcError('42501'))
    await identity(teamWorker)
    expect((await read(first)).can_resolve).toBe(true)
    await maintenance('update public.tenants set writable=false where id=$1', [tenant])
    await expect(resolve(first, handoff)).rejects.toEqual(rpcError('P0402'))
    await maintenance('update public.tenants set writable=true where id=$1', [tenant])
    expect(
      await Promise.all([
        resolve(first, handoff),
        resolve(first, handoff),
        resolve(first, handoff, id(201)),
      ]),
    ).toEqual([handoff, handoff, handoff])
    await maintenance("update public.service_visits set status='completed' where id=$1", [first])
    expect((await read(first)).incoming[0]?.status).toBe('resolved')
    await identity(laterWorker)
    expect((await read(next)).incoming).toEqual([])
    await expect(resolve(next, handoff)).rejects.toEqual(rpcError('42501'))
    await identity(office)
    expect((await read(source)).outgoing[0]?.status).toBe('resolved')
  })

  it('never broadens a locationless visit to the client; work and contract scope must match', async () => {
    await identity(person)
    await maintenance('update public.service_visits set location_id=null where id=$1', [source])
    expect((await read(source)).has_scope).toBe(false)
    await expect(create()).rejects.toEqual(rpcError('P0409'))
    await maintenance(
      'update public.service_visits set location_id=null, work_order_id=$1 where id in ($2,$3)',
      [id(10), source, first],
    )
    const handoff = await create()
    await closeSource()
    await identity(replacement)
    expect((await read(first)).incoming[0]?.id).toBe(handoff)
    expect((await read(wrongWork)).incoming).toEqual([])
    await identity(laterWorker)
    expect((await read(next)).incoming).toEqual([])
  })
})
