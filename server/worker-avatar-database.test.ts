import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const tenant = 'ab000000-0000-4000-8000-000000000001'
const otherTenant = 'ab000000-0000-4000-8000-000000000002'
const admin = 'ab000000-0000-4000-8000-000000000003'
const worker = 'ab000000-0000-4000-8000-000000000004'
const colleague = 'ab000000-0000-4000-8000-000000000005'
const outsider = 'ab000000-0000-4000-8000-000000000006'
const path = `${tenant}/${worker}/ab000000-0000-4000-8000-000000000007.jpg`
const nextPath = `${tenant}/${worker}/ab000000-0000-4000-8000-000000000008.png`

describe('worker avatar access', () => {
  const db = new PGlite()
  const identity = (id: string) => db.query("select set_config('request.user_id', $1, false)", [id])
  const setPhoto = (user: string, objectPath: string | null) =>
    db.query<{ previous: string | null }>(
      'select public.set_worker_avatar($1, $2, $3) as previous',
      [tenant, user, objectPath],
    )
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.user_id', true), '')::uuid
      $$;
      create table public.memberships(tenant_id uuid, user_id uuid, role text,
        primary key(tenant_id, user_id));
      create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, delete on storage.objects to authenticated;
    `)
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20261124201111_worker_avatars.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.query(
      `insert into public.memberships values
      ($1, $3, 'admin'), ($1, $4, 'user'), ($1, $5, 'user'), ($2, $6, 'admin')`,
      [tenant, otherTenant, admin, worker, colleague, outsider],
    )
    await db.exec('set role authenticated')
  }, 30000)
  afterAll(async () => db.close())

  it('allows a worker to upload and set their own photo, but not another person’s', async () => {
    await identity(worker)
    await db.query("insert into storage.objects values ('worker-avatars', $1)", [path])
    expect((await setPhoto(worker, path)).rows[0]?.previous).toBeNull()
    await expect(
      db.query("insert into storage.objects values ('worker-avatars', $1)", [
        `${tenant}/${colleague}/ab000000-0000-4000-8000-000000000009.jpg`,
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(setPhoto(colleague, null)).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.query('update public.worker_avatars set object_path = $1', [path]),
    ).rejects.toMatchObject({ code: '42501' })
    expect(
      (await db.query('delete from storage.objects where name = $1 returning name', [path])).rows,
    ).toHaveLength(0)
  })

  it('isolates companies while allowing colleagues to read and administrators to replace photos', async () => {
    await identity(outsider)
    expect((await db.query('select * from public.worker_avatars')).rows).toHaveLength(0)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
    await expect(setPhoto(worker, null)).rejects.toMatchObject({ code: '42501' })
    await identity(colleague)
    expect((await db.query('select * from public.worker_avatars')).rows).toHaveLength(1)
    await identity(admin)
    await expect(
      setPhoto(worker, `${otherTenant}/${worker}/ab000000-0000-4000-8000-000000000009.jpg`),
    ).rejects.toMatchObject({ code: '22023' })
    await db.query("insert into storage.objects values ('worker-avatars', $1)", [nextPath])
    expect((await setPhoto(worker, nextPath)).rows[0]?.previous).toBe(path)
    expect(
      (await db.query('delete from storage.objects where name = $1 returning name', [path])).rows,
    ).toHaveLength(1)
    expect((await setPhoto(worker, null)).rows[0]?.previous).toBe(nextPath)
    expect(
      (await db.query('delete from storage.objects where name = $1 returning name', [nextPath]))
        .rows,
    ).toHaveLength(1)
  })
})
