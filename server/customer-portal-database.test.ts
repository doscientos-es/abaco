import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const uuid = (n: number) => `da800000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = uuid(1)
const foreign = uuid(2)
const admin = uuid(3)
const technician = uuid(4)
const client = uuid(5)
const otherClient = uuid(6)
const foreignClient = uuid(7)
const first = uuid(10)
const past = uuid(11)
const other = uuid(12)
const cross = uuid(13)
const closed = uuid(14)
const unselected = uuid(15)
const document = uuid(20)
const mismatchedSnapshot = uuid(21)
const foreignDocument = uuid(22)
const digest = 'a'.repeat(64)

const sql = (name: string, types: string) => `select public.${name}(${types}) as result`

describe('customer portal database grants', () => {
  const db = new PGlite()
  const preview = (company = tenant, customer = client) =>
    db.query<{
      result: {
        clientActive: boolean
        visits: { id: string }[]
        documents: { id: string }[]
        activeLinks: object[]
      }
    }>(sql('list_client_portal_options', '$1,$2'), [company, customer])
  const create = (visits: string[] = [first], documents: string[] = [document], hash = digest) =>
    db.query<{ result: { id: string; createdAt: string; expiresAt: string } }>(
      sql('create_client_portal_grant', '$1,$2,$3,$4::uuid[],$5::uuid[]'),
      [tenant, client, hash, visits, documents],
    )
  const read = (hash = digest) =>
    db.query<{ result: { visits: { status: string }[]; documents: object[] } | null }>(
      sql('read_client_portal_grant', '$1'),
      [hash],
    )
  const revoke = (id: string | undefined, company = tenant, customer = client) =>
    db.query<{ result: boolean }>(sql('revoke_client_portal_grant', '$1,$2,$3'), [
      company,
      customer,
      id,
    ])
  async function as(role: 'authenticated' | 'service_role' | 'anon', actor = '') {
    await db.exec(`reset role; set role ${role}`)
    await db.query("select set_config('request.user_id',$1,false)", [actor])
  }

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema app_private;
      revoke all on schema app_private from public, anon, authenticated, service_role;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
      create type public.app_role as enum ('owner','admin','editor','viewer','technician','user');
      create table clients(id uuid, tenant_id uuid, notes text, archived_at timestamptz, primary key(id,tenant_id));
      create table service_locations(id uuid, tenant_id uuid, client_id uuid, timezone text);
      create table service_visits(id uuid, tenant_id uuid, client_id uuid, location_id uuid,
        title text, scheduled_start_at timestamptz, scheduled_end_at timestamptz, status text);
      create table service_visit_report_versions(id uuid, tenant_id uuid, visit_id uuid,
        closed_at timestamptz, version int, snapshot jsonb);
      create table entitlement_fixture(tenant_id uuid, writable boolean);
      create function public.has_role(p_tenant uuid,p_roles public.app_role[]) returns boolean
        language sql stable as
        $$select (p_tenant='${tenant}'::uuid and auth.uid()='${admin}'::uuid and 'owner'=any(p_roles)) or
          (p_tenant='${tenant}'::uuid and auth.uid()='${technician}'::uuid and 'technician'=any(p_roles))$$;
      create function public.tenant_can_write(p_tenant uuid) returns boolean language sql stable as
        $$select writable from public.entitlement_fixture where tenant_id=p_tenant$$;
      insert into clients(id,tenant_id,notes) values
        ('${client}','${tenant}','private-client-note'),
        ('${otherClient}','${tenant}','private-other-client-note'),
        ('${foreignClient}','${foreign}','private-foreign-note');
      insert into entitlement_fixture values ('${tenant}',true);
      insert into service_visits values
        ('${first}','${tenant}','${client}',null,'internal-first',now()+interval '1 hour',now()+interval '2 hours','scheduled'),
        ('${past}','${tenant}','${client}',null,'internal-past',now()-interval '4 hours',now()-interval '3 hours','scheduled'),
        ('${other}','${tenant}','${otherClient}',null,'other-client',now()+interval '1 hour',now()+interval '2 hours','scheduled'),
        ('${cross}','${foreign}','${foreignClient}',null,'other-company',now()+interval '1 hour',now()+interval '2 hours','scheduled'),
        ('${closed}','${tenant}','${client}',null,'internal-closed',now()-interval '4 hours',now()-interval '3 hours','completed'),
        ('${unselected}','${tenant}','${client}',null,'internal-not-shared',now()+interval '1 day',now()+interval '25 hours','scheduled');
      insert into service_visit_report_versions values
        ('${document}','${tenant}','${closed}',now()-interval '2 hours',1,
          '{"client":{"id":"${client}","address":"private-address"},"report":{"data":{"notes":"private-notes","checklist":[{"label":"private-check","done":true},{"done":false},{"done":"true"}]}},"photos":[{"storage_path":"private/storage"}]}'),
        ('${mismatchedSnapshot}','${tenant}','${closed}',now()-interval '2 hours',2,
          '{"client":{"id":"${otherClient}"}}'),
        ('${foreignDocument}','${foreign}','${cross}',now()-interval '2 hours',1,
          '{"client":{"id":"${foreignClient}"}}');
      create temp table original_portal_snapshots as select id, snapshot from service_visit_report_versions;
    `)
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20261128155942_client_portal_grants.sql', import.meta.url),
        'utf8',
      ),
    )
  })

  beforeEach(async () => {
    await db.exec(`reset role; truncate app_private.client_portal_grants;
      update entitlement_fixture set writable=true;
      update clients set archived_at = null;
      update service_visit_report_versions r set snapshot = o.snapshot
        from original_portal_snapshots o where r.id = o.id;
      update service_visits set status='scheduled' where id='${first}'`)
    await as('authenticated', admin)
  })

  afterAll(async () => db.close())

  it('offers only relevant upcoming visits and closed versions to the actual office role', async () => {
    const options = (await preview()).rows[0]?.result
    expect(options?.visits.map(({ id }) => id)).toEqual([first, unselected])
    expect(options?.documents.map(({ id }) => id)).toEqual([document])
    expect(options?.activeLinks).toEqual([])
    await expect(preview(tenant, foreignClient)).rejects.toMatchObject({ code: '42501' })
    await expect(preview(foreign, foreignClient)).rejects.toMatchObject({ code: '42501' })
    await as('authenticated', technician)
    await expect(preview()).rejects.toMatchObject({ code: '42501' })
    await expect(create()).rejects.toMatchObject({ code: '42501' })
    await expect(revoke(uuid(80))).rejects.toMatchObject({ code: '42501' })
    await as('anon')
    await expect(preview()).rejects.toMatchObject({ code: '42501' })
    await expect(read()).rejects.toMatchObject({ code: '42501' })
  })

  it('rejects crossing scope, mismatched versions, past rows and invented/duplicate selections', async () => {
    for (const visit of [past, other, cross, uuid(99)]) {
      await expect(create([visit], [])).rejects.toMatchObject({ code: '22023' })
    }
    for (const version of [mismatchedSnapshot, foreignDocument]) {
      await expect(create([], [version])).rejects.toMatchObject({ code: '22023' })
    }
    await expect(create([first, first], [])).rejects.toMatchObject({ code: '22023' })
    await expect(create([], [])).rejects.toMatchObject({ code: '22023' })
    await expect(create([first], [], 'invalid')).rejects.toMatchObject({ code: '22023' })
  })

  it('projects only selected upcoming status/slots and the exact anonymous closed summary', async () => {
    const grant = (await create()).rows[0]?.result
    expect(grant).toBeDefined()
    expect(Date.parse(grant?.expiresAt ?? '') - Date.parse(grant?.createdAt ?? '')).toBe(86_400_000)
    expect((await preview()).rows[0]?.result.activeLinks).toHaveLength(1)
    await expect(read()).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('select * from app_private.client_portal_grants')).rejects.toMatchObject({
      code: '42501',
    })
    await as('service_role')
    await expect(db.query('select * from app_private.client_portal_grants')).rejects.toMatchObject({
      code: '42501',
    })
    const model = (await read()).rows[0]?.result
    expect(model).toEqual({
      expiresAt: grant?.expiresAt,
      visits: [
        {
          startsAt: expect.any(String),
          endsAt: expect.any(String),
          status: 'scheduled',
          timezone: 'Europe/Madrid',
        },
      ],
      documents: [{ closedAt: expect.any(String), version: 1, checksTotal: 3, checksDone: 1 }],
    })
    expect(JSON.stringify(model)).not.toMatch(/internal|private|token|tenant|client|storage|\.pdf/)
    expect((await read('b'.repeat(64))).rows[0]?.result).toBeNull()
    expect((await read('short credential')).rows[0]?.result).toBeNull()
  })

  it('updates selected upcoming time/status without refreshing the frozen document', async () => {
    await create()
    await as('service_role')
    const start = (await read()).rows[0]?.result
    await db.exec(`reset role;
      update service_visits set status='in_progress' where id='${first}';
      update service_visit_report_versions set snapshot='{}' where id='${document}'`)
    await as('service_role')
    expect((await read()).rows[0]?.result?.visits[0]?.status).toBe('in_progress')
    expect((await read()).rows[0]?.result?.documents).toEqual(start?.documents)
    await db.exec(`reset role; update service_visits set status='completed' where id='${first}'`)
    await as('service_role')
    expect((await read()).rows[0]?.result?.visits).toEqual([])
  })

  it('revokes within the same scope even after write entitlement changes', async () => {
    const grant = (await create()).rows[0]?.result
    expect((await revoke(grant?.id, tenant, otherClient)).rows[0]?.result).toBe(false)
    await db.exec(`reset role; update entitlement_fixture set writable=false`)
    await as('authenticated', admin)
    await expect(create([first], [], 'b'.repeat(64))).rejects.toMatchObject({ code: '42501' })
    expect((await revoke(grant?.id)).rows[0]?.result).toBe(true)
    expect((await preview()).rows[0]?.result.activeLinks).toEqual([])
    await as('service_role')
    expect((await read()).rows[0]?.result).toBeNull()
  })

  it('blocks new and existing access for archived clients but still allows revoke', async () => {
    const grant = (await create()).rows[0]?.result
    await db.exec(`reset role; update clients set archived_at = now() where id='${client}'`)
    await as('authenticated', admin)
    const options = (await preview()).rows[0]?.result
    expect(options).toMatchObject({
      clientActive: false,
      visits: [],
      documents: [],
      activeLinks: [{ ...grant, blockedAt: expect.any(String) }],
    })
    await expect(create([first], [], 'b'.repeat(64))).rejects.toMatchObject({ code: '42501' })
    await as('service_role')
    expect((await read()).rows[0]?.result).toBeNull()
    await db.exec('reset role')
    expect(
      (
        await db.query(
          'select visit_ids, documents, revoked_at from app_private.client_portal_grants',
        )
      ).rows,
    ).toEqual([{ visit_ids: [], documents: [], revoked_at: null }])
    await db.exec(`update clients set archived_at = null where id='${client}'`)
    await as('service_role')
    expect((await read()).rows[0]?.result).toBeNull()
    await as('authenticated', admin)
    await create([first], [], 'b'.repeat(64))
    await db.exec(`reset role; update clients set archived_at = now() where id='${client}'`)
    await as('authenticated', admin)
    expect((await revoke(grant?.id)).rows[0]?.result).toBe(true)
    await db.exec(`reset role; update clients set archived_at = null where id='${client}'`)
    await as('authenticated', admin)
    await create([first], [], 'c'.repeat(64))
    await as('service_role')
    expect((await read()).rows[0]?.result).toBeNull()
    expect((await read('c'.repeat(64))).rows[0]?.result?.visits).toHaveLength(1)
  })

  it('retains expired audit metadata when creating a later grant', async () => {
    const original = (await create()).rows[0]?.result
    await db.exec(`reset role; update app_private.client_portal_grants
      set created_at = now()-interval '8 days', expires_at = now()-interval '7 days'`)
    await as('authenticated', admin)
    await create([first], [], 'b'.repeat(64))
    await db.exec('reset role')
    expect((await db.query('select id from app_private.client_portal_grants')).rows).toContainEqual(
      { id: original?.id },
    )
  })

  it('fails closed after expiry and bounds active links', async () => {
    for (const char of ['a', 'b', 'c', 'd', 'e']) await create([first], [], char.repeat(64))
    await expect(create([first], [], 'f'.repeat(64))).rejects.toMatchObject({ code: '54000' })
    await db.exec(
      "reset role; update app_private.client_portal_grants set created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'",
    )
    await as('service_role')
    expect((await read()).rows[0]?.result).toBeNull()
  })
})
