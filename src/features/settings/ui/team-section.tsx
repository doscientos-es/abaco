import { Badge, Button, ConfirmDialog } from '@doscientos/ui'
import { UserPlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
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
import {
  StaffMemberFunctionsDialog,
  staffFunctionsQuery,
  staffSchedulesQuery,
} from '@/features/staff-schedules'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import {
  changeMemberRole,
  inviteMember,
  removeMember,
  teamQuery,
  type TeamMember,
  type TeamResult,
} from '../application/team-actions'
import { TeamImportDialog } from './team-import-dialog'
import { TeamPersonCard, TeamPersonDetails } from './team-person'

/** Members of the company. Only rendered for people allowed to manage the team. */
export function TeamSection({
  tenantId,
  mode = 'manage',
  memberIds,
  personId,
}: {
  tenantId: string
  mode?: 'manage' | 'invite'
  memberIds?: string[] | undefined
  personId?: string | undefined
}) {
  const inviting = mode === 'invite'
  const session = useSession()
  const queryClient = useQueryClient()
  const team = useQuery(teamQuery(tenantId))
  const functions = useQuery({ ...staffFunctionsQuery(tenantId), enabled: !inviting })
  const schedules = useQuery({ ...staffSchedulesQuery(tenantId), enabled: !inviting })
  const options = assignableRoles(session?.role)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [search, setSearch] = useState('')
  const [editingFunctions, setEditingFunctions] = useState<TeamMember | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: teamQuery(tenantId).queryKey })
    await queryClient.invalidateQueries({ queryKey: ['work-teams', tenantId] })
    await queryClient.invalidateQueries({ queryKey: staffSchedulesQuery(tenantId).queryKey })
  }

  async function run(action: () => Promise<TeamResult>, success: string) {
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
      setBusy(false)
    }
  }

  const invite = async () => {
    const succeeded = await run(
      () => inviteMember({ tenantId, email: email.trim(), fullName: fullName.trim(), role }),
      'Invitación enviada por correo.',
    )
    if (succeeded) {
      setEmail('')
      setFullName('')
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
              <Button
                variant="outline"
                isDisabled={busy || !team.isSuccess}
                onPress={() => setImportOpen(true)}
              >
                Importar personas
              </Button>
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
          (fullName.trim() !== '' && (fullName.trim().length < 2 || fullName.trim().length > 120))
        }
        isSubmitting={busy}
        isDirty={Boolean(email || fullName || role !== 'user')}
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
        open={importOpen}
        tenantId={tenantId}
        existingEmails={(team.data ?? []).map((member) => member.email)}
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
            ).then(() => setRemoving(null))
        }}
      />
    </div>
  )
}
