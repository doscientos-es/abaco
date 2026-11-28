import { Badge, Button, ConfirmDialog, IconButton } from '@doscientos/ui'
import { UploadSimple, UserPlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import {
  assignableRoles,
  isRole,
  roleDescriptions,
  roleLabels,
  useSession,
  type Role,
} from '@/features/auth'
import { billingPreviewQuery } from '@/features/billing'
import {
  StaffMemberFunctionsDialog,
  staffFunctionsQuery,
  staffSchedulesQuery,
} from '@/features/staff-schedules'
import { WorkerVacationAllowance } from '@/features/vacations'
import { calendarColors, resolveCalendarColor } from '@/shared/domain/calendar-color'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import {
  changeMemberRole,
  inviteMember,
  loadTeamMembershipEmails,
  pendingTeamActivationsQuery,
  removeMember,
  setMemberCalendarColor,
  teamQuery,
  type TeamMember,
  type TeamResult,
} from '../application/team-actions'
import {
  MAX_WORKER_FIELD_LENGTH,
  validWorkerDni,
  validWorkerPhone,
} from '../domain/worker-personal-data'
import { PendingTeamActivations } from './pending-team-activations'
import { TeamImportDialog } from './team-import-dialog'
import { TeamPersonCard, TeamPersonDetails } from './team-person'
import { WorkerPersonalDataSection } from './worker-personal-data'
import { WorkerPhotoSettings } from './worker-photo-settings'

/** Members of the company. Only rendered for people allowed to manage the team. */
export function TeamSection({
  tenantId,
  mode = 'manage',
  memberIds,
  personId,
  showInviteLink = false,
}: {
  tenantId: string
  mode?: 'manage' | 'invite'
  memberIds?: string[] | undefined
  personId?: string | undefined
  showInviteLink?: boolean
}) {
  const inviting = mode === 'invite'
  const session = useSession()
  const queryClient = useQueryClient()
  const team = useQuery(teamQuery(tenantId))
  const functions = useQuery({ ...staffFunctionsQuery(tenantId), enabled: !inviting })
  const schedules = useQuery({ ...staffSchedulesQuery(tenantId), enabled: !inviting })
  const options = assignableRoles(session?.role)
  const plan = useQuery({
    ...billingPreviewQuery(tenantId),
    enabled: !inviting && session?.role === 'admin',
  })
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const actionLock = useActionLock()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [search, setSearch] = useState('')
  const [editingFunctions, setEditingFunctions] = useState<TeamMember | null>(null)
  const [dni, setDni] = useState('')
  const [phone, setPhone] = useState('')

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: teamQuery(tenantId).queryKey })
    await queryClient.invalidateQueries({
      queryKey: pendingTeamActivationsQuery(tenantId).queryKey,
    })
    await queryClient.invalidateQueries({ queryKey: ['work-teams', tenantId] })
    await queryClient.invalidateQueries({ queryKey: staffSchedulesQuery(tenantId).queryKey })
    await queryClient.invalidateQueries({ queryKey: ['staff-calendar-colors', tenantId] })
  }

  async function run(action: () => Promise<TeamResult>, success: string) {
    if (!actionLock.acquire()) return false
    setBusy(true)
    try {
      const result = await action()
      if (!result.ok) {
        setMessage(result.message)
        return false
      }
      const confirmation =
        result.status === 'added'
          ? 'Esa persona ya tenía cuenta: la hemos añadido al equipo.'
          : success
      try {
        await refresh()
        setMessage(confirmation)
      } catch {
        setMessage(`${confirmation} No se pudo actualizar la lista; recarga la página.`)
      }
      return true
    } catch {
      setMessage('No se pudo confirmar la operación. Revisa el equipo antes de reintentar.')
      return false
    } finally {
      actionLock.release()
      setBusy(false)
    }
  }

  const invite = async () => {
    const succeeded = await run(
      () =>
        inviteMember({
          tenantId,
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          dni: dni.trim(),
          phone: phone.trim(),
        }),
      'Invitación enviada por correo.',
    )
    if (succeeded) {
      setEmail('')
      setFullName('')
      setDni('')
      setPhone('')
      setRole('user')
      setInviteOpen(false)
    }
  }

  const matching = (team.data ?? []).filter(
    (member) =>
      (!memberIds || memberIds.includes(member.userId)) &&
      (!personId || member.userId === personId) &&
      fuzzySearch(search, member.fullName, member.email, roleLabels[member.role]),
  )
  const pager = usePagination(matching, `${tenantId}:${search}:${memberIds?.join(',') ?? ''}`, 25)

  return (
    <div className="space-y-6">
      {!inviting &&
      !memberIds &&
      !personId &&
      session?.role === 'admin' &&
      team.isSuccess &&
      (team.data?.length ?? 0) <= 1 &&
      (plan.data?.current?.seats ?? 0) > 1 ? (
        <section className="border-primary/20 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <h2 className="font-semibold">Importa tus primeros trabajadores</h2>
            <p className="text-muted-foreground text-sm">
              Usa tu Excel o CSV. Solo las personas a las que des acceso ocuparán plaza.
            </p>
          </div>
          <Button size="sm" variant="outline" onPress={() => setImportOpen(true)}>
            Importar desde Excel o CSV
          </Button>
        </section>
      ) : null}
      <section
        aria-labelledby="people-heading"
        className={inviting ? 'border-border bg-card rounded-lg border' : 'space-y-4'}
      >
        {inviting ? (
          <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b p-5">
            <div className="flex items-start gap-3">
              <span className="bg-primary/5 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <UsersThreeIcon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 id="people-heading" className="text-sm font-semibold">
                  Invitar personas
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <IconButton
                label="Importar personas"
                variant="outline"
                isDisabled={busy || !team.isSuccess}
                onPress={() => setImportOpen(true)}
              >
                <UploadSimple aria-hidden="true" className="size-4" />
              </IconButton>
              <Button
                aria-haspopup="dialog"
                aria-expanded={inviteOpen}
                isDisabled={busy}
                onPress={() => {
                  setMessage(null)
                  setInviteOpen(true)
                }}
              >
                <UserPlusIcon aria-hidden="true" />
                Invitar usuario
              </Button>
            </div>
          </div>
        ) : (
          <h2 id="people-heading" className="sr-only">
            {personId ? 'Datos de la persona' : 'Personas'}
          </h2>
        )}

        {!inviting && !personId && team.isSuccess ? (
          <div className="flex flex-wrap items-end gap-3">
            {team.data.length > 0 ? (
              <div className="min-w-0 flex-1">
                <TextField
                  label="Buscar personas"
                  value={search}
                  onChange={setSearch}
                  placeholder="Nombre, correo o rol"
                />
              </div>
            ) : null}
            <Badge variant="neutral">
              {matching.length} {matching.length === 1 ? 'persona' : 'personas'}
            </Badge>
            {showInviteLink ? (
              <>
                <IconButton
                  label="Importar personas"
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => setImportOpen(true)}
                >
                  <UploadSimple aria-hidden="true" className="size-4" />
                </IconButton>
                <Button
                  size="sm"
                  aria-haspopup="dialog"
                  aria-expanded={inviteOpen}
                  isDisabled={busy}
                  onPress={() => {
                    setMessage(null)
                    setInviteOpen(true)
                  }}
                >
                  <UserPlusIcon aria-hidden="true" />
                  Invitar personas
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {!inviting && (functions.isError || schedules.isError) ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron cargar las funciones del equipo. Recarga la página para editarlas.
          </p>
        ) : null}
        {!inviting ? (
          <ul className={personId ? '' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'}>
            {pager.pageItems.map((member) => {
              const isMe = member.userId === session?.userId
              const editable = !isMe && options.includes(member.role)
              const schedule = schedules.data?.find((item) => item.userId === member.userId)
              const assigned =
                functions.data?.filter((item) => schedule?.functionIds.includes(item.id)) ?? []
              const functionNames =
                functions.isSuccess && schedules.isSuccess
                  ? assigned.map((item) => item.name)
                  : null
              return personId ? (
                <li key={member.userId}>
                  <TeamPersonDetails
                    member={member}
                    isMe={isMe}
                    editable={editable}
                    options={options}
                    functions={functionNames}
                    busy={busy}
                    onEditFunctions={() => setEditingFunctions(member)}
                    onChangeRole={(value) =>
                      void run(
                        () => changeMemberRole(tenantId, member.userId, value),
                        'Rol actualizado.',
                      )
                    }
                    onRemove={() => setRemoving(member)}
                  />
                  <div className="border-border bg-card mt-5 rounded-xl border p-4">
                    <WorkerPhotoSettings
                      userId={member.userId}
                      name={member.fullName || member.email}
                    />
                  </div>
                  <fieldset
                    className="border-border bg-card mt-5 rounded-xl border p-4"
                    disabled={busy}
                  >
                    <legend className="px-1 text-sm font-semibold">Color en el horario</legend>
                    <p className="text-muted-foreground mb-3 text-sm">
                      Identifica a esta persona en el calendario del equipo.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {calendarColors.map((color) => (
                        <label
                          key={color.id}
                          className="focus-within:ring-ring flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-within:ring-2"
                        >
                          <input
                            type="radio"
                            name={`calendar-color-${member.userId}`}
                            value={color.id}
                            checked={
                              resolveCalendarColor(member.userId, member.calendarColor) === color.id
                            }
                            onChange={() =>
                              void run(
                                () => setMemberCalendarColor(tenantId, member.userId, color.id),
                                'Color actualizado.',
                              )
                            }
                          />
                          <span
                            aria-hidden="true"
                            className="size-4 rounded-full"
                            style={{ backgroundColor: color.swatch }}
                          />
                          {color.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="mt-5">
                    <WorkerPersonalDataSection tenantId={tenantId} workerId={member.userId} />
                  </div>
                  <div className="mt-5">
                    <WorkerVacationAllowance tenantId={tenantId} workerId={member.userId} />
                  </div>
                </li>
              ) : (
                <TeamPersonCard
                  key={member.userId}
                  member={member}
                  isMe={isMe}
                  functions={functionNames}
                />
              )
            })}
            {team.isError ? (
              <li className="text-destructive text-sm">No se pudo cargar el equipo.</li>
            ) : null}
            {team.isPending ? (
              <li className="text-muted-foreground text-sm">Cargando personas…</li>
            ) : null}
            {team.isSuccess && team.data.length === 0 ? (
              <li className="text-muted-foreground text-sm">
                Todavía no hay personas en el equipo.
              </li>
            ) : null}
            {team.isSuccess && team.data.length > 0 && matching.length === 0 ? (
              <li className="text-muted-foreground text-sm">
                No hay personas que coincidan con la búsqueda.
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="px-5 py-4">
            <Link to="/trabajadores" className="text-primary text-sm font-medium hover:underline">
              Ir a Trabajadores →
            </Link>
          </div>
        )}
        {!inviting && !personId && matching.length > 10 ? (
          <TablePagination controller={pager} noun="personas" />
        ) : null}

        {!inviting && !personId && showInviteLink && team.isSuccess ? (
          <PendingTeamActivations tenantId={tenantId} members={team.data} />
        ) : null}

        {inviting && team.isError ? (
          <p role="alert" className="text-destructive px-5 pb-4 text-sm">
            No se pudieron comprobar las personas existentes. La importación no está disponible;
            recarga la página para reintentar.
          </p>
        ) : null}

        {!inviteOpen && message ? (
          <output
            aria-live="polite"
            className={
              inviting
                ? 'text-muted-foreground block px-5 pb-4 text-sm'
                : 'text-muted-foreground block text-sm'
            }
          >
            {message}
          </output>
        ) : null}
      </section>
      {editingFunctions && functions.isSuccess && schedules.isSuccess ? (
        <StaffMemberFunctionsDialog
          key={editingFunctions.userId}
          tenantId={tenantId}
          person={{
            userId: editingFunctions.userId,
            name: editingFunctions.fullName || editingFunctions.email,
            schedule:
              schedules.data.find((item) => item.userId === editingFunctions.userId) ?? null,
          }}
          functions={functions.data}
          onClose={() => setEditingFunctions(null)}
        />
      ) : null}
      <FormDialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open)
          if (!open) {
            setEmail('')
            setFullName('')
            setDni('')
            setPhone('')
            setRole('user')
            setMessage(null)
          }
        }}
        title="Invitar a una persona"
        description="Enviaremos una invitación por correo. Si ya tiene cuenta, se añadirá al equipo."
        submitLabel={busy ? 'Enviando…' : 'Enviar invitación'}
        submitDisabled={
          email.trim().length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
          !validWorkerDni(dni) ||
          !validWorkerPhone(phone) ||
          (fullName.trim() !== '' && (fullName.trim().length < 2 || fullName.trim().length > 120))
        }
        isSubmitting={busy}
        isDirty={Boolean(email || fullName || dni || phone || role !== 'user')}
        onSubmit={() => void invite()}
      >
        <TextField
          label="Nombre (opcional)"
          placeholder="Ana García"
          minLength={2}
          maxLength={120}
          icon={fieldIcons.user}
          value={fullName}
          onChange={setFullName}
        />
        <TextField
          label="Correo"
          type="email"
          placeholder="ana@empresa.es"
          maxLength={254}
          icon={fieldIcons.mail}
          value={email}
          onChange={setEmail}
        />
        <TextField
          label="DNI"
          placeholder="12345678Z"
          value={dni}
          onChange={setDni}
          maxLength={MAX_WORKER_FIELD_LENGTH}
          required
        />
        <TextField
          label="Teléfono (opcional)"
          type="tel"
          placeholder="600 123 456"
          value={phone}
          onChange={setPhone}
          maxLength={MAX_WORKER_FIELD_LENGTH}
        />
        <SelectField
          label="Rol"
          value={role}
          options={options.map((r) => ({ value: r, label: roleLabels[r] }))}
          onChange={(value) => isRole(value) && setRole(value)}
        />
        <p className="text-muted-foreground self-end text-xs leading-relaxed">
          {roleDescriptions[role]}
        </p>
        {message ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {message}
          </p>
        ) : null}
      </FormDialog>
      <TeamImportDialog
        key={tenantId}
        open={importOpen}
        tenantId={tenantId}
        existingEmails={(team.data ?? []).map((member) => member.email)}
        verifyExistingEmails={() => loadTeamMembershipEmails(tenantId)}
        onClose={() => setImportOpen(false)}
        onResult={async (result) => {
          setMessage(result)
          try {
            await refresh()
          } catch {
            setMessage(`${result} No se pudo actualizar la lista; recarga la página.`)
          }
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="¿Quitar a esta persona del equipo?"
        description={
          removing
            ? `Se retirará el acceso de ${removing.fullName || removing.email} a esta empresa.`
            : ''
        }
        confirmLabel="Quitar acceso"
        destructive
        pending={busy}
        onConfirm={() => {
          if (removing)
            void run(
              () => removeMember(tenantId, removing.userId),
              'Persona quitada del equipo.',
            ).then((ok) => {
              if (ok) setRemoving(null)
            })
        }}
      />
    </div>
  )
}
