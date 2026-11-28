import { readFileSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

function migrationFile(name: string) {
  return readFileSync(new URL(`../../../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

const migration = migrationFile('20261128144107_worker_agenda_change_notices.sql')
const access = migrationFile('20261112115459_team_visit_permissions.sql').split(
  'alter policy service_visits_select',
)[0]

const id = (last: number) => `00000000-0000-4000-8000-${String(last).padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const direct = id(10)
const teamMember = id(11)
const otherMember = id(12)
const outsider = id(13)
const administrator = id(14)
const team = id(21)
const visit = id(26)
const otherVisit = id(27)

let db: PGlite

async function authAs(actor: string, action: () => Promise<void>, role = 'authenticated') {
  await db.exec(`set role ${role}; set request.jwt.claim.sub = '${actor}';`)
  try {
    await action()
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub;')
  }
}

type Notice = {
  id: string
  visit_id: string
  visit_title: string
  change_kind: string
  before_start_at: Date | null
  before_timezone: string | null
  after_start_at: Date | null
  after_timezone: string | null
  seen_at: Date | null
}

async function list(company = tenant) {
  const { rows } = await db.query<Notice>(
    'select * from public.list_my_visit_agenda_change_notices($1::uuid)',
    [company],
  )
  return rows
}

async function seen(changeId: string, company = tenant) {
  const { rows } = await db.query<{ timestamp: Date | null }>(
    'select public.mark_my_visit_agenda_change_seen($1::uuid,$2::uuid) as timestamp',
    [company, changeId],
  )
  return rows[0]?.timestamp
}

describe('agenda notice access and confirmation', () => {
  beforeEach(async () => {
    db = new PGlite()
    // Minimal stand-in for project schema. The actual assignment predicate and migration run unchanged.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      revoke all on schema app_private from public,anon,authenticated,service_role;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable
        as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create type public.app_role as enum ('owner','admin','editor','technician','user');
      create table public.memberships (tenant_id uuid, user_id uuid, role public.app_role,
        primary key(tenant_id,user_id));
      create function public.has_role(p_tenant_id uuid, p_roles public.app_role[])
      returns boolean language sql stable as $$
        select exists(select 1 from public.memberships
        where tenant_id=p_tenant_id and user_id=auth.uid() and role=any(p_roles))
      $$;
      create table public.work_team_members (tenant_id uuid, team_id uuid, user_id uuid,
        primary key(tenant_id,team_id,user_id));
      create table public.service_locations (id uuid primary key, tenant_id uuid, timezone text);
      create table public.service_visits (
        id uuid primary key, tenant_id uuid, title text, status text, assigned_user_id uuid,
        work_team_id uuid, location_id uuid, scheduled_start_at timestamptz, scheduled_end_at timestamptz,
        route_order int default 0, address text default 'Dirección privada', notes text default 'Nota privada',
        unique(id,tenant_id)
      );
      create table public.service_visit_events (payload jsonb);
      insert into public.service_visit_events values ('{"reason":"Motivo privado","startLatitude":12}');
      ${access}
      ${migration}
      insert into auth.users values ('${direct}'),('${teamMember}'),('${otherMember}'),
        ('${outsider}'),('${administrator}');
      insert into public.memberships values
        ('${tenant}','${direct}','user'),('${tenant}','${teamMember}','technician'),
        ('${tenant}','${otherMember}','user'),('${tenant}','${administrator}','admin'),
        ('${otherTenant}','${outsider}','user');
      insert into public.work_team_members values
        ('${tenant}','${team}','${teamMember}'),('${tenant}','${team}','${otherMember}');
      insert into public.service_visits (id,tenant_id,title,status,assigned_user_id,work_team_id,
        scheduled_start_at,scheduled_end_at) values
        ('${visit}','${tenant}','Visita privada','scheduled','${direct}','${team}',
         '2026-11-29 08:00+00','2026-11-29 09:00+00'),
        ('${otherVisit}','${otherTenant}','Otra empresa','scheduled','${outsider}',null,
         '2026-11-29 10:00+00','2026-11-29 11:00+00');
    `)
  }, 20_000)

  afterEach(async () => db?.close())

  it('dedupes no-op writes and gives direct assignment precedence; the projection contains no audit data', async () => {
    await db.exec(`
      update public.service_visits set route_order=2 where id='${visit}';
      update public.service_visits set status='in_progress' where id='${visit}';
      update public.service_visits set status='scheduled' where id='${visit}';
    `)
    await authAs(direct, async () => {
      expect(await list()).toHaveLength(0)
    })
    await db.exec(`
      update public.service_visits set scheduled_start_at='2026-11-29 12:00+00',
        scheduled_end_at='2026-11-29 13:00+00' where id='${visit}';
      update public.service_visits set scheduled_start_at='2026-11-29 12:00+00'
        where id='${visit}';
    `)
    let change = ''
    await authAs(direct, async () => {
      const rows = await list()
      expect(rows).toHaveLength(1)
      const notice = rows[0]
      expect(notice).toMatchObject({
        visit_id: visit,
        visit_title: 'Visita privada',
        change_kind: 'rescheduled',
        before_start_at: new Date('2026-11-29T08:00:00.000Z'),
        after_start_at: new Date('2026-11-29T12:00:00.000Z'),
        before_timezone: 'Europe/Madrid',
        seen_at: null,
      })
      expect(Object.keys(notice ?? {}).sort()).toEqual([
        'after_end_at',
        'after_start_at',
        'after_timezone',
        'before_end_at',
        'before_start_at',
        'before_timezone',
        'change_kind',
        'changed_at',
        'id',
        'seen_at',
        'visit_id',
        'visit_title',
      ])
      change = notice?.id ?? ''
      expect(await list(otherTenant)).toHaveLength(0)
      expect(await seen(change, otherTenant)).toBeNull()
      expect((await list())[0]?.seen_at).toBeNull()
      const confirmation = await seen(change)
      expect(confirmation).toBeInstanceOf(Date)
      expect(await seen(change)).toEqual(confirmation)
      expect((await list())[0]?.seen_at).toEqual(confirmation)
    })
    for (const actor of [teamMember, outsider, administrator]) {
      await authAs(actor, async () => {
        expect(await list()).toHaveLength(0)
        expect(await seen(change)).toBeNull()
      })
    }
    await authAs(
      '',
      async () => {
        await expect(list()).rejects.toMatchObject({ code: '42501' })
        await expect(seen(change)).rejects.toMatchObject({ code: '42501' })
      },
      'anon',
    )
    const permissions = await db.query<{ usage: boolean; table: boolean }>(`
      select has_schema_privilege('authenticated','app_private','usage') as usage,
      has_table_privilege('authenticated','app_private.visit_agenda_change_notices','select') as "table";
    `)
    expect(permissions.rows).toEqual([{ usage: false, table: false }])
  })

  it('snapshots recipients, does not show the prior schedule to newly assigned staff, and respects revocation', async () => {
    await db.exec(`update public.service_visits set scheduled_start_at='2026-11-29 12:00+00',
      scheduled_end_at='2026-11-29 13:00+00' where id='${visit}';`)
    let oldId = ''
    await authAs(direct, async () => {
      oldId = (await list())[0]?.id ?? ''
    })
    await db.exec(`
      update public.service_visits set assigned_user_id=null, scheduled_start_at='2026-11-30 12:00+00',
        scheduled_end_at='2026-11-30 13:00+00' where id='${visit}';
    `)
    await authAs(direct, async () => {
      expect(await list()).toHaveLength(0)
      expect(await seen(oldId)).toBeNull()
    })
    let teamNoticeId = ''
    let confirmation: Date | null | undefined
    await authAs(teamMember, async () => {
      const rows = await list()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        change_kind: 'assigned',
        before_start_at: null,
        before_timezone: null,
        after_start_at: new Date('2026-11-30T12:00:00.000Z'),
        seen_at: null,
      })
      expect(await seen(oldId)).toBeNull()
      teamNoticeId = rows[0]?.id ?? ''
      confirmation = await seen(teamNoticeId)
      expect(confirmation).toBeInstanceOf(Date)
    })
    await authAs(otherMember, async () => {
      expect((await list())[0]).toMatchObject({ id: teamNoticeId, seen_at: null })
    })
    await db.exec(`
      update public.service_visits set status='skipped' where id='${visit}';
    `)
    await authAs(teamMember, async () => {
      expect((await list())[0]).toMatchObject({
        change_kind: 'skipped',
        before_start_at: new Date('2026-11-30T12:00:00.000Z'),
        after_start_at: null,
        after_timezone: null,
        seen_at: null,
      })
    })
    await db.exec(`
      delete from public.work_team_members where tenant_id='${tenant}' and user_id='${teamMember}';
      update public.memberships set role='admin' where tenant_id='${tenant}' and user_id='${otherMember}';
    `)
    for (const actor of [teamMember, otherMember]) {
      await authAs(actor, async () => {
        expect(await list()).toHaveLength(0)
        expect(await seen(teamNoticeId)).toBeNull()
      })
    }
  })
})
