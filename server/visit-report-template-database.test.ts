import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { VisitReportTemplate } from '../src/features/visits/domain/visit-report-templates'
import type { VisitReportData } from '../src/features/visits/infrastructure/visit-report-repository'

const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const otherTenant = id(2)
const office = id(3)
const worker = id(4)
const colleague = id(5)
const otherOffice = id(6)
const owner = id(7)
const first = id(8)
const second = id(9)
const closed = id(10)
const otherVisit = id(11)
const active = id(12)
const missing = id(13)
const initial = ['Revisar filtros', 'Verificar retorno']
const next = ['Versión nueva']
const code = (value: string) => expect.objectContaining({ code: value })

describe('DEV-70 private report template lifecycle', () => {
  const db = new PGlite()
  const identity = (actor: string) =>
    db.query("select set_config('request.user_id',$1,false)", [actor])
  const migration = (name: string) =>
    readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
  const list = async (company: string | null = tenant) =>
    (
      await db.query<{ data: VisitReportTemplate[] }>(
        'select public.list_visit_report_templates($1) data',
        [company],
      )
    ).rows[0]?.data ?? []
  const draft = (
    revision = 0,
    labels: unknown = initial,
    company = tenant,
    kind: string | null = 'hvac',
  ) =>
    db.query('select public.save_visit_report_template_draft($1,$2,$3,$4)', [
      company,
      kind,
      revision,
      JSON.stringify(labels),
    ])
  const publish = (revision = 1, company = tenant) =>
    db.query('select public.publish_visit_report_template($1,$2,$3)', [company, 'hvac', revision])
  const apply = (
    visit: string | null = first,
    version = 1,
    op: string | null = id(100),
    company = tenant,
  ) =>
    db.query('select public.apply_visit_report_template($1,$2,$3,$4,$5)', [
      company,
      visit,
      'hvac',
      version,
      op,
    ])
  const reportRows = () =>
    db.query<{ data: VisitReportData; revision: number; visit_id: string }>(
      'select data, revision, visit_id from public.service_visit_reports order by visit_id',
    )
  async function published() {
    await draft()
    await publish()
  }

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create type public.app_role as enum ('owner','admin','editor','technician','user','viewer');
      create table auth.users(id uuid primary key);
      create table public.tenants(id uuid primary key, writable boolean default true);
      create table public.memberships(tenant_id uuid, user_id uuid, role public.app_role,
        primary key(tenant_id,user_id));
      create table public.work_team_members(tenant_id uuid, team_id uuid, user_id uuid);
      create table public.service_visits(id uuid primary key, tenant_id uuid not null,
        assigned_user_id uuid, work_team_id uuid, status text, unique(id,tenant_id));
      create table public.service_visit_report_versions(visit_id uuid primary key, snapshot jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.user_id',true),'')::uuid
      $$;
      create function public.has_role(t uuid, roles public.app_role[]) returns boolean
      language sql stable security definer set search_path='' as $$
        select m.role=any(roles) from public.memberships m
          where m.tenant_id=t and m.user_id=(select auth.uid())
      $$;
      create function public.tenant_can_write(t uuid) returns boolean
      language sql stable security definer set search_path='' as $$
        select t0.writable from public.tenants t0 where t0.id=t
      $$;
      create function public.reject_work_history_change() returns trigger
      language plpgsql as $$begin raise exception 'Historial inmutable'; end$$;
    `)
    await db.exec(await migration('20261027143704_visit_report_drafts'))
    await db.exec(await migration('20261027144012_report_recommendations'))
    const rolesMigration = await migration('20261109143327_admin_user_roles')
    const roleStart = rolesMigration.indexOf('do $migration$')
    const roleEnd = rolesMigration.indexOf('$migration$;', roleStart + 3)
    expect(roleStart).toBeGreaterThan(0)
    expect(roleEnd).toBeGreaterThan(roleStart)
    await db.exec(rolesMigration.slice(roleStart, roleEnd + '$migration$;'.length))
    const teamPermissions = await migration('20261112115459_team_visit_permissions')
    const boundary = teamPermissions.indexOf('alter policy service_visits_select')
    expect(boundary).toBeGreaterThan(0)
    await db.exec(teamPermissions.slice(0, boundary))
    // Apply the repository's exact existing assignment predicate and expanded save
    // role gate. This does not mock report-write, revision or idempotency behavior.
    await db.exec(`
      alter policy service_visit_reports_select on public.service_visit_reports using (
        public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[])
        or public.can_access_assigned_visit(tenant_id, visit_id)
      );
      do $$declare definition text;
      begin
        select pg_get_functiondef('public.save_service_visit_report(uuid,uuid,bigint,jsonb,uuid)'::regprocedure)
          into definition;
        execute replace(definition, 'target.assigned_user_id = (select auth.uid())',
          'public.can_access_assigned_visit(p_tenant_id, p_visit_id)');
      end$$;
    `)
    await db.exec(await migration('20261128153000_visit_report_templates'))
  }, 30000)

  beforeEach(async () => {
    await db.exec(`
      reset role;
      truncate app_private.visit_report_template_use, app_private.visit_report_templates,
        public.service_visit_reports, public.service_visit_report_writes,
        public.service_visit_report_versions, public.service_visits,
        public.memberships, public.tenants, auth.users;
    `)
    await db.query('insert into public.tenants(id) values ($1),($2)', [tenant, otherTenant])
    await db.query('insert into auth.users values ($1),($2),($3),($4),($5)', [
      office,
      worker,
      colleague,
      otherOffice,
      owner,
    ])
    await db.query(
      `
      insert into public.memberships values ($1,$3,'admin'),($1,$4,'user'),
        ($1,$5,'technician'),($2,$6,'admin'),($1,$7,'owner')
    `,
      [tenant, otherTenant, office, worker, colleague, otherOffice, owner],
    )
    await db.query(
      `
      insert into public.service_visits (id,tenant_id,assigned_user_id,status) values
        ($1,$6,$8,'scheduled'),($2,$6,$9,'scheduled'),($3,$6,$8,'completed'),
        ($4,$7,$10,'scheduled'),($5,$6,$8,'in_progress')
    `,
      [
        first,
        second,
        closed,
        otherVisit,
        active,
        tenant,
        otherTenant,
        worker,
        colleague,
        otherOffice,
      ],
    )
    await db.query(
      'insert into public.service_visit_report_versions values ($1,\'{"legacy":true}\')',
      [closed],
    )
    await identity(office)
    await db.exec('set role authenticated')
  })

  afterAll(() => db.close())

  it('keeps app_private usage and table access off both Data API roles', async () => {
    await db.exec('reset role')
    const { rows } = await db.query(
      `select has_schema_privilege('authenticated','app_private','USAGE') as auth_schema,
        has_schema_privilege('anon','app_private','USAGE') as anon_schema,
        has_table_privilege('authenticated','app_private.visit_report_templates','SELECT') as auth_table,
        has_table_privilege('anon','app_private.visit_report_templates','SELECT') as anon_table,
        has_function_privilege('anon','public.list_visit_report_templates(uuid)','EXECUTE') as anon_rpc`,
    )
    expect(rows).toEqual([
      {
        auth_schema: false,
        anon_schema: false,
        auth_table: false,
        anon_table: false,
        anon_rpc: false,
      },
    ])
    await db.exec('set role authenticated')
    await expect(
      db.query('select app_private.list_visit_report_templates($1)', [tenant]),
    ).rejects.toEqual(code('42501'))
  })

  it('has no library or apply privileges for workers, outsiders, anon or unscoped sessions', async () => {
    await published()
    await expect(list(otherTenant)).rejects.toEqual(code('42501'))
    await expect(list(null)).rejects.toEqual(code('42501'))
    await expect(list(missing)).rejects.toEqual(code('42501'))
    await identity(worker)
    await expect(list()).rejects.toEqual(code('42501'))
    await expect(draft(1)).rejects.toEqual(code('42501'))
    await expect(publish()).rejects.toEqual(code('42501'))
    await expect(apply()).rejects.toEqual(code('42501'))
    await expect(db.query('select * from app_private.visit_report_templates')).rejects.toEqual(
      code('42501'),
    )
    await identity(otherOffice)
    await expect(apply()).rejects.toEqual(code('42501'))
    expect(await list(otherTenant)).toEqual([])
    await db.exec('set role anon')
    await expect(list(otherTenant)).rejects.toEqual(code('42501'))
  })

  it('keeps a saved draft separate until explicitly published and rejects stale edits', async () => {
    await identity(owner)
    await draft()
    await expect(apply()).rejects.toEqual(code('P0409'))
    await publish()
    await expect(publish()).resolves.toBeTruthy()
    await draft(1, next)
    await expect(draft(1)).rejects.toEqual(code('P0409'))
    await expect(publish(1)).rejects.toEqual(code('P0409'))
    expect(await list()).toEqual([
      {
        service_kind: 'hvac',
        draft_revision: 2,
        draft_labels: next,
        published_version: 1,
        published_labels: initial,
      },
    ])
    await apply()
    await publish(2)
    await expect(apply(second, 1, id(101))).rejects.toEqual(code('P0409'))
    await apply(second, 2, id(101))
    const rows = (await reportRows()).rows
    expect(rows.map((item) => item.data.checklist.map((check) => check.label))).toEqual([
      initial,
      next,
    ])
    expect(rows[0]?.data).toMatchObject({ notes: '', recommendations: '', next_actions: '' })
    expect(rows[0]?.data.checklist.every(({ done }) => done === false)).toBe(true)
  })

  it('rejects bad inputs and unavailable writes even if the role may read', async () => {
    await expect(draft(0, ['repetir', 'Repetir'])).rejects.toEqual(code('22023'))
    await expect(draft(0, ['\t'])).rejects.toEqual(code('22023'))
    await expect(draft(0, [{ label: 'Do not copy structured metadata' }])).rejects.toEqual(
      code('22023'),
    )
    await expect(draft(0, initial, tenant, null)).rejects.toEqual(code('22023'))
    await draft()
    await db.exec('reset role')
    await db.query('update public.tenants set writable=null where id=$1', [tenant])
    await db.exec('set role authenticated')
    await expect(list()).resolves.toHaveLength(1)
    await expect(publish()).rejects.toEqual(code('P0402'))
    await expect(apply()).rejects.toEqual(code('P0402'))
  })

  it('uses standard assigned-report RLS and detects an offline save racing with apply', async () => {
    await published()
    await apply()
    await identity(colleague)
    expect((await reportRows()).rows).toEqual([])
    await identity(worker)
    expect((await reportRows()).rows).toHaveLength(1)
    const save = (revision: number) =>
      db.query('select public.save_service_visit_report($1,$2,$3,$4,$5)', [
        tenant,
        first,
        revision,
        JSON.stringify({ notes: 'Resultado técnico', checklist: [] }),
        id(200),
      ])
    await expect(save(0)).rejects.toEqual(code('P0409'))
    await save(1)
    await identity(office)
    await apply()
    expect((await reportRows()).rows[0]?.data.notes).toBe('Resultado técnico')
    await expect(apply(first, 1, id(777))).rejects.toEqual(code('P0409'))
  })

  it('never replaces a manually saved, finished or in-progress visit report', async () => {
    await published()
    await db.query('select public.save_service_visit_report($1,$2,0,$3,$4)', [
      tenant,
      first,
      JSON.stringify({ notes: 'Ya existe', checklist: [] }),
      id(200),
    ])
    await expect(apply(first)).rejects.toEqual(code('P0409'))
    await expect(apply(closed)).rejects.toEqual(code('P0409'))
    await expect(apply(active)).rejects.toEqual(code('P0409'))
    await expect(apply(otherVisit)).rejects.toEqual(code('P0002'))
    await expect(apply(null)).rejects.toEqual(code('22023'))
    expect((await reportRows()).rows[0]?.data.notes).toBe('Ya existe')
    await db.exec('reset role')
    expect(
      (await db.query('select snapshot from public.service_visit_report_versions')).rows,
    ).toEqual([{ snapshot: { legacy: true } }])
  })
})
