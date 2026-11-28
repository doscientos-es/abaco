import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const id = (value: number) => `ab580000-0000-4000-8000-${String(value).padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const administrator = id(3)
const technician = id(4)
const colleague = id(5)
const editor = id(6)
const foreignAdmin = id(7)
const location = id(11)
const foreignLocation = id(12)
const team = id(13)
const direct = id(21)
const sharedTeam = id(22)
const individualPrecedence = id(23)
const closed = id(24)
const canceled = id(25)
const foreign = id(26)
const dayVisits = [direct, sharedTeam, individualPrecedence, closed, canceled, foreign]

describe('worker arrival publishing boundary', () => {
  const db = new PGlite()
  const setUser = (user: string) =>
    db.query("select set_config('request.user_id', $1, false)", [user])
  const fetchArrival = (ids = dayVisits, company = tenant) =>
    db.query(
      'select * from public.list_assigned_visit_arrivals($1, $2::uuid[]) order by visit_id',
      [company, ids],
    )
  const table = 'public.service_location_staff_arrival'

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; grant usage on schema auth to authenticated;
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
        select coalesce((select t.writable from public.tenant_fixture t where t.id = p_tenant), false)
      $$;
      create function public.touch_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at := now(); return new; end $$;
      create table public.service_locations (
        id uuid, tenant_id uuid, active boolean not null, access_notes text not null,
        operational_contact text not null, primary key(id, tenant_id)
      );
      create table public.service_visits (
        id uuid primary key, tenant_id uuid, location_id uuid, status text,
        assigned_user_id uuid, work_team_id uuid
      );
      create table public.work_team_members(tenant_id uuid, team_id uuid, user_id uuid);
    `)
    const teams = await readFile(
      new URL('../supabase/migrations/20261112115459_team_visit_permissions.sql', import.meta.url),
      'utf8',
    )
    const nextStatement = teams.indexOf('alter policy service_visits_select')
    if (nextStatement < 0) throw new Error('No se pudo cargar el predicado real de asignación.')
    await db.exec(teams.slice(0, nextStatement))
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261128142211_service_location_staff_arrival.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.query(
      `
      insert into public.memberships values
      ($1, $3, 'admin'), ($1, $4, 'user'), ($1, $5, 'technician'), ($1, $6, 'editor'), ($2, $7, 'admin')
    `,
      [tenant, otherTenant, administrator, technician, colleague, editor, foreignAdmin],
    )
    await db.query('insert into public.tenant_fixture values ($1, true), ($2, true)', [
      tenant,
      otherTenant,
    ])
    await db.query(
      `insert into public.service_locations values
      ($2, $1, true, 'Claves de oficina', 'Contacto interno'), ($4, $3, true, 'Secreto ajeno', 'Contacto ajeno')`,
      [tenant, location, otherTenant, foreignLocation],
    )
    await db.query('insert into public.work_team_members values ($1, $2, $3)', [
      tenant,
      team,
      technician,
    ])
    await db.query(
      `
      insert into public.service_visits values
      ($1, $7, $9, 'scheduled', $11, null), ($2, $7, $9, 'in_progress', null, $13),
      ($3, $7, $9, 'scheduled', $12, $13), ($4, $7, $9, 'completed', $11, null),
      ($5, $7, $9, 'canceled', $11, null), ($6, $8, $10, 'scheduled', $11, null)
    `,
      [
        direct,
        sharedTeam,
        individualPrecedence,
        closed,
        canceled,
        foreign,
        tenant,
        otherTenant,
        location,
        foreignLocation,
        technician,
        colleague,
        team,
      ],
    )
    await db.exec('set role authenticated')
  }, 30_000)
  afterAll(async () => db.close())

  it('keeps office records initially empty and opt-in drafts invisible to workers', async () => {
    await setUser(administrator)
    expect((await db.query(`select * from ${table}`)).rows).toEqual([])
    await db.query(
      `insert into ${table} (tenant_id, location_id, instructions, parking, contact_label, contact_phone)
      values ($1, $2, 'Entrada recepción', 'Plaza visita', 'Recepción', '+34612345678')`,
      [tenant, location],
    )
    expect((await db.query(`select share_directions, share_contact from ${table}`)).rows).toEqual([
      { share_directions: false, share_contact: false },
    ])
    await setUser(technician)
    expect((await db.query(`select * from ${table}`)).rows).toEqual([])
    expect((await fetchArrival()).rows).toEqual([])
    await expect(
      db.query(`insert into ${table} (tenant_id, location_id) values ($1, $2)`, [tenant, location]),
    ).rejects.toMatchObject({ code: '42501' })
    expect(
      (await db.query(`update ${table} set share_directions = true returning instructions`)).rows,
    ).toEqual([])
  })

  it('returns only published fields to current, assigned, open visits and honors individual precedence', async () => {
    await setUser(editor)
    await db.query(`update ${table} set share_directions = true where location_id = $1`, [location])
    await setUser(technician)
    const shared = {
      instructions: 'Entrada recepción',
      parking: 'Plaza visita',
      contact_label: null,
      contact_phone: null,
    }
    expect((await fetchArrival()).rows).toEqual([
      { visit_id: direct, ...shared },
      { visit_id: sharedTeam, ...shared },
    ])
    expect((await fetchArrival([direct, direct])).rows).toHaveLength(1)
    await expect(fetchArrival([foreign], otherTenant)).rejects.toMatchObject({ code: '42501' })
    expect((await fetchArrival([foreign])).rows).toEqual([])
    await setUser(colleague)
    expect((await fetchArrival()).rows).toEqual([{ visit_id: individualPrecedence, ...shared }])
    await setUser(foreignAdmin)
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0)
  })

  it('requires a work-number format and independently unpublishes either category', async () => {
    await setUser(administrator)
    await expect(
      db.query(`update ${table} set contact_phone = 'tel:unapproved'`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      db.query(`update ${table} set instructions = repeat('a', 601)`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      db.query(`update ${table} set contact_phone = '', share_contact = true`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      db.query(`update ${table} set tenant_id = $1`, [otherTenant]),
    ).rejects.toMatchObject({ code: '42501' })
    await db.query(`update ${table} set share_contact = true, share_directions = false`)
    await setUser(technician)
    expect((await fetchArrival([direct])).rows).toEqual([
      {
        visit_id: direct,
        instructions: null,
        parking: null,
        contact_label: 'Recepción',
        contact_phone: '+34612345678',
      },
    ])
    await setUser(administrator)
    await db.query(`update ${table} set share_contact = false`)
    await setUser(technician)
    expect((await fetchArrival([direct])).rows).toEqual([])
  })

  it('checks current assignment, active center and visit lifecycle at each read', async () => {
    await setUser(administrator)
    await db.query(`update ${table} set share_directions = true`)
    await setUser(technician)
    expect((await fetchArrival([direct, sharedTeam])).rows).toHaveLength(2)
    await db.exec('reset role')
    await db.query('update public.service_visits set assigned_user_id = $1 where id = $2', [
      colleague,
      direct,
    ])
    await db.query("update public.service_visits set status = 'completed' where id = $1", [
      sharedTeam,
    ])
    await db.exec('set role authenticated')
    expect((await fetchArrival([direct, sharedTeam])).rows).toEqual([])
    await db.exec('reset role')
    await db.query('update public.service_locations set active = false where id = $1', [location])
    await db.exec('set role authenticated')
    await setUser(colleague)
    expect((await fetchArrival([direct])).rows).toEqual([])
  })

  it('denies anon/missing identity and limits each RPC to a bounded list', async () => {
    await db.exec('set role anon')
    await expect(fetchArrival([direct])).rejects.toMatchObject({ code: '42501' })
    await db.exec('set role authenticated')
    await setUser('')
    await expect(fetchArrival([direct])).rejects.toMatchObject({ code: '42501' })
    await setUser(technician)
    await expect(fetchArrival(Array.from({ length: 51 }, () => direct))).rejects.toMatchObject({
      code: '22023',
    })
    await expect(
      db.query('select * from public.list_assigned_visit_arrivals(null, $1::uuid[])', [[direct]]),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('prevents office edits when the tenant cannot write', async () => {
    await db.exec('reset role')
    await db.query('update public.tenant_fixture set writable = false where id = $1', [tenant])
    await db.exec('set role authenticated')
    await setUser(administrator)
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1)
    expect(
      (await db.query(`update ${table} set share_directions = false returning updated_at`)).rows,
    ).toEqual([])
  })
})
