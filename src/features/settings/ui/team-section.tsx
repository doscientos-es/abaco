import { Badge, Button } from '@doscientos/ui'
import { UserPlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  assignableRoles,
  isRole,
  roleDescriptions,
  roleLabels,
  useSession,
  type Role,
} from '@/features/auth'
import { WorkTeamsSection } from '@/features/work-teams'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  changeMemberRole,
  inviteMember,
  removeMember,
  teamQuery,
  type TeamResult,
} from '../application/team-actions'

/** Members of the company. Only rendered for people allowed to manage the team. */
export function TeamSection({ tenantId }: { tenantId: string }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const team = useQuery(teamQuery(tenantId))
  const options = assignableRoles(session?.role)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  async function run(action: () => Promise<TeamResult>, success: string) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return false
    }
    setMessage(
      result.status === 'added'
        ? 'Esa persona ya tenía cuenta: la hemos añadido al equipo.'
        : success,
    )
    await queryClient.invalidateQueries({ queryKey: teamQuery(tenantId).queryKey })
    await queryClient.invalidateQueries({ queryKey: ['work-teams', tenantId] })
    return true
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

  return (
    <div className="space-y-6">
      <section aria-labelledby="people-heading" className="border-border bg-card rounded-lg border">
        <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div className="flex items-start gap-3">
            <span className="bg-primary/5 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <UsersThreeIcon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 id="people-heading" className="text-sm font-semibold">
                Personas y permisos
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Gestiona quién tiene acceso a tu empresa y qué puede hacer.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {team.isSuccess ? (
              <Badge variant="neutral">
                {team.data.length} {team.data.length === 1 ? 'persona' : 'personas'}
              </Badge>
            ) : null}
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

        <ul className="divide-border divide-y">
          {team.data?.map((member) => {
            const isMe = member.userId === session?.userId
            const editable = !isMe && options.includes(member.role)
            const initials = (member.fullName.trim() || member.email)
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part.charAt(0).toLocaleUpperCase())
              .join('')
            return (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span
                  aria-hidden="true"
                  className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">
                    {member.fullName || member.email}
                    {isMe ? <span className="text-muted-foreground font-normal"> · Tú</span> : null}
                  </p>
                  {member.fullName ? (
                    <p className="text-muted-foreground mt-0.5 text-xs break-all">{member.email}</p>
                  ) : null}
                </div>
                {editable ? (
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    <SelectField
                      hideLabel
                      label={`Rol de ${member.email}`}
                      value={member.role}
                      className="w-40"
                      isDisabled={busy}
                      options={options.map((r) => ({ value: r, label: roleLabels[r] }))}
                      onChange={(value) => {
                        if (isRole(value))
                          void run(
                            () => changeMemberRole(tenantId, member.userId, value),
                            'Rol actualizado.',
                          )
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      isDisabled={busy}
                      aria-label={`Quitar a ${member.fullName || member.email} del equipo`}
                      onPress={() =>
                        void run(
                          () => removeMember(tenantId, member.userId),
                          'Persona quitada del equipo.',
                        )
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">{roleLabels[member.role]}</Badge>
                )}
              </li>
            )
          })}
          {team.isError ? (
            <li className="text-destructive px-5 py-3 text-sm">No se pudo cargar el equipo.</li>
          ) : null}
          {team.isPending ? (
            <li className="text-muted-foreground px-5 py-4 text-sm">Cargando personas…</li>
          ) : null}
          {team.isSuccess && team.data.length === 0 ? (
            <li className="text-muted-foreground px-5 py-4 text-sm">
              Todavía no hay personas en el equipo.
            </li>
          ) : null}
        </ul>

        {!inviteOpen && message ? (
          <output aria-live="polite" className="text-muted-foreground block px-5 pb-4 text-sm">
            {message}
          </output>
        ) : null}
      </section>
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
      <WorkTeamsSection
        key={tenantId}
        tenantId={tenantId}
        peopleReady={team.isSuccess}
        people={(team.data ?? []).map((member) => ({
          id: member.userId,
          label: member.fullName || member.email,
        }))}
      />
    </div>
  )
}
