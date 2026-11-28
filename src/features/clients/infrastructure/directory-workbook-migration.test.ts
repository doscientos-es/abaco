import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const archived = id(3)
const outside = id(4)
const actor = id(5)
const existing = id(6)

describe('workbook directory migration', () => {
  const db = new PGlite()
  async function write(
    target: 'client' | 'location',
    key: string,
    values: Record<string, string>,
    parent?: string,
    ns = 'crm-demo',
  ) {
    return (
      await db.query<{ result: { status: string; id?: string } }>(
        'select public.import_directory_workbook_row($1,$2,$3,$4,$5,$6::jsonb) as result',
        [tenant, ns, key, target, parent ?? null, JSON.stringify(values)],
      )
    ).rows[0]?.result
  }
  const client = {
    name: 'Empresa ficticia',
    taxId: 'DEMO-33',
    email: 'a@example.test',
    kind: 'business',
  }
  const location = {
    name: 'Centro ficticio',
    address: 'Calle Ejemplo 2',
    city: 'Mataró',
    postalCode: '08301',
  }
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      revoke all on schema app_private from public, anon, authenticated;
      create type public.app_role as enum ('owner','admin','editor','user');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('demo.user',true),'')::uuid $$;
      create function public.has_role(target uuid, roles public.app_role[]) returns boolean language sql as $$
        select target::text=current_setting('demo.tenant',true)
          and nullif(current_setting('demo.role',true),'')::public.app_role=any(roles) $$;
      create function public.tenant_can_write(uuid) returns boolean language sql as $$ select current_setting('demo.write',true)='yes' $$;
      create function public.company_onboarding_allows_workspace(uuid) returns boolean language sql as $$ select current_setting('demo.workspace',true)='yes' $$;
      create table public.client_types(tenant_id uuid, value text, primary key(tenant_id,value));
      create table public.clients(id uuid default gen_random_uuid() primary key, tenant_id uuid, name text,
        tax_id text, email text, kind text, archived_at timestamptz, unique(id,tenant_id),
        foreign key(tenant_id,kind) references public.client_types(tenant_id,value));
      create table public.service_locations(id uuid default gen_random_uuid() primary key, tenant_id uuid, client_id uuid,
        name text, address text, city text, postal_code text, unique(id,tenant_id,client_id),
        foreign key(client_id,tenant_id) references public.clients(id,tenant_id));
      insert into public.client_types values ('${tenant}','business'),('${otherTenant}','business');
      insert into public.clients values
        ('${archived}','${tenant}','Antiguo ficticio','ES-DEMO-1','old@example.test','business',now()),
        ('${outside}','${otherTenant}','Fuera ficticio','','outside@example.test','business',null),
        ('${existing}','${tenant}','Cliente elegido','','chosen@example.test','business',null);
      select set_config('demo.user','${actor}',false), set_config('demo.tenant','${tenant}',false),
        set_config('demo.role','admin',false),set_config('demo.write','yes',false),set_config('demo.workspace','yes',false);
    `)
    await db.exec(
      await readFile(
        new URL(
          '../../../../supabase/migrations/20261128150837_directory_workbook_identity.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await db.exec('set role authenticated')
  }, 30000)
  afterAll(async () => db.close())

  it('rejects anonymous, non-admin, unavailable workspace, direct registry writes and other-tenant parent', async () => {
    await db.exec('reset role; set role anon')
    await expect(write('client', 'C-1', client)).rejects.toMatchObject({ code: '42501' })
    await db.exec("reset role; set role authenticated; select set_config('demo.role','user',false)")
    await expect(write('client', 'C-1', client)).rejects.toMatchObject({ code: '42501' })
    await db.exec("select set_config('demo.role','editor',false)")
    await expect(write('client', 'C-1', client)).rejects.toMatchObject({ code: '42501' })
    await db.exec(
      "select set_config('demo.role','admin',false),set_config('demo.workspace','no',false)",
    )
    await expect(write('client', 'C-1', client)).rejects.toMatchObject({ code: '42501' })
    await db.exec("select set_config('demo.workspace','yes',false)")
    await expect(
      db.exec('delete from public.directory_workbook_client_keys'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(write('location', 'x-1', location, outside)).resolves.toEqual({
      status: 'invalid_parent',
    })
    await expect(write('location', 'x-1', location, archived)).resolves.toEqual({
      status: 'invalid_parent',
    })
  })

  it('allows a legacy owner without widening writes to editors or users', async () => {
    await db.exec("select set_config('demo.role','owner',false)")
    await expect(
      write('client', 'old-collision', { ...client, taxId: 'es demo 1' }),
    ).resolves.toEqual({ status: 'collision' })
    expect(
      (await db.query('select source_key from public.directory_workbook_client_keys')).rows,
    ).toEqual([])
    await db.exec("select set_config('demo.role','admin',false)")
  })

  it('rejects collisions including archived customers, inserts once, and does not update a repeated external ID', async () => {
    await expect(write('client', 'legacy', { ...client, taxId: 'es demo 1' })).resolves.toEqual({
      status: 'collision',
    })
    const created = await write('client', 'C-1', client)
    expect(created).toMatchObject({ status: 'created', id: expect.any(String) })
    await expect(write('client', 'c-1', { ...client, name: 'No sobrescribir' })).resolves.toEqual({
      status: 'repeated',
    })
    await expect(write('client', 'c-2', client, undefined, 'another-source')).resolves.toEqual({
      status: 'collision',
    })
    const { rows } = await db.query(
      'select source_key, tenant_id, created_by from public.directory_workbook_client_keys',
    )
    expect(rows).toEqual([{ source_key: 'c-1', tenant_id: tenant, created_by: actor }])
    await db.exec("select set_config('demo.tenant','40000000-0000-4000-8000-000000000002',false)")
    expect(
      (await db.query('select source_key from public.directory_workbook_client_keys')).rows,
    ).toEqual([])
    await db.exec(`select set_config('demo.tenant','${tenant}',false)`)
    await db.exec('reset role')
    expect(
      (await db.query('select name from public.clients where id=$1', [created?.id])).rows,
    ).toEqual([{ name: client.name }])
    await db.exec('set role authenticated')
  })

  it('isolates centre identity under its parent and refuses address or name collisions', async () => {
    const clientResult = await write('client', 'c-3', {
      ...client,
      name: 'Otro cliente',
      email: 'b@example.test',
      taxId: 'XX-55',
    })
    if (!clientResult?.id) throw new Error('Missing client id')
    await expect(write('location', 'z-1', location, existing)).resolves.toMatchObject({
      status: 'created',
    })
    await expect(
      write('location', 'Z-1', { ...location, address: 'No reescribir' }, existing),
    ).resolves.toEqual({ status: 'repeated' })
    await expect(
      write('location', 'z-2', { ...location, name: 'Nombre nuevo' }, existing),
    ).resolves.toEqual({ status: 'collision' })
    await expect(write('location', 'z-1', location, clientResult.id)).resolves.toMatchObject({
      status: 'created',
    })
    const rows = await db.query(
      'select source_key,client_id from public.directory_workbook_location_keys order by client_id',
    )
    expect(rows.rows).toHaveLength(2)
  })
})
