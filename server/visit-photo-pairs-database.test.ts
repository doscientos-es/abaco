import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const id = (value: number) => `ab620000-0000-4000-8000-${String(value).padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const admin = id(3)
const worker = id(4)
const outsider = id(5)
const teamVisit = id(10)
const otherVisit = id(11)
const foreignVisit = id(12)
const team = id(19)
const before = id(21)
const after = id(22)
const afterSecond = id(23)
const beforeSecond = id(24)
const otherPhase = id(25)
const otherVisitPhoto = id(26)
const foreignAfter = id(27)

describe('visit photo pairing boundary', () => {
  const db = new PGlite()
  const actor = (user: string) =>
    db.query("select set_config('request.user_id', $1, false)", [user])
  const pair = (a: string, b: string, paired = true, company = tenant, visit = teamVisit) =>
    db.query('select public.set_service_visit_photo_pair($1, $2, $3, $4, $5)', [
      company,
      visit,
      a,
      b,
      paired,
    ])
  const listing = () =>
    db.query(
      'select before_photo_id, after_photo_id from public.service_visit_photo_pairs order by before_photo_id',
    )

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create schema app_private;
      revoke all on schema app_private from public, anon, authenticated;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.user_id', true), '')::uuid
      $$;
      create type public.app_role as enum ('owner','admin','editor','viewer','technician','user');
      create table public.memberships(tenant_id uuid, user_id uuid, role public.app_role);
      create table public.tenant_fixture(id uuid primary key, writable boolean);
      create function public.has_role(p_tenant uuid, p_allowed public.app_role[])
      returns boolean language sql stable security definer set search_path = '' as $$
        select exists (
          select 1 from public.memberships m where m.tenant_id = p_tenant
            and m.user_id = auth.uid() and m.role = any(p_allowed)
        )
      $$;
      create function public.tenant_can_write(p_tenant uuid) returns boolean
      language sql stable security definer set search_path = '' as $$
        select t.writable from public.tenant_fixture t where t.id = p_tenant
      $$;
      create table public.service_visits (
        id uuid primary key, tenant_id uuid, status text,
        assigned_user_id uuid, work_team_id uuid, unique(id, tenant_id)
      );
      create table public.work_team_members(tenant_id uuid, team_id uuid, user_id uuid);
      create table public.service_visit_photos(
        id uuid primary key, tenant_id uuid, visit_id uuid, phase text,
        caption text, storage_path text, unique(id, tenant_id, visit_id)
      );
    `)
    const teams = await readFile(
      new URL('../supabase/migrations/20261112115459_team_visit_permissions.sql', import.meta.url),
      'utf8',
    )
    const ending = teams.indexOf('alter policy service_visits_select')
    if (ending < 0) throw new Error('No se pudo cargar el predicado real de asignación.')
    await db.exec(teams.slice(0, ending))
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261128143507_service_visit_photo_pairs.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query(
      `insert into public.memberships values
      ($1, $3, 'admin'), ($1, $4, 'user'), ($1, $5, 'technician'), ($2, $5, 'user')`,
      [tenant, otherTenant, admin, worker, outsider],
    )
    await db.query('insert into public.tenant_fixture values ($1, true), ($2, true)', [
      tenant,
      otherTenant,
    ])
    await db.query('insert into public.work_team_members values ($1, $2, $3)', [
      tenant,
      team,
      worker,
    ])
    await db.query(
      `insert into public.service_visits values
      ($1, $4, 'in_progress', null, $6), ($2, $4, 'scheduled', $7, $6), ($3, $5, 'scheduled', $7, null)`,
      [teamVisit, otherVisit, foreignVisit, tenant, otherTenant, team, outsider],
    )
    await db.query(
      `insert into public.service_visit_photos values
      ($1, $8, $10, 'before', 'Caption-fixture', 'private/before'),
      ($2, $8, $10, 'after', 'Caption-fixture', 'private/after'),
      ($3, $8, $10, 'after', 'Caption-fixture', 'private/after-2'),
      ($4, $8, $10, 'before', 'Caption-fixture', 'private/before-2'),
      ($5, $8, $10, 'other', 'Caption-fixture', 'private/other'),
      ($6, $8, $11, 'after', 'Caption-fixture', 'private/other-visit'),
      ($7, $9, $12, 'after', 'Caption-fixture', 'private/foreign')`,
      [
        before,
        after,
        afterSecond,
        beforeSecond,
        otherPhase,
        otherVisitPhoto,
        foreignAfter,
        tenant,
        otherTenant,
        teamVisit,
        otherVisit,
        foreignVisit,
      ],
    )
    await db.exec('set role authenticated')
  }, 30_000)
  afterAll(() => db.close())

  it('registers a pair exactly once without modifying the evidence rows', async () => {
    await actor(worker)
    expect((await listing()).rows).toEqual([])
    expect(
      (
        await db.query(
          "select has_schema_privilege(current_user, 'app_private', 'USAGE') as allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }])
    await expect(
      db.query('select app_private.set_service_visit_photo_pair($1, $2, $3, $4, $5)', [
        tenant,
        teamVisit,
        before,
        after,
        true,
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    await pair(before, after)
    await pair(before, after)
    expect((await listing()).rows).toEqual([{ before_photo_id: before, after_photo_id: after }])
    await expect(
      db.query('select created_by from public.service_visit_photo_pairs'),
    ).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
    expect(
      (
        await db.query(
          'select id, caption, storage_path from public.service_visit_photos where id = $1',
          [before],
        )
      ).rows,
    ).toEqual([{ id: before, caption: 'Caption-fixture', storage_path: 'private/before' }])
    await db.exec('set role authenticated')
  })

  it('rejects reversed, other-phase, cross-visit/cross-company, same-photo and duplicated sides', async () => {
    await actor(worker)
    for (const selection of [
      [after, before],
      [before, otherPhase],
      [before, otherVisitPhoto],
      [before, foreignAfter],
      [before, before],
    ] as const) {
      await expect(pair(...selection)).rejects.toMatchObject({ code: '22023' })
    }
    await expect(pair(before, afterSecond)).rejects.toMatchObject({ code: 'P0409' })
    await expect(pair(beforeSecond, after)).rejects.toMatchObject({ code: 'P0409' })
  })

  it('enforces read and write isolation, including direct inserts and anonymous RPC', async () => {
    await actor(outsider)
    expect((await listing()).rows).toEqual([])
    await expect(pair(before, after)).rejects.toMatchObject({ code: '42501' })
    await expect(pair(before, foreignAfter, true, otherTenant, teamVisit)).rejects.toMatchObject({
      code: '42501',
    })
    await actor(worker)
    await expect(
      db.query('insert into public.service_visit_photo_pairs(tenant_id) values ($1)', [tenant]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('delete from public.service_visit_photo_pairs')).rejects.toMatchObject({
      code: '42501',
    })
    await db.exec('set role anon')
    await expect(pair(before, after)).rejects.toMatchObject({ code: '42501' })
    await db.exec('set role authenticated')
  })

  it('unlinks only the expected pair, safely repeats and keeps photos unchanged', async () => {
    await actor(admin)
    await pair(before, after, false)
    await pair(before, after, false)
    await pair(before, afterSecond)
    await pair(before, after, false)
    expect((await listing()).rows).toEqual([
      { before_photo_id: before, after_photo_id: afterSecond },
    ])
  })

  it('fails closed before taking the visit lock when both permission gates are unknown', async () => {
    await db.exec(`
      begin; reset role;
      create or replace function public.has_role(p_tenant uuid, p_allowed public.app_role[])
      returns boolean language sql stable security definer set search_path = '' as $$ select null::boolean $$;
      create or replace function public.can_access_assigned_visit(p_tenant_id uuid, p_visit_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $$ select null::boolean $$;
      set role authenticated;
    `)
    try {
      await actor(worker)
      expect((await listing()).rows).toEqual([])
      await expect(pair(before, afterSecond, false)).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('rollback')
    }
  })

  it('does not trust a pre-lock permission that becomes unknown before mutation', async () => {
    await db.exec(`
      begin; reset role;
      create or replace function public.has_role(p_tenant uuid, p_allowed public.app_role[])
      returns boolean language plpgsql volatile security definer set search_path = '' as $$
      begin
        if nullif(pg_catalog.current_setting('request.photo_pair_office_checked', true), '') is null then
          perform pg_catalog.set_config('request.photo_pair_office_checked', 'yes', true);
          return true;
        end if;
        return null;
      end;
      $$;
      create or replace function public.can_access_assigned_visit(p_tenant_id uuid, p_visit_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $$ select null::boolean $$;
      set role authenticated;
    `)
    try {
      await actor(worker)
      await expect(pair(before, afterSecond, false)).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('rollback')
    }
  })

  it('does not mutate for an unknown tenant plan', async () => {
    await db.exec('begin; reset role')
    try {
      await db.query('update public.tenant_fixture set writable = null where id = $1', [tenant])
      await db.exec('set role authenticated')
      await actor(worker)
      await expect(pair(before, afterSecond, false)).rejects.toMatchObject({ code: 'P0409' })
    } finally {
      await db.exec('rollback')
    }
  })

  it('freezes pairing after closure or plan restriction, and hides unassigned records', async () => {
    await actor(worker)
    await db.exec('reset role')
    await db.query("update public.service_visits set status = 'completed' where id = $1", [
      teamVisit,
    ])
    await db.exec('set role authenticated')
    expect((await listing()).rows).toHaveLength(1)
    await expect(pair(before, afterSecond, false)).rejects.toMatchObject({ code: 'P0409' })
    await db.exec('reset role')
    await db.query(
      "update public.service_visits set status = 'in_progress', assigned_user_id = $1 where id = $2",
      [outsider, teamVisit],
    )
    await db.query('update public.tenant_fixture set writable = false where id = $1', [tenant])
    await db.exec('set role authenticated')
    expect((await listing()).rows).toEqual([])
    await expect(pair(before, afterSecond, false)).rejects.toMatchObject({ code: '42501' })
    await actor(outsider)
    expect((await listing()).rows).toHaveLength(1)
    await expect(pair(before, afterSecond, false)).rejects.toMatchObject({ code: 'P0409' })
  })
})
