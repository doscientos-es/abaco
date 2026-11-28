import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

function migration(name: string) {
  return readFileSync(new URL(`../../../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

const sql = migration('20261128145619_visit_assignment_swap_proposals.sql')
const notices = migration('20261128145709_worker_agenda_change_notices.sql')
const assignmentAccess = migration('20261112115459_team_visit_permissions.sql').split(
  'alter policy service_visits_select',
)[0]
const calendar = migration('20261120093555_google_calendar_integration.sql')
const calendarTriggers = calendar.split('create function public.authorize_google_calendar_actor')[0]
const calendarLeaseStart = calendar.indexOf('create function public.claim_google_calendar_sync_job')
const calendarLease = calendar.slice(
  calendarLeaseStart,
  calendar.indexOf('do $$ begin', calendarLeaseStart),
)
const actualRole = migration('20261013204701_auth_roles.sql')
  .split('create function public.has_role')[1]
  ?.split('revoke all on function public.is_member')[0]
assert.ok(actualRole)
const guard = migration('20261112115631_team_visit_assignment.sql').split(
  '-- Keep assignment changes atomic',
)[0]
const id = (value: number) => `ab660000-0000-4000-8000-${String(value).padStart(12, '0')}`
const [
  tenant,
  foreign,
  worker,
  colleague,
  third,
  admin,
  outsider,
  foreignAdmin,
  team,
  visit,
  alternate,
  foreignVisit,
  blocker,
  proposal,
] = Array.from({ length: 14 }, (_, i) => id(i + 1)) as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]
const version = '2026-11-01T00:00:00+00:00'
let db: PGlite
let date: string
let start: string
let end: string

async function asWho<T>(actor: string, work: () => Promise<T>, role = 'authenticated') {
  await db.exec(
    `set role ${role}; set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = '${role}';`,
  )
  try {
    return await work()
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;')
  }
}

async function rpc<T>(expression: string, values: string[] = []) {
  return (await db.query<{ value: T }>(`select public.${expression} as value`, values)).rows[0]
    ?.value
}
const options = (company = tenant, own = visit, day = date) =>
  rpc<Record<string, unknown>[]>('list_visit_swap_options($1,$2,$3)', [company, own, day])

type Proposal = {
  id: string
  state: string
  created_at: string
  stale: boolean
  other_title: string | null
}
const list = (company = tenant) => rpc<Proposal[]>('list_visit_swap_proposals($1)', [company])
const create = (operation = proposal, own = visit, other = alternate) =>
  rpc<string>('create_visit_swap_proposal($1,$2,$3,$4,$5,$6)', [
    tenant,
    operation,
    own,
    version,
    other,
    version,
  ])
const decide = (action: string, createdAt: string, company = tenant, operation = proposal) =>
  rpc<string>('decide_visit_swap_proposal($1,$2,$3,$4)', [company, operation, createdAt, action])
const assignments = async () =>
  (
    await db.query<{
      id: string
      assigned_user_id: string
      start: string
      end: string
      work_team_id: string | null
    }>(`
  select id, assigned_user_id, scheduled_start_at::text as start,
    scheduled_end_at::text as end, work_team_id from public.service_visits
  where id in ('${visit}','${alternate}') order by id
`)
  ).rows

describe('visit assignment swap SQL', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      revoke all on schema app_private from public,anon,authenticated,service_role;
      create table auth.users (id uuid primary key);
      create function auth.role() returns text language sql stable
        as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
      create function auth.uid() returns uuid language sql stable
        as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create type public.app_role as enum ('owner','admin','editor','viewer','technician','user');
      create table public.tenants (id uuid primary key, writable bool default true);
      create table public.profiles (id uuid primary key, full_name text, email text not null default 'private@example.test');
      create table public.memberships (tenant_id uuid, user_id uuid, role public.app_role,
        primary key (tenant_id,user_id));
      create function public.has_role ${actualRole}
      create function public.tenant_can_write(p_tenant uuid) returns boolean language sql stable
        as $$select writable from public.tenants where id=p_tenant$$;
      create table public.service_locations (id uuid primary key, tenant_id uuid, timezone text,
       address text default 'Dirección privada');
      create table public.work_orders (id uuid primary key, tenant_id uuid, work_team_id uuid);
      create table public.work_teams (id uuid primary key, tenant_id uuid, archived_at timestamptz);
      create table public.work_team_members (tenant_id uuid, team_id uuid, user_id uuid,
        primary key (team_id,user_id));
      create table public.staff_schedules (tenant_id uuid, user_id uuid, slots jsonb,
        primary key(tenant_id,user_id));
      create table public.absence_requests (tenant_id uuid, requester_id uuid, status text,
        absence_type text, start_date date, end_date date);
      create table public.service_visits (
        id uuid primary key, tenant_id uuid, title text, status text, assigned_user_id uuid,
        work_team_id uuid, location_id uuid, scheduled_start_at timestamptz, scheduled_end_at timestamptz,
        updated_at timestamptz not null default '${version}', work_order_id uuid, contract_id uuid,
        contract_rule_id uuid, contract_occurrence_on date, contract_schedule_version integer,
        notes text default 'Notas privadas', paper_snapshot jsonb not null default '{}',
        unique (id,tenant_id),
        foreign key(tenant_id,assigned_user_id) references public.memberships(tenant_id,user_id)
      );
      create table public.service_contract_generation_issues (tenant_id uuid, contract_id uuid,
        rule_id uuid, occurrence_on date, schedule_version integer, kind text, detail text);
      create table public.service_visit_events (operation_id uuid unique, tenant_id uuid,
        visit_id uuid, kind text, payload jsonb, actor_id uuid);
      create function public.bump_fixture_version() returns trigger language plpgsql as $$
        begin new.updated_at := clock_timestamp(); return new; end; $$;
      create trigger bump_fixture_version before update on public.service_visits
        for each row execute function public.bump_fixture_version();
      ${guard}
      ${assignmentAccess}
      ${notices}
      ${calendarTriggers}
      ${calendarLease}
      ${sql}
      insert into public.tenants(id) values ('${tenant}'),('${foreign}');
      insert into auth.users values ('${worker}'),('${colleague}'),('${third}'),('${admin}'),('${outsider}'),('${foreignAdmin}');
      insert into public.profiles(id,full_name) values
        ('${worker}','Técnica A'),('${colleague}','Técnico B'),('${third}','Técnica C'),
        ('${admin}','Coordinadora'),('${outsider}','Otro tenant'),('${foreignAdmin}','Admin ajeno');
      insert into public.memberships values
        ('${tenant}','${worker}','user'),('${tenant}','${colleague}','technician'),
        ('${tenant}','${third}','user'),('${tenant}','${admin}','admin'),('${foreign}','${outsider}','user'),
        ('${foreign}','${foreignAdmin}','admin');
      insert into public.staff_schedules
      select m.tenant_id,m.user_id,
        (select jsonb_agg(jsonb_build_object('weekday', day, 'start', 0, 'end', 1440))
          from generate_series(1,7) day)
      from public.memberships m;
      insert into public.work_teams values ('${team}','${tenant}',null);
      insert into public.work_team_members values ('${tenant}','${team}','${worker}');
    `)
    const fixture = (
      await db.query<{ day: string; start: string; end: string }>(`
      select ((now() at time zone 'Europe/Madrid')::date + 1)::text as day,
        (((now() at time zone 'Europe/Madrid')::date + 1 + time '10:00') at time zone 'Europe/Madrid')::text as start,
        (((now() at time zone 'Europe/Madrid')::date + 1 + time '11:00') at time zone 'Europe/Madrid')::text as end
    `)
    ).rows[0]
    assert.ok(fixture)
    date = fixture.day
    start = fixture.start
    end = fixture.end
    await db.exec(`
      insert into public.service_visits (id,tenant_id,title,status,assigned_user_id,scheduled_start_at,scheduled_end_at)
      values ('${visit}','${tenant}','Servicio propio','scheduled','${worker}','${start}','${end}'),
        ('${alternate}','${tenant}','Cliente privado de B','scheduled','${colleague}','${start}','${end}'),
        ('${foreignVisit}','${foreign}','Cliente ajeno','scheduled','${outsider}','${start}','${end}');
    `)
  }, 60_000)

  beforeEach(async () =>
    db.exec('truncate app_private.visit_assignment_swap_proposals, public.service_visit_events'),
  )
  afterAll(async () => db?.close())

  it('only projects eligible colleague name and time for an owned visit in a bounded day', async () => {
    await asWho(outsider, async () => {
      await expect(options()).rejects.toMatchObject({ code: '42501' })
      await expect(list()).rejects.toMatchObject({ code: '42501' })
    })
    await asWho(worker, async () => {
      const rows = await options()
      assert.ok(rows?.[0])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: alternate, colleague: 'Técnico B' })
      expect(Object.keys(rows[0]).sort()).toEqual([
        'colleague',
        'end_at',
        'id',
        'start_at',
        'version',
      ])
      await expect(options(tenant, alternate)).rejects.toMatchObject({ code: 'P0409' })
      await expect(options(tenant, visit, '2000-01-01')).rejects.toMatchObject({ code: '22023' })
      await expect(create(id(90), visit, foreignVisit)).rejects.toMatchObject({ code: 'P0409' })
      await expect(
        db.exec('select * from app_private.visit_assignment_swap_proposals'),
      ).rejects.toMatchObject({ code: '42501' })
    })
    await asWho(
      worker,
      async () => {
        await expect(list()).rejects.toMatchObject({ code: '42501' })
      },
      'anon',
    )
  })

  it('fails closed when tenant permissions or subscription checks return null', async () => {
    await db.exec('begin')
    try {
      await db.exec('update public.tenants set writable = null')
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${worker}';`)
      await expect(create()).rejects.toMatchObject({ code: 'P0402' })
    } finally {
      await db.exec('rollback')
    }
    await db.exec('begin')
    try {
      await db.exec(`create or replace function public.has_role(target_tenant uuid, allowed public.app_role[])
        returns boolean language sql stable security definer set search_path = '' as $$select null::boolean$$;`)
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${worker}';`)
      await expect(list()).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('rollback')
    }
  })

  it('omits alternatives outside verified coverage and visits without a known time', async () => {
    await db.exec('begin')
    try {
      await db.exec(`
        insert into public.work_orders values ('${id(101)}','${tenant}','${team}');
        update public.service_visits set work_order_id='${id(101)}' where id='${visit}';
      `)
      await asWho(worker, async () => expect(await options()).toEqual([]))
    } finally {
      await db.exec('rollback')
    }
    await db.exec('begin')
    try {
      await db.exec(`
        update public.service_visits set paper_snapshot='{"timeKnown":false}' where id='${alternate}';
      `)
      await asWho(worker, async () => expect(await options()).toEqual([]))
    } finally {
      await db.exec('rollback')
    }
  })

  it('submits idempotently, limits visibility, and keeps both rows unchanged before office approval', async () => {
    const original = await assignments()
    await asWho(worker, async () => {
      expect(await create()).toBe('pending')
      expect(await create()).toBe('pending')
      await expect(create(id(91))).rejects.toMatchObject({ code: 'P0409' })
      const rows = await list()
      assert.ok(rows?.[0])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: proposal, other_title: null, stale: false })
      expect(JSON.stringify(rows)).not.toContain('Cliente privado de B')
      await expect(decide('approved', rows[0].created_at)).rejects.toMatchObject({ code: '42501' })
    })
    await asWho(colleague, async () => {
      expect(await list()).toEqual([])
    })
    await asWho(foreignAdmin, async () => {
      await expect(decide('approved', version)).rejects.toMatchObject({ code: '42501' })
      await expect(decide('approved', version, foreign)).rejects.toMatchObject({ code: 'P0002' })
    })
    await asWho(worker, async () => {
      const submitted = (await list())?.[0]
      assert.ok(submitted)
      expect(await decide('withdrawn', submitted.created_at)).toBe('withdrawn')
      expect(await decide('withdrawn', submitted.created_at)).toBe('withdrawn')
    })
    expect(await assignments()).toEqual(original)
  })

  it('rolls back stale and uncovered changes, then applies a same-time swap through the real conflict guards', async () => {
    const original = await assignments()
    let stamp = ''
    await asWho(worker, async () => {
      expect(await create()).toBe('pending')
    })
    await asWho(admin, async () => {
      const rows = await list()
      assert.ok(rows?.[0])
      expect(rows[0]).toMatchObject({ id: proposal, other_title: 'Cliente privado de B' })
      stamp = rows[0].created_at
      await expect(decide('approved', version)).rejects.toMatchObject({ code: 'P0409' })
    })
    await db.exec(`update public.tenants set writable=false where id='${tenant}'`)
    await asWho(admin, async () => {
      await expect(decide('approved', stamp)).rejects.toMatchObject({ code: 'P0402' })
    })
    await db.exec(
      `update public.tenants set writable=true where id='${tenant}'; update public.memberships set role='viewer' where user_id='${colleague}'`,
    )
    await asWho(admin, async () => {
      expect((await list())?.[0]?.stale).toBe(true)
      await expect(decide('approved', stamp)).rejects.toMatchObject({ code: 'P0409' })
    })
    await db.exec(`update public.memberships set role='technician' where user_id='${colleague}';
      insert into public.absence_requests values ('${tenant}','${colleague}','approved','sick_leave','${date}',null);
    `)
    await asWho(admin, async () => {
      await expect(decide('approved', stamp)).rejects.toMatchObject({ code: 'P0409' })
    })
    await db.exec(
      `delete from public.absence_requests; update public.staff_schedules set slots='[]' where user_id='${colleague}'`,
    )
    await asWho(admin, async () => {
      await expect(decide('approved', stamp)).rejects.toMatchObject({ code: 'P0409' })
    })
    await db.exec(`
      update public.staff_schedules set slots=(select slots from public.staff_schedules where user_id='${worker}') where user_id='${colleague}';
      -- Simulate imported team bookings that conflict; the swap must not ignore them.
      alter table public.service_visits disable trigger service_visits_team_guard;
      insert into public.service_visits (id,tenant_id,title,status,work_team_id,scheduled_start_at,scheduled_end_at)
      values ('${blocker}','${tenant}','Solape en equipo','in_progress','${team}','${start}','${end}');
      alter table public.service_visits enable trigger service_visits_team_guard;
    `)
    await asWho(admin, async () => {
      await expect(decide('approved', stamp)).rejects.toMatchObject({ code: 'P0409' })
    })
    await db.exec(`delete from public.service_visits where id='${blocker}';
      update public.service_visits set title='Cambio de versión',updated_at=clock_timestamp() where id='${alternate}';
    `)
    await asWho(admin, async () => {
      expect((await list())?.[0]?.stale).toBe(true)
      await expect(decide('approved', stamp)).rejects.toMatchObject({ code: 'P0409' })
      expect(await decide('rejected', stamp)).toBe('rejected')
    })
    expect(await assignments()).toEqual(original)
    // Seed supersedable notices through the actual DEV-67 trigger. Restore exact
    // slots before proposing, and use both contemporary versions.
    await db.exec(`
      update public.service_visits set scheduled_end_at=scheduled_end_at + interval '5 minutes' where id='${visit}';
      update public.service_visits set scheduled_end_at='${end}' where id='${visit}';
      insert into public.google_calendar_connections (tenant_id, user_id, status, calendar_id, refresh_token_ciphertext)
      values ('${tenant}','${worker}','connected','worker-calendar','opaque-fixture'),
        ('${tenant}','${colleague}','connected','colleague-calendar','opaque-fixture');
    `)
    const pendingNotices = () =>
      db.query<{ visit_id: string; change_kind: string }>(
        'select visit_id, change_kind from public.list_my_visit_agenda_change_notices($1)',
        [tenant],
      )
    await asWho(worker, async () => {
      expect((await pendingNotices()).rows).toEqual([
        { visit_id: visit, change_kind: 'rescheduled' },
        { visit_id: visit, change_kind: 'rescheduled' },
      ])
    })
    const { rows } = await db.query<{ id: string; version: string }>(
      'select id, updated_at::text as version from public.service_visits where id in ($1,$2)',
      [visit, alternate],
    )
    const ownVersion = rows.find(({ id }) => id === visit)?.version
    const otherVersion = rows.find(({ id }) => id === alternate)?.version
    assert.ok(ownVersion && otherVersion)
    const googleQueue = async () =>
      (
        await db.query<{ user_id: string; visit_id: string; generation: number; active: boolean }>(`
      select j.user_id, j.visit_id, j.generation::int, (v.assigned_user_id=j.user_id) as active
      from public.google_calendar_sync_jobs j join public.service_visits v
        on v.id=j.visit_id and v.tenant_id=j.tenant_id
      order by j.user_id,j.visit_id
    `)
      ).rows
    const beforeQueue = await googleQueue()
    expect(beforeQueue).toHaveLength(2)
    expect(beforeQueue.every((job) => job.active && job.generation === 0)).toBe(true)
    const preclaimed = await asWho(
      admin,
      async () =>
        (
          await db.query<{
            job_id: string
            lease_token: string
            generation: number
            visit_id: string
            user_id: string
          }>('select * from public.claim_google_calendar_sync_job()')
        ).rows[0],
      'service_role',
    )
    assert.ok(preclaimed)
    const anotherProposal = id(92)
    await asWho(worker, async () => {
      expect(
        await rpc('create_visit_swap_proposal($1,$2,$3,$4,$5,$6)', [
          tenant,
          anotherProposal,
          visit,
          ownVersion,
          alternate,
          otherVersion,
        ]),
      ).toBe('pending')
    })
    await asWho(admin, async () => {
      const createdAt = (await list())?.[0]?.created_at
      assert.ok(createdAt)
      // A downstream constraint on one assignment also rolls back the other.
      await db.exec('reset role')
      await db.exec(`create function public.fail_one_fixture_assignment() returns trigger language plpgsql as $$
        begin if new.id='${alternate}' and new.assigned_user_id='${worker}' then
          raise exception 'Forced second assignment conflict' using errcode='P0409';
        end if; return new; end; $$;
        create trigger fail_one_fixture_assignment before update on public.service_visits
          for each row execute function public.fail_one_fixture_assignment();
      `)
      await db.exec('set role authenticated')
      await expect(decide('approved', createdAt, tenant, anotherProposal)).rejects.toMatchObject({
        code: 'P0409',
      })
      expect((await list())?.[0]?.state).toBe('pending')
      await db.exec('reset role')
      expect(await assignments()).toEqual(original)
      expect(await googleQueue()).toEqual(beforeQueue)
      expect(
        (await db.query('select * from app_private.visit_agenda_change_notices')).rows,
      ).toHaveLength(2)
      expect((await db.query('select * from public.service_visit_events')).rows).toHaveLength(0)
      await db.exec(
        'drop trigger fail_one_fixture_assignment on public.service_visits; set role authenticated',
      )
      expect(await decide('approved', createdAt, tenant, anotherProposal)).toBe('approved')
      expect(await decide('approved', createdAt, tenant, anotherProposal)).toBe('approved')
    })
    expect(await assignments()).toEqual(
      original.map((v) => ({
        ...v,
        assigned_user_id: v.id === visit ? colleague : worker,
      })),
    )
    expect((await db.query('select * from public.service_visit_events')).rows).toHaveLength(2)
    expect(await googleQueue()).toEqual([
      { user_id: worker, visit_id: visit, generation: 1, active: false },
      { user_id: worker, visit_id: alternate, generation: 0, active: true },
      { user_id: colleague, visit_id: visit, generation: 0, active: true },
      { user_id: colleague, visit_id: alternate, generation: 1, active: false },
    ])
    // Two stages enqueue old-only then new-only, exactly as two direct
    // reassignments would. Finishing a preexisting lease leaves its newer
    // generation to remove the old calendar entry using current assignment.
    await asWho(
      admin,
      async () => {
        expect(
          await rpc('finish_google_calendar_sync_job($1,$2,$3)', [
            preclaimed.job_id,
            preclaimed.lease_token,
            String(preclaimed.generation),
          ]),
        ).toBe(true)
      },
      'service_role',
    )
    expect(await googleQueue()).toContainEqual({
      user_id: preclaimed.user_id,
      visit_id: preclaimed.visit_id,
      generation: 1,
      active: false,
    })
    for (const [user, assignedVisit] of [
      [worker, alternate],
      [colleague, visit],
    ] as const) {
      await asWho(user, async () => {
        expect((await pendingNotices()).rows).toEqual([
          { visit_id: assignedVisit, change_kind: 'assigned' },
        ])
      })
    }
  })
})
