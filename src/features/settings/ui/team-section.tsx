import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { assignableRoles, isRole, roleDescriptions, roleLabels, useSession, type Role } from '@/features/auth'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'

import {
  changeMemberRole,
  inviteMember,
  removeMember,
  teamQuery,
  type TeamResult,
} from '../application/team-actions'

/** Members of the company. Only rendered for people allowed to manage the team, never in demo mode. */
export function TeamSection({ tenantId }: { tenantId: string }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const team = useQuery(teamQuery(tenantId))
  const options = assignableRoles(session?.role)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<TeamResult>, success: string) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) return setMessage(result.message)
    setMessage(result.status === 'added' ? 'Esa persona ya tenía cuenta: la hemos añadido al equipo.' : success)
    await queryClient.invalidateQueries({ queryKey: teamQuery(tenantId).queryKey })
  }

  const invite = async () => {
    await run(() => inviteMember({ tenantId, email: email.trim(), fullName: fullName.trim(), role }), 'Invitación enviada por correo.')
    setEmail('')
    setFullName('')
  }

  return (
    <section className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Equipo</h2>
        <p className="text-muted-foreground text-xs">Quién puede entrar y qué puede hacer.</p>
      </div>

      <ul className="divide-border divide-y">
        {team.data?.map((member) => {
          const isMe = member.userId === session?.userId
          const editable = !isMe && member.role !== 'owner' && options.includes(member.role)
          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.fullName || member.email}{isMe ? ' (tú)' : ''}</p>
                <p className="text-muted-foreground truncate text-xs">{member.email}</p>
              </div>
              {editable ? (
                <>
                  <SelectField
                    hideLabel
                    label={`Rol de ${member.email}`}
                    value={member.role}
                    className="w-40"
                    options={options.map((r) => ({ value: r, label: roleLabels[r] }))}
                    onChange={(value) => {
                      if (isRole(value)) void run(() => changeMemberRole(tenantId, member.userId, value), 'Rol actualizado.')
                    }}
                  />
                  <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => void run(() => removeMember(tenantId, member.userId), 'Persona quitada del equipo.')}>
                    Quitar
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground text-xs">{roleLabels[member.role]}</span>
              )}
            </li>
          )
        })}
        {team.isError ? <li className="text-destructive px-5 py-3 text-sm">No se pudo cargar el equipo.</li> : null}
      </ul>

      <div className="border-border grid gap-4 border-t p-5 sm:grid-cols-2">
        <TextField label="Nombre" placeholder="Ana García" icon={fieldIcons.user} value={fullName} onChange={setFullName} />
        <TextField label="Correo" type="email" placeholder="ana@empresa.es" icon={fieldIcons.mail} value={email} onChange={setEmail} />
        <SelectField
          label="Rol"
          value={role}
          options={options.map((r) => ({ value: r, label: roleLabels[r] }))}
          onChange={(value) => isRole(value) && setRole(value)}
        />
        <p className="text-muted-foreground self-end text-xs">{roleDescriptions[role]}</p>
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {message ? <p role="status" className="text-muted-foreground text-sm">{message}</p> : null}
          <Button isDisabled={busy || email.trim() === ''} onPress={() => void invite()}>
            Invitar
          </Button>
        </div>
      </div>
    </section>
  )
}
