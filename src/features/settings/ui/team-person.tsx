import { Badge, Button } from '@doscientos/ui'
import { ShieldCheck } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import { isRole, roleDescriptions, roleLabels, type Role } from '@/features/auth'
import { SelectField } from '@/shared/ui/form'

import type { TeamMember } from '../application/team-actions'

function PersonAvatar({ member }: { member: TeamMember }) {
  const initials = (member.fullName.trim() || member.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('')
  return (
    <span
      aria-hidden="true"
      className="bg-secondary text-secondary-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
    >
      {initials}
    </span>
  )
}

export function TeamPersonCard({
  member,
  isMe,
  functions,
}: {
  member: TeamMember
  isMe: boolean
  functions: string[] | null
}) {
  return (
    <li className="min-w-0">
      <Link
        to="/trabajadores"
        search={{ persona: member.userId }}
        className="border-border bg-card hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-ring flex h-full min-w-0 flex-col gap-4 rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <div className="flex min-w-0 items-start gap-3">
          <PersonAvatar member={member} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold break-words">
              {member.fullName || member.email}
              {isMe ? <span className="text-muted-foreground font-normal"> · Tú</span> : null}
              {member.role === 'admin' ? (
                <Badge variant="outline" title="Administrador" className="ml-2 align-middle">
                  <ShieldCheck aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">Administrador</span>
                </Badge>
              ) : null}
            </p>
            {member.fullName ? (
              <p className="text-muted-foreground mt-1 text-xs break-all">{member.email}</p>
            ) : null}
          </div>
          <span aria-hidden="true" className="text-muted-foreground text-lg">
            →
          </span>
        </div>
        {functions !== null ? (
          <span className="text-muted-foreground text-xs break-words">
            {functions.length ? functions.join(' · ') : 'Sin funciones asignadas'}
          </span>
        ) : null}
        <span className="text-primary mt-auto text-xs font-medium">Ver ficha →</span>
      </Link>
    </li>
  )
}

export function TeamPersonDetails({
  member,
  isMe,
  editable,
  options,
  functions,
  busy,
  onEditFunctions,
  onChangeRole,
  onRemove,
}: {
  member: TeamMember
  isMe: boolean
  editable: boolean
  options: Role[]
  functions: string[] | null
  busy: boolean
  onEditFunctions: () => void
  onChangeRole: (role: Role) => void
  onRemove: () => void
}) {
  const name = member.fullName || member.email
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <PersonAvatar member={member} />
          <div className="min-w-0">
            <p className="font-semibold break-words">
              {name}
              {isMe ? ' · Tú' : ''}
            </p>
            <p className="text-muted-foreground text-sm break-all">{member.email}</p>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Funciones</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {functions === null
              ? 'No disponibles'
              : functions.length
                ? functions.join(' · ')
                : 'Sin funciones asignadas'}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            isDisabled={functions === null || busy}
            aria-label={`Editar funciones de ${name}`}
            onPress={onEditFunctions}
          >
            Editar funciones
          </Button>
        </div>
      </div>
      <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Acceso y permisos</h3>
          <p className="text-muted-foreground mt-1 text-sm">{roleDescriptions[member.role]}</p>
        </div>
        {editable ? (
          <SelectField
            label="Rol en la empresa"
            value={member.role}
            isDisabled={busy}
            options={options.map((role) => ({ value: role, label: roleLabels[role] }))}
            onChange={(value) => {
              if (isRole(value)) onChangeRole(value)
            }}
          />
        ) : (
          <Badge variant="outline">{roleLabels[member.role]}</Badge>
        )}
        {editable ? (
          <Button
            variant="destructive"
            isDisabled={busy}
            aria-label={`Quitar a ${name} del equipo`}
            onPress={onRemove}
          >
            Quitar acceso
          </Button>
        ) : null}
      </div>
    </div>
  )
}
