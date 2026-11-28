import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const uuid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = uuid(1)
const actor = uuid(2)
const worker = uuid(3)
const location = uuid(4)
const first = uuid(10)
const second = uuid(11)
const third = uuid(12)
const fourth = uuid(13)
const secret = (n: number) => n.toString(16).repeat(64)
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

describe('appointment bearer migration', () => {
  const db = new PGlite({ extensions: { pgcrypto } })
  const migrations = [
    '20261027143444_service_visit_replanning.sql',
    '20261128155339_visit_appointment_response_links.sql',
  ]
  async function role(value: 'admin' | 'owner' | 'user' | 'anon') {
    await db.exec('reset role')
    await db.query("select set_config('demo.uid',$1,false),set_config('demo.role',$2,false)", [
      value === 'anon' ? '' : actor,
      value === 'anon' ? 'user' : value,
    ])
    await db.exec(value === 'anon' ? 'set role anon' : 'set role authenticated')
  }
  const scalar = async <T>(sql: string, args: unknown[]) =>
    (await db.query<{ result: T }>(sql, args)).rows[0]?.result
  const create = (id: string, token: string, op: number, hours = 24) =>
    scalar<string>('select public.create_visit_appointment_link($1,$2,$3,$4,$5)::text result', [
      tenant,
      id,
      digest(token),
      hours,
      uuid(op),
    ])
  const read = (token: string) =>
    scalar<Record<string, unknown> | null>('select public.read_visit_appointment_link($1) result', [
      token,
    ])
  const respond = (token: string, response: string, local: string | null = null) =>
    scalar<Record<string, unknown> | null>(
      'select public.respond_visit_appointment_link($1,$2,$3) result',
      [token, response, local],
    )
  const decide = (linkId: string, value: string, op: number) =>
    scalar<boolean>('select public.decide_visit_appointment_change($1,$2,$3,$4) result', [
      tenant,
      linkId,
      value,
      uuid(op),
    ])
  const currentLinkId = (visitId: string) =>
    scalar<string>(
      'select id result from public.visit_appointment_links where visit_id=$1 order by created_at desc limit 1',
      [visitId],
    )
  const proposedTime = () =>
    scalar<string>(
      "select to_char((clock_timestamp()+interval '32 days') at time zone 'Europe/Madrid','YYYY-MM-DD\"T\"HH24:MI') result",
      [],
    )

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private; create schema extensions;
      grant usage on schema auth to anon, authenticated;
      create extension pgcrypto with schema extensions;
      revoke all on schema app_private from public, anon, authenticated;
      create type public.app_role as enum ('owner','admin','editor','technician','user');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('demo.uid',true),'')::uuid $$;
      create function public.has_role(target uuid, allowed public.app_role[]) returns boolean language sql as $$
        select target::text=current_setting('demo.tenant',true) and auth.uid() is not null
          and current_setting('demo.role',true)::public.app_role=any(allowed) $$;
      create function public.tenant_can_write(uuid) returns boolean language sql as $$ select current_setting('demo.write',true)='yes' $$;
      create function public.company_onboarding_allows_workspace(uuid) returns boolean language sql as $$ select auth.uid() is not null $$;
      create table public.memberships(tenant_id uuid,user_id uuid,role public.app_role);
      create table public.service_locations(id uuid,tenant_id uuid,timezone text);
      create table public.service_visits(id uuid primary key,tenant_id uuid not null,title text,notes text,
        location_id uuid,scheduled_start_at timestamptz,scheduled_end_at timestamptz,
        assigned_user_id uuid,status text,updated_at timestamptz default clock_timestamp(),unique(id,tenant_id));
      create function public.touch_visit_demo() returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;
      create trigger touch_visit before update on public.service_visits for each row execute function public.touch_visit_demo();
      create table public.service_visit_events(operation_id uuid primary key,tenant_id uuid,visit_id uuid,
        kind text,payload jsonb,actor_id uuid,constraint service_visit_events_kind_check check(kind in ('status_changed','created')));
      insert into public.memberships values ('${tenant}','${worker}','technician');
      insert into public.service_locations values ('${location}','${tenant}','Europe/Madrid');
      insert into public.service_visits(id,tenant_id,title,notes,location_id,scheduled_start_at,scheduled_end_at,assigned_user_id,status)
        select id,'${tenant}','Título privado','Notas privadas','${location}',now()+interval '14 days',
          now()+interval '14 days 1 hour','${worker}','scheduled' from unnest(array['${first}','${second}','${third}','${fourth}']::uuid[]) id;
      select set_config('demo.tenant','${tenant}',false),set_config('demo.write','yes',false);
    `)
    await db.query("select set_config('request.method','POST',false)")
    for (const migration of migrations)
      await db.exec(
        await readFile(
          new URL(`../../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )
  }, 30000)
  afterAll(async () => db.close())

  it('allows owner/admin create, never exposes a digest or office action to the public, and rotates old links', async () => {
    await role('user')
    await expect(create(first, secret(1), 31)).rejects.toMatchObject({ code: '42501' })
    await role('owner')
    const deadline = await create(first, secret(1), 31)
    expect(deadline).toBeTruthy()
    expect(await create(first, secret(1), 31)).toBe(deadline)
    await expect(create(first, secret(1), 31, 72)).rejects.toMatchObject({ code: '23505' })
    await expect(
      db.query('select token_hash from public.visit_appointment_links'),
    ).rejects.toMatchObject({ code: '42501' })
    await create(first, secret(2), 32)
    const link = await currentLinkId(first)
    expect(link).toBeDefined()
    if (!link) throw new Error('Missing link')
    await role('anon')
    expect(await read(secret(1))).toBeNull()
    await db.query("select set_config('request.method','GET',false)")
    expect(await read(secret(2))).toBeNull()
    await db.query("select set_config('request.method','POST',false)")
    expect(await read('dead-token')).toBeNull()
    expect(await read(secret(3))).toBeNull()
    const publicRecord = await read(secret(2))
    expect(Object.keys(publicRecord ?? {}).sort()).toEqual([
      'declined',
      'endAt',
      'proposedAt',
      'response',
      'startAt',
      'timezone',
    ])
    expect(JSON.stringify(publicRecord)).not.toContain('Título privado')
    await expect(db.query('select id from public.visit_appointment_links')).rejects.toMatchObject({
      code: '42501',
    })
    await expect(decide(link, 'approved', 33)).rejects.toMatchObject({ code: '42501' })
    await role('admin')
    expect(
      await scalar('select public.revoke_visit_appointment_link($1,$2) result', [tenant, link]),
    ).toBe(true)
    await role('anon')
    expect(await read(secret(2))).toBeNull()
  })

  it('confirms attendance idempotently, rejects a different replay, and does not replan', async () => {
    await role('admin')
    await create(second, secret(3), 34)
    await role('anon')
    expect(await respond(secret(3), 'confirmed')).toMatchObject({ response: 'confirmed' })
    expect(await respond(secret(3), 'confirmed')).toMatchObject({ response: 'confirmed' })
    const proposed = await proposedTime()
    if (!proposed) throw new Error('Missing proposed time')
    await expect(respond(secret(3), 'change', proposed)).rejects.toMatchObject({ code: 'P0409' })
    await db.exec('reset role')
    expect(
      (await db.query('select kind from public.service_visit_events where visit_id=$1', [second]))
        .rows,
    ).toEqual([])
  })

  it('records a proposal without schedule event and only explicit office approval uses real replan and audit once', async () => {
    await role('admin')
    await create(third, secret(4), 35)
    const link = await currentLinkId(third)
    const proposed = await proposedTime()
    if (!link || !proposed) throw new Error('Missing fixture')
    await role('anon')
    expect(await respond(secret(4), 'change', proposed)).toMatchObject({ response: 'change' })
    expect(await respond(secret(4), 'change', proposed)).toMatchObject({ response: 'change' })
    await db.exec('reset role')
    expect(
      (await db.query('select kind from public.service_visit_events where visit_id=$1', [third]))
        .rows,
    ).toEqual([])
    await role('admin')
    expect(await decide(link, 'approved', 36)).toBe(true)
    expect(await decide(link, 'approved', 36)).toBe(true)
    await db.exec('reset role')
    expect(
      (await db.query('select kind from public.service_visit_events where visit_id=$1', [third]))
        .rows,
    ).toEqual([{ kind: 'schedule_changed' }])
    expect(
      (await db.query('select assigned_user_id from public.service_visits where id=$1', [third]))
        .rows,
    ).toEqual([{ assigned_user_id: worker }])
    expect(
      (
        await db.query(
          'select extract(epoch from (scheduled_end_at-scheduled_start_at))::integer duration from public.service_visits where id=$1',
          [third],
        )
      ).rows,
    ).toEqual([{ duration: 3600 }])
    await role('anon')
    expect(await read(secret(4))).toBeNull()
  })

  it('rejects a stale proposal at explicit approval, allows dismissal, and hides an expired link', async () => {
    await role('admin')
    await create(fourth, secret(5), 37)
    const link = await currentLinkId(fourth)
    const proposed = await proposedTime()
    if (!link || !proposed) throw new Error('Missing fixture')
    await role('anon')
    expect(await respond(secret(5), 'change', '2000-01-01T09:00')).toEqual({
      error: 'invalid_proposal',
    })
    expect(await respond(secret(5), 'change', proposed)).toEqual({ error: 'rate_limited' })
    await db.exec('reset role')
    await db.query(
      'update public.visit_appointment_links set accept_next_response_after=null where id=$1',
      [link],
    )
    await role('anon')
    expect(await respond(secret(5), 'change', proposed)).toMatchObject({ response: 'change' })
    await db.exec('reset role')
    await db.query(
      "update public.service_visits set scheduled_start_at=scheduled_start_at+interval '1 day',scheduled_end_at=scheduled_end_at+interval '1 day' where id=$1",
      [fourth],
    )
    await role('admin')
    await expect(decide(link, 'approved', 38)).rejects.toMatchObject({ code: 'P0409' })
    expect(await decide(link, 'declined', 39)).toBe(true)
    await create(fourth, secret(6), 40)
    await db.exec('reset role')
    await db.query(
      "update public.visit_appointment_links set expires_at=clock_timestamp()-interval '1 second' where token_hash=$1",
      [digest(secret(6))],
    )
    await role('anon')
    expect(await read(secret(5))).toBeNull()
    expect(await respond(secret(6), 'confirmed')).toBeNull()
  })
})
