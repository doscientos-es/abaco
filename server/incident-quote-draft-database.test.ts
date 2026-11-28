import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const id = (n: number) => `77000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const client = id(3)
const otherClient = id(4)
const centre = id(5)
const otherCentre = id(6)
const finding = id(7)
const visit = id(8)
const wrongVisit = id(9)
const chosen = id(10)
const notChosen = id(11)
const wrongPhoto = id(12)
const office = id(13)
const worker = id(14)
const outsider = id(15)
const operation = id(50)
const version = '2026-11-28T14:10:00Z'
const code = (value: string) => expect.objectContaining({ code: value })

describe('DEV-77 approved draft-only finding conversion', () => {
  const db = new PGlite()
  const identity = (actor: string) =>
    db.query("select set_config('request.user_id',$1,false)", [actor])
  const review = (tenantId = tenant, incidentId = finding) =>
    db.query<{ value: unknown }>('select public.get_incident_quote_review($1,$2) value', [
      tenantId,
      incidentId,
    ])
  const create = async ({
    customer = client,
    place = centre,
    lastEdit = version,
    photos = [chosen],
    op = operation,
    title = 'Reparar la unidad',
    entries = ['Revisar el equipo'],
    tenantId = tenant,
  }: {
    customer?: string
    place?: string | null
    lastEdit?: string
    photos?: string[]
    op?: string
    title?: string
    entries?: unknown
    tenantId?: string
  } = {}) => {
    const result = await db.query<{ value: string }>(
      'select public.create_incident_quote_draft($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9) value',
      [tenantId, finding, customer, place, lastEdit, title, JSON.stringify(entries), photos, op],
    )
    const resultId = result.rows[0]?.value
    if (!resultId) throw new Error('No estimate ID')
    return resultId
  }
  const context = async (estimateId: string, tenantId = tenant) =>
    (
      await db.query<{ value: unknown }>(
        'select public.get_incident_quote_draft_context($1,$2) value',
        [tenantId, estimateId],
      )
    ).rows[0]?.value
  const migration = (slug: string) =>
    readFile(new URL(`../supabase/migrations/${slug}.sql`, import.meta.url), 'utf8')

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create table auth.users(id uuid primary key);
      create type public.app_role as enum ('owner','admin','editor','user','technician');
      create table public.tenants(id uuid primary key, writable boolean default true,
        default_vat_rate numeric default 21, default_deposit_percent numeric default 30);
      create table public.memberships(tenant_id uuid,user_id uuid,role public.app_role);
      create table public.clients(id uuid primary key, tenant_id uuid,name text,archived_at timestamptz);
      create table public.service_locations(id uuid primary key,tenant_id uuid,client_id uuid,
        name text,address text,timezone text,active boolean default true);
      create table public.service_assets(id uuid primary key,tenant_id uuid,name text,kind text,status text);
      create table public.service_visits(id uuid primary key,tenant_id uuid,client_id uuid,location_id uuid,
        unique(id,tenant_id));
      create table public.service_visit_photos(id uuid primary key,tenant_id uuid,visit_id uuid,
        storage_path text,caption text,phase text,created_at timestamptz default now());
      create table public.service_incidents(id uuid primary key,tenant_id uuid,client_id uuid,
        location_id uuid,asset_id uuid,source_visit_id uuid,title text,status text,updated_at timestamptz,
        assigned_user_id uuid,description text,priority text,unique(id,tenant_id));
      create table public.estimates(id uuid primary key default gen_random_uuid(),tenant_id uuid,
        client_id uuid,title text,vat_rate numeric,valid_until date,status text default 'draft',unique(id,tenant_id));
      create table public.estimate_milestones(tenant_id uuid,estimate_id uuid,position integer,label text,percent numeric);
      create table public.estimate_lines(tenant_id uuid,estimate_id uuid,position integer,
        description text,kind text,unit text,quantity numeric,unit_price_cents bigint);
      create table public.work_orders(id uuid primary key,tenant_id uuid,unique(id,tenant_id));
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.user_id',true),'')::uuid $$;
      create function public.has_role(t uuid, roles public.app_role[]) returns boolean
      language sql stable security definer set search_path='' as $$
        select m.role=any(roles) from public.memberships m where m.tenant_id=t and m.user_id=(select auth.uid())
      $$;
      create function public.tenant_can_write(t uuid) returns boolean
      language sql stable security definer set search_path='' as $$
        select v.writable from public.tenants v where id=t
      $$;
      create function public.reject_work_history_change() returns trigger
      language plpgsql as $$begin raise exception 'Historial inmutable'; end$$;
    `)
    await db.exec(await migration('20261027143931_incident_conversions'))
    await db.exec(await migration('20261128154604_incident_quote_drafts'))
  }, 30000)

  beforeEach(async () => {
    await db.exec(`reset role; truncate app_private.incident_quote_reviews,
      public.service_incident_conversions,public.service_incidents,public.service_visit_photos,
      public.service_visits,public.estimates,public.estimate_lines,public.estimate_milestones,
      public.tenants,auth.users,public.clients,public.memberships,public.service_locations,public.work_orders;`)
    await db.query('insert into public.tenants(id) values ($1),($2)', [tenant, otherTenant])
    await db.query('insert into auth.users(id) values ($1),($2),($3)', [office, worker, outsider])
    await db.query(
      `insert into public.memberships values ($1,$3,'admin'),($1,$4,'user'),($2,$5,'admin')`,
      [tenant, otherTenant, office, worker, outsider],
    )
    await db.query(
      `insert into public.clients values ($1,$3,'Cliente local',null),($2,$4,'Cliente externo',null)`,
      [client, otherClient, tenant, otherTenant],
    )
    await db.query(
      `insert into public.service_locations(id,tenant_id,client_id,name,address)
      values ($1,$3,$5,'Centro original','Calle 1'),($2,$4,$6,'Centro externo','Calle 2')`,
      [centre, otherCentre, tenant, otherTenant, client, otherClient],
    )
    await db.query('insert into public.service_visits values ($1,$3,$4,$5),($2,$3,$4,$5)', [
      visit,
      wrongVisit,
      tenant,
      client,
      centre,
    ])
    await db.query(
      `insert into public.service_visit_photos(id,tenant_id,visit_id,storage_path,caption,phase)
      values ($1,$4,$5,'private/selected','Foto elegida','before'),
        ($2,$4,$5,'private/not-selected','Foto no elegida','other'),
        ($3,$4,$6,'private/wrong','Otra visita','other')`,
      [chosen, notChosen, wrongPhoto, tenant, visit, wrongVisit],
    )
    await db.query(
      `insert into public.service_incidents(id,tenant_id,client_id,location_id,source_visit_id,
      title,status,updated_at,description)
      values ($1,$2,$3,$4,$5,'Título original','open',$6,'Diagnóstico privado no comercial')`,
      [finding, tenant, client, centre, visit, version],
    )
    await identity(office)
    await db.exec('set role authenticated')
  })

  afterAll(() => db.close())

  it('reviews client, exact centre and source photos without exposing storage; only explicit selection is referenced', async () => {
    const available = (await review()).rows[0]?.value
    expect(available).toMatchObject({
      client_id: client,
      centre_id: centre,
      photos: expect.arrayContaining([{ id: chosen, caption: 'Foto elegida', phase: 'before' }]),
    })
    expect(JSON.stringify(available)).not.toMatch(/private\/|Otra visita|Diagnóstico privado/)
    const estimate = await create()
    expect(await context(estimate)).toEqual({
      client_id: client,
      centre_id: centre,
      centre_name: 'Centro original',
      centre_address: 'Calle 1',
      visit_id: visit,
      photos: [{ id: chosen, caption: 'Foto elegida', phase: 'before' }],
    })
    await db.exec('reset role')
    const estimateRows = (await db.query('select * from public.estimates')).rows
    expect(estimateRows).toMatchObject([
      { id: estimate, title: 'Reparar la unidad', client_id: client, status: 'draft' },
    ])
    const lines = (await db.query('select description,unit_price_cents from public.estimate_lines'))
      .rows
    expect(lines).toEqual([{ description: 'Revisar el equipo', unit_price_cents: 0 }])
    expect(JSON.stringify([estimateRows, lines])).not.toMatch(
      /private\/|Foto elegida|Diagnóstico privado/,
    )
    expect(
      (
        await db.query<{ value: number }>(
          'select count(*) as value from public.estimate_milestones',
        )
      ).rows[0]?.value,
    ).toBe(3)
  })

  it('rejects stale context, wrong tenant/customer/site/photo, malformed lines and duplicate photos', async () => {
    await expect(create({ customer: otherClient })).rejects.toEqual(code('P0409'))
    await expect(create({ place: otherCentre })).rejects.toEqual(code('P0409'))
    await expect(create({ place: null })).rejects.toEqual(code('P0409'))
    await expect(create({ lastEdit: '2026-11-28T13:10:00Z' })).rejects.toEqual(code('P0409'))
    await expect(create({ photos: [wrongPhoto] })).rejects.toEqual(code('42501'))
    await expect(create({ photos: [chosen, chosen] })).rejects.toEqual(code('22023'))
    await expect(
      create({ entries: [{ description: 'Not reviewed', unit_price_cents: 100 }] }),
    ).rejects.toEqual(code('22023'))
    await expect(create({ entries: [] })).rejects.toEqual(code('22023'))
    await expect(create({ op: id(51), photos: [] })).resolves.toBeTruthy()
  })

  it('replays the same request and never rewrites existing drafts or changes from the editor', async () => {
    const quote = await create()
    await expect(create()).resolves.toBe(quote)
    await expect(create({ title: 'Different request' })).rejects.toEqual(code('23505'))
    await expect(create({ op: id(52) })).rejects.toEqual(code('P0409'))
    await db.exec('reset role')
    await db.query('update public.estimates set title=$1 where id=$2', ['Edición posterior', quote])
    await db.exec('set role authenticated')
    await expect(create()).resolves.toBe(quote)
    await db.exec('reset role')
    expect((await db.query('select title from public.estimates')).rows).toEqual([
      { title: 'Edición posterior' },
    ])
  })

  it('does not retrofit an estimate produced by the old conversion path', async () => {
    await db.query(`select public.convert_service_incident($1,$2,'estimate',null,null,null,$3)`, [
      tenant,
      finding,
      operation,
    ])
    await expect(create()).rejects.toEqual(code('P0409'))
    await expect(create({ op: id(52) })).rejects.toEqual(code('P0409'))
    await db.exec('reset role')
    expect((await db.query('select * from app_private.incident_quote_reviews')).rows).toEqual([])
  })

  it('fails closed for non-office, cross-tenant, anon and disabled write; hides photos after client or status change', async () => {
    const quote = await create()
    await expect(context(quote, otherTenant)).rejects.toEqual(code('42501'))
    await identity(worker)
    await expect(review()).rejects.toEqual(code('42501'))
    await expect(context(quote)).rejects.toEqual(code('42501'))
    await expect(create()).rejects.toEqual(code('42501'))
    await identity(outsider)
    await expect(review()).rejects.toEqual(code('42501'))
    await db.exec('set role anon')
    await expect(context(quote)).rejects.toEqual(code('42501'))
    await db.exec('reset role')
    await db.query('update public.estimates set client_id=$1 where id=$2', [otherClient, quote])
    await db.query('update public.tenants set writable=null where id=$1', [tenant])
    await identity(office)
    await db.exec('set role authenticated')
    await expect(context(quote)).resolves.toBeNull()
    await expect(create()).rejects.toEqual(code('P0402'))
    await expect(db.query('select * from app_private.incident_quote_reviews')).rejects.toEqual(
      code('42501'),
    )
    await db.exec('reset role')
    await db.query("update public.estimates set client_id=$1,status='sent' where id=$2", [
      client,
      quote,
    ])
    await db.exec('set role authenticated')
    await expect(context(quote)).resolves.toBeNull()
  })
})
