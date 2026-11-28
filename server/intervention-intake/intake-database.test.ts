import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const id = (n: number) => `83000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const client = id(2)
const centre = id(3)
const admin = id(4)
const worker = id(5)
const otherTenant = id(6)
const otherClient = id(7)
const otherCentre = id(8)
const outsider = id(9)
const op = id(10)
const digest = 'e'.repeat(64)
const sha = (secret: string) => createHash('sha256').update(secret).digest('hex')
const denied = expect.objectContaining({ code: '42501' })

describe('DEV-83 scoped invitation and private intervention review', () => {
  const db = new PGlite()
  async function value<T>(query: string, params: unknown[] = []) {
    return (await db.query<{ value: T }>(query, params)).rows[0]?.value
  }
  const actor = (who: string) => value("select set_config('request.user_id',$1,false) value", [who])
  async function create(location: string | null = centre) {
    const invite = await value<{ id: string; token: string }>(
      'select public.create_intervention_invite($1,$2,$3) value',
      [tenant, client, location],
    )
    if (!invite) throw new Error('Expected synthetic invitation')
    return invite
  }
  const check = (secretHash: string, operation: string | null = null, withPhotos = false) =>
    value<{ state: string }>('select public.guard_intervention_intake($1,$2,$3) value', [
      secretHash,
      operation,
      operation ? withPhotos : null,
    ])
  const claim = (secretHash: string, attempt = 1, count = 1, operation = op) =>
    value<boolean>('select public.claim_intervention_image_budget($1,$2,$3,$4) value', [
      secretHash,
      operation,
      attempt,
      count,
    ])
  const submit = (secretHash: string, operation = op, photos: string[] = [], payload = digest) =>
    value<string>('select public.submit_intervention_intake($1,$2,$3,$4,$5,$6) value', [
      secretHash,
      operation,
      payload,
      'Calle Ficticia 5',
      'Martes por la mañana',
      JSON.stringify(photos),
    ])
  const office = async (who = admin) => {
    await actor(who)
    await db.exec('set role authenticated')
  }
  const service = () => db.exec('set role service_role')
  const list = () =>
    value<{ id: string; request: { photo_ids: string[] } | null }[]>(
      'select public.list_intervention_intake($1,$2) value',
      [tenant, client],
    )

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private; create schema extensions;
      create type public.app_role as enum ('admin','owner','user');
      create table auth.users(id uuid primary key);
      create table public.tenants(id uuid primary key, writable boolean default true);
      create table public.clients(id uuid primary key,tenant_id uuid,archived_at timestamptz,unique(id,tenant_id));
      create table public.service_locations(id uuid primary key,tenant_id uuid,client_id uuid,name text,active boolean default true,kind text default 'service');
      create table public.members(tenant_id uuid,user_id uuid,role app_role);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
      create function public.has_role(t uuid,r public.app_role[]) returns boolean language sql stable security definer as $$
        select m.role=any(r) from public.members m where m.tenant_id=t and m.user_id=(select auth.uid()) $$;
      create function public.tenant_can_write(t uuid) returns boolean language sql stable security definer as $$
        select writable from public.tenants where id=t $$;
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
        select substring(sha256(convert_to(gen_random_uuid()::text,'UTF8')) from 1 for n) $$;
      create function extensions.digest(s text,algorithm text) returns bytea language sql as $$
        select sha256(convert_to(s,'UTF8')) $$;
    `)
    await db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/20261128163000_intervention_intake.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  }, 30000)

  beforeEach(async () => {
    await db.exec(`reset role; truncate app_private.intervention_image_budget,app_private.intervention_photos,app_private.intervention_requests,
      app_private.intervention_invites,public.service_locations,public.clients,public.tenants,public.members,auth.users;`)
    await db.query('insert into public.tenants(id) values ($1),($2)', [tenant, otherTenant])
    await db.query('insert into public.clients values ($1,$2,null),($3,$4,null)', [
      client,
      tenant,
      otherClient,
      otherTenant,
    ])
    await db.query(
      `insert into public.service_locations(id,tenant_id,client_id,name)
      values ($1,$2,$3,'Centro de prueba'),($4,$5,$6,'Centro externo')`,
      [centre, tenant, client, otherCentre, otherTenant, otherClient],
    )
    await db.query('insert into auth.users values ($1),($2),($3)', [admin, worker, outsider])
    await db.query(
      `insert into public.members values ($1,$3,'admin'),($1,$4,'user'),($2,$5,'admin')`,
      [tenant, otherTenant, admin, worker, outsider],
    )
    await office()
  })
  afterAll(() => db.close())

  it('scopes issuance to office and centre, with no private schema/list leaks', async () => {
    await expect(create(otherCentre)).rejects.toMatchObject({ code: 'P0002' })
    const invite = await create()
    expect(invite.token).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(await list())).not.toMatch(new RegExp(invite.token))
    await expect(check(sha(invite.token))).rejects.toEqual(denied)
    await expect(claim(sha(invite.token))).rejects.toEqual(denied)
    await expect(value('select * from app_private.intervention_invites')).rejects.toEqual(denied)
    await office(worker)
    await expect(list()).rejects.toEqual(denied)
    await office(outsider)
    await expect(list()).rejects.toEqual(denied)
    await db.exec('set role anon')
    await expect(check(sha(invite.token))).rejects.toEqual(denied)
  })

  it('consumes once, supports lossless replay and allows no photos', async () => {
    const invite = await create(null)
    const secret = sha(invite.token)
    await service()
    expect(await check(secret)).toEqual({ state: 'pending' })
    expect(await check(secret, op)).toEqual({ state: 'pending' })
    expect(await check(secret, id(11))).toEqual({ state: 'limited' })
    const first = await submit(secret)
    expect(first).toMatch(/^[a-f0-9-]{36}$/)
    expect(await check(secret)).toBeNull()
    expect(await submit(secret)).toBe(first)
    expect(await submit(secret, id(11))).toBeNull()
    expect(await submit(secret, op, [], 'c'.repeat(64))).toBeNull()
    await office()
    expect((await list())?.[0]?.request).toMatchObject({
      photo_ids: [],
      id: first,
      status: 'pending',
    })
  })

  it('enforces an eight-photo-attempt cap, independent of the three text-only retries', async () => {
    const issued = await create()
    const secret = sha(issued.token)
    async function afterCooldown() {
      await db.exec('reset role')
      await db.query(
        "update app_private.intervention_invites set last_attempt_at=now()-interval '5 seconds' where id=$1",
        [issued.id],
      )
      await service()
    }
    await service()
    for (let count = 0; count < 8; count++) {
      expect(await check(secret, op, true)).toEqual({ state: 'pending', photo_attempt: count + 1 })
      await afterCooldown()
    }
    expect(await check(secret, op, true)).toEqual({ state: 'photo_limited' })
    for (let count = 0; count < 3; count++) {
      expect(await check(secret, op, false)).toEqual({ state: 'pending' })
      await afterCooldown()
    }
    expect(await check(secret, op, false)).toEqual({ state: 'limited' })
    expect(
      await submit(secret, op, [Buffer.from([255, 216, 255, 217]).toString('base64')]),
    ).toBeNull()
    expect(await submit(secret)).toBeTruthy()
  })

  it('reserves the project-wide budget before photos, never reuses a claim, and leaves text independent', async () => {
    const first = await create()
    await office(outsider)
    const second = await value<{ token: string }>(
      'select public.create_intervention_invite($1,$2,$3) value',
      [otherTenant, otherClient, otherCentre],
    )
    if (!second) throw new Error('Expected second synthetic invite')
    await db.exec('reset role')
    await db.exec(
      "insert into app_private.intervention_image_budget values(date_trunc('month',now() at time zone 'UTC')::date,498)",
    )
    await service()
    await check(sha(first.token), op, true)
    expect(await claim(sha(first.token), 1, 3)).toBe(false)
    expect(await claim(sha(first.token), 1, 2)).toBe(true)
    expect(await claim(sha(first.token), 1, 1)).toBeNull()
    const jpeg = Buffer.from([255, 216, 255, 217]).toString('base64')
    expect(await submit(sha(first.token), op, [jpeg])).toBeNull()
    expect(await submit(sha(first.token), op, [jpeg, jpeg])).toBeTruthy()
    await check(sha(second.token), op, true)
    expect(await claim(sha(second.token))).toBe(false)
    await db.exec('reset role')
    expect(
      await value('select reservations value from app_private.intervention_image_budget'),
    ).toBe(500)
    await db.exec(
      "update app_private.intervention_invites set last_attempt_at=now()-interval '5 seconds'",
    )
    await service()
    expect(await check(sha(second.token), op, false)).toEqual({ state: 'pending' })
    expect(await submit(sha(second.token))).toBeTruthy()
  })

  it('caps both issue rate and active unconsumed invitations to ten per tenant', async () => {
    const first = await create()
    for (let issued = 1; issued < 10; issued++) await create()
    await expect(create()).rejects.toMatchObject({ code: 'P0429' })
    // Isolate the active-link cap from the independent rolling-hour issuance limit.
    await db.exec('reset role')
    await db.query(
      "update app_private.intervention_invites set created_at=now()-interval '2 hours' where tenant_id=$1",
      [tenant],
    )
    await office()
    await expect(create()).rejects.toMatchObject({ code: 'P0429' })
    await db.query("select public.update_intervention_intake($1,$2,'revoke')", [tenant, first.id])
    expect(await create()).toMatchObject({ token: expect.stringMatching(/^[a-f0-9]{64}$/) })
  })

  it('rejects revoked and expired links, including a revocation race after reserving', async () => {
    const invite = await create()
    const secret = sha(invite.token)
    await service()
    await check(secret, op)
    await office()
    await db.query("select public.update_intervention_intake($1,$2,'revoke')", [tenant, invite.id])
    await service()
    expect(await submit(secret)).toBeNull()
    await office()
    const expired = await create()
    await db.exec('reset role')
    await db.query(
      "update app_private.intervention_invites set expires_at=now()-interval '1 minute' where id=$1",
      [expired.id],
    )
    await service()
    expect(await check(sha(expired.token), op)).toBeNull()
  })

  it.each([
    ['client archived', 'update public.clients set archived_at=now() where id=$1', client],
    ['centre disabled', 'update public.service_locations set active=false where id=$1', centre],
    [
      'centre switched to billing',
      "update public.service_locations set kind='billing' where id=$1",
      centre,
    ],
  ])(
    'blocks guard, photo reservations and submit when the %s after issuance',
    async (_case, query, target) => {
      const invite = await create()
      const secret = sha(invite.token)
      await service()
      expect(await check(secret, op, true)).toEqual({ state: 'pending', photo_attempt: 1 })
      await db.exec('reset role')
      await db.query(query, [target])
      await service()
      expect(await check(secret)).toBeNull()
      expect(await check(secret, id(11), true)).toBeNull()
      expect(await claim(secret)).toBeNull()
      expect(
        await submit(secret, op, [Buffer.from([255, 216, 255, 217]).toString('base64')]),
      ).toBeNull()
      await db.exec('reset role')
      expect(
        await value('select count(*)::int value from app_private.intervention_image_budget'),
      ).toBe(0)
      expect(await value('select photo_attempts value from app_private.intervention_invites')).toBe(
        1,
      )
    },
  )

  it('returns generic unavailable for replay when an already used scope is archived', async () => {
    const invite = await create(null)
    const secret = sha(invite.token)
    await service()
    await check(secret, op)
    const receipt = await submit(secret)
    expect(receipt).toBeTruthy()
    expect(await check(secret, op)).toMatchObject({ state: 'replay', receipt })
    await db.exec('reset role')
    await db.query('update public.clients set archived_at=now() where id=$1', [client])
    await service()
    expect(await check(secret, op)).toBeNull()
    expect(await submit(secret)).toBeNull()
  })

  it('preserves the existing explicit parent deletion contract without touching other tenants', async () => {
    const own = await create()
    await office(outsider)
    const external = await value<{ token: string }>(
      'select public.create_intervention_invite($1,$2,$3) value',
      [otherTenant, otherClient, otherCentre],
    )
    if (!external) throw new Error('Expected synthetic external invitation')
    const jpeg = Buffer.from([255, 216, 255, 217]).toString('base64')
    await service()
    for (const invitation of [own, external]) {
      await check(sha(invitation.token), op, true)
      expect(await claim(sha(invitation.token))).toBe(true)
      expect(await submit(sha(invitation.token), op, [jpeg])).toBeTruthy()
    }
    await db.exec('reset role')
    await db.query('delete from public.clients where id=$1 and tenant_id=$2', [client, tenant])
    for (const table of ['intervention_invites', 'intervention_requests', 'intervention_photos']) {
      expect((await db.query(`select tenant_id from app_private.${table}`)).rows).toEqual([
        { tenant_id: otherTenant },
      ])
    }
  })

  it('validates photos atomically, then authorizes only the correct office to read or review', async () => {
    const invite = await create()
    const secret = sha(invite.token)
    await service()
    await check(secret, op, true)
    expect(await claim(secret)).toBe(true)
    await expect(
      submit(secret, op, [Buffer.from('not jpeg').toString('base64')]),
    ).rejects.toMatchObject({ code: '22023' })
    const jpeg = Buffer.from([255, 216, 255, 217]).toString('base64')
    expect(await submit(secret, op, [jpeg])).toBeTruthy()
    await office()
    const photo = (await list())?.[0]?.request?.photo_ids[0]
    expect(await value('select public.read_intervention_photo($1,$2) value', [tenant, photo])).toBe(
      jpeg,
    )
    await office(outsider)
    await expect(
      value('select public.read_intervention_photo($1,$2) value', [tenant, photo]),
    ).rejects.toEqual(denied)
    expect(
      await value('select public.read_intervention_photo($1,$2) value', [otherTenant, photo]),
    ).toBeNull()
    await office()
    await db.query("select public.update_intervention_intake($1,$2,'reviewed')", [
      tenant,
      invite.id,
    ])
    expect((await list())?.[0]?.request).toMatchObject({ status: 'reviewed' })
  })
})
