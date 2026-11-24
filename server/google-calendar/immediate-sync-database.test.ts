import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe('Google Calendar immediate dispatch', () => {
  const db = new PGlite()

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema app_private; create schema vault; create schema net;
      create table vault.decrypted_secrets(name text, decrypted_secret text);
      insert into vault.decrypted_secrets values ('google_calendar_sync_cron_secret', 'test-secret');
      create table public.google_calendar_sync_jobs(
        id integer primary key, available_at timestamptz default clock_timestamp(),
        generation integer not null default 0
      );
      create table public.dispatched_requests(timeout_ms integer);
      create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
      returns bigint language plpgsql as $$
      begin
        if current_setting('test.fail_dispatch', true) = 'true' then
          raise exception 'network unavailable';
        end if;
        insert into public.dispatched_requests values (timeout_milliseconds);
        return 1;
      end;
      $$;
    `)
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261124180513_google_calendar_immediate_sync.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)

  beforeEach(async () => {
    await db.exec('truncate public.google_calendar_sync_jobs, public.dispatched_requests')
  })

  afterAll(async () => db.close())

  const dispatches = () =>
    db.query<{ timeout_ms: number }>('select * from public.dispatched_requests')

  it('dispatches once per transaction and again for a later change', async () => {
    await db.exec(`
      begin;
      insert into public.google_calendar_sync_jobs(id) values (1), (2);
      update public.google_calendar_sync_jobs set generation = generation + 1 where id = 1;
      commit;
    `)
    expect((await dispatches()).rows).toEqual([{ timeout_ms: 60000 }])
    await db.exec(
      'update public.google_calendar_sync_jobs set generation = generation + 1 where id = 2',
    )
    expect((await dispatches()).rows).toHaveLength(2)
  })

  it('rolls back the request with the visit transaction', async () => {
    await db.exec('begin; insert into public.google_calendar_sync_jobs(id) values (1); rollback;')
    expect((await dispatches()).rows).toEqual([])
  })

  it('does not dispatch delayed jobs or unrelated updates', async () => {
    await db.exec(`
      insert into public.google_calendar_sync_jobs(id, available_at)
        values (1, clock_timestamp() + interval '1 hour');
      update public.google_calendar_sync_jobs set available_at = clock_timestamp() where id = 1;
    `)
    expect((await dispatches()).rows).toEqual([])
    await db.exec(
      'update public.google_calendar_sync_jobs set generation = generation + 1 where id = 1',
    )
    expect((await dispatches()).rows).toHaveLength(1)
  })

  it('keeps the job when dispatch fails', async () => {
    await db.exec(`
      begin;
      set local test.fail_dispatch = 'true';
      insert into public.google_calendar_sync_jobs(id) values (1);
      commit;
    `)
    expect((await db.query('select id from public.google_calendar_sync_jobs')).rows).toEqual([
      { id: 1 },
    ])
    expect((await dispatches()).rows).toEqual([])
  })
})
