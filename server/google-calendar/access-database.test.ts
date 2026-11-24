import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe('Google Calendar membership and subscription access', () => {
  const db = new PGlite()
  const tenant = '10000000-0000-4000-8000-000000000001'
  const other = '10000000-0000-4000-8000-000000000002'
  const admin = '20000000-0000-4000-8000-000000000001'
  const user = '20000000-0000-4000-8000-000000000002'
  const tech = '20000000-0000-4000-8000-000000000003'
  const visit = '30000000-0000-4000-8000-000000000001'

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private; create schema auth; create schema cron;
      create table cron.job(jobname text);
      create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$
        select current_setting('test.role', true) $$;
      create table public.tenants(id uuid primary key, is_complimentary boolean,
        subscription_status text, trial_ends_at timestamptz);
      create table public.memberships(tenant_id uuid, user_id uuid, role text);
      create table public.work_team_members(tenant_id uuid, team_id uuid, user_id uuid);
      create table public.service_visits(id uuid, tenant_id uuid, assigned_user_id uuid,
        work_team_id uuid, status text);
      create table public.google_calendar_connections(tenant_id uuid, user_id uuid, status text,
        refresh_token_ciphertext text, last_error text, sync_lease_token uuid,
        sync_lease_until timestamptz, updated_at timestamptz);
      create table public.google_calendar_sync_events(tenant_id uuid, user_id uuid, visit_id uuid);
      create table public.google_calendar_sync_jobs(id uuid default gen_random_uuid(), tenant_id uuid,
        user_id uuid, visit_id uuid, available_at timestamptz default clock_timestamp(),
        generation bigint default 0, last_error text, lease_token uuid, lease_until timestamptz,
        attempts integer default 0, created_at timestamptz default clock_timestamp(),
        unique(tenant_id, user_id, visit_id));
    `)
    const billing = await readFile(
      new URL(
        '../../supabase/migrations/20261109145754_complimentary_tenants.sql',
        import.meta.url,
      ),
      'utf8',
    )
    const access = billing.match(
      /create or replace function public\.tenant_can_write[\s\S]*?\$\$;/,
    )?.[0]
    if (!access) throw new Error('Missing tenant access function')
    await db.exec(access)
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261124220000_google_calendar_all_roles.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)

  beforeEach(async () => {
    await db.exec(`
      truncate public.tenants, public.memberships, public.work_team_members, public.service_visits,
        public.google_calendar_connections, public.google_calendar_sync_jobs, public.google_calendar_sync_events;
      insert into public.tenants values ('${tenant}', true, 'canceled', null), ('${other}', false, 'canceled', null);
      insert into public.memberships values ('${tenant}', '${admin}', 'admin'),
        ('${tenant}', '${user}', 'user'), ('${tenant}', '${tech}', 'technician');
      insert into public.google_calendar_connections(tenant_id,user_id,status,refresh_token_ciphertext)
        values ('${tenant}', '${admin}', 'connected', 'encrypted');
      select set_config('test.user_id', '${admin}', false);
      select set_config('test.role', 'service_role', false);
    `)
  })
  afterAll(async () => db.close())

  it('authorizes all members only in their own tenant with active access', async () => {
    for (const id of [admin, user, tech]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select public.authorize_google_calendar_actor('${tenant}', '${id}') as allowed`,
      )
      expect(rows[0]?.allowed).toBe(true)
    }
    expect(
      (
        await db.query<{ allowed: boolean }>(
          `select public.authorize_google_calendar_actor('${other}', '${admin}') as allowed`,
        )
      ).rows[0]?.allowed,
    ).toBe(false)
    await db.exec(`update public.tenants set is_complimentary = false where id = '${tenant}'`)
    expect(
      (
        await db.query<{ allowed: boolean }>(
          `select public.authorize_google_calendar_actor('${tenant}', '${admin}') as allowed`,
        )
      ).rows[0]?.allowed,
    ).toBe(false)
    await db.exec(
      `update public.tenants set subscription_status = 'trialing', trial_ends_at = now() + interval '1 day' where id = '${tenant}'`,
    )
    expect(
      (
        await db.query<{ allowed: boolean }>(
          `select public.authorize_google_calendar_actor('${tenant}', '${admin}') as allowed`,
        )
      ).rows[0]?.allowed,
    ).toBe(true)
  })

  it('queues only assigned visits for an admin and preserves work during expired access', async () => {
    await db.exec(`
      insert into public.service_visits values ('${visit}', '${tenant}', '${admin}', null, 'scheduled'),
        ('30000000-0000-4000-8000-000000000002', '${tenant}', '${user}', null, 'scheduled');
      select public.queue_my_google_calendar_sync('${tenant}');
      update public.tenants set is_complimentary = false where id = '${tenant}';
      select app_private.enqueue_google_calendar_visit('${tenant}', '${admin}', '${visit}');
    `)
    expect(
      (await db.query('select visit_id, generation from public.google_calendar_sync_jobs')).rows,
    ).toEqual([{ visit_id: visit, generation: 1 }])
    expect((await db.query('select * from public.claim_google_calendar_sync_job()')).rows).toEqual(
      [],
    )
    await expect(
      db.exec(`select public.queue_my_google_calendar_sync('${tenant}')`),
    ).rejects.toThrow('permiso')
    await db.exec(`update public.tenants set subscription_status = 'active' where id = '${tenant}'`)
    expect(
      (await db.query('select * from public.claim_google_calendar_sync_job()')).rows,
    ).toHaveLength(1)
  })

  it('allows members to disconnect after access expires', async () => {
    await db.exec(`update public.tenants set is_complimentary = false where id = '${tenant}'`)
    const result = await db.query<{ disconnected: boolean }>(
      `select public.disconnect_my_google_calendar('${tenant}') as disconnected`,
    )
    expect(result.rows[0]?.disconnected).toBe(true)
    expect(
      (
        await db.query(
          'select status, refresh_token_ciphertext from public.google_calendar_connections',
        )
      ).rows,
    ).toEqual([{ status: 'disconnected', refresh_token_ciphertext: null }])
  })
})
