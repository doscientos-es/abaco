import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { staffModuleQuery } from '@/features/product-modules'
import {
  staffAbsencesQuery,
  staffFunctionsQuery,
  staffSchedulesQuery,
} from '@/features/staff-schedules/application/staff-schedule-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
import { SelectField } from '@/shared/ui/form'

import type { TechnicianOption, VisitSummary } from '../application/visit-actions'
import { substitutionSlotsQuery } from '../application/visit-substitution-queries'
import { substitutionPeriod, visitSubstitutions } from '../domain/visit-substitution'

type Props = {
  tenantId: string
  visit: VisitSummary
  technicians: TechnicianOption[]
  selectedId: string
  unchanged: boolean
  saving: boolean
  onChoose: (id: string) => void
}

export function VisitSubstitutionPanel(props: Props) {
  const [open, setOpen] = useState(false)
  const period = substitutionPeriod(props.visit)
  return (
    <section aria-label="Sugerir sustituto" className="space-y-3 rounded-md border p-3">
      <Button
        size="sm"
        variant="outline"
        className="min-h-11"
        aria-expanded={open}
        onPress={() => setOpen(!open)}
      >
        {open ? 'Ocultar sugerencias' : 'Sugerir sustituto'}
      </Button>
      {open ? (
        !props.unchanged ? (
          <p className="text-muted-foreground text-sm">
            Las sugerencias solo se comprueban para la hora y duración originales. Revisa la nueva
            franja antes de guardar.
          </p>
        ) : !period || props.visit.work_team_id !== null ? (
          <p className="text-muted-foreground text-sm">
            Disponibilidad sin verificar. Solo se comprueban visitas individuales en hora
            peninsular, fuera de días de cambio de hora.
          </p>
        ) : (
          <SubstitutionEntitlement {...props} period={period} />
        )
      ) : null}
    </section>
  )
}

type VerifiedPeriod = NonNullable<ReturnType<typeof substitutionPeriod>>
type AssessmentProps = Props & { period: VerifiedPeriod }

function SubstitutionEntitlement(props: AssessmentProps) {
  const entitlement = useQuery(staffModuleQuery(props.tenantId))
  if (entitlement.isError) return <CheckError onRetry={() => void entitlement.refetch()} />
  if (entitlement.isPending || entitlement.isFetching) return <Checking />
  if (!entitlement.data)
    return (
      <p className="text-muted-foreground text-sm">
        Las sugerencias requieren horarios y funciones del módulo Trabajadores.
      </p>
    )
  return <SubstitutionFunction {...props} />
}

function SubstitutionFunction(props: AssessmentProps) {
  const [functionId, setFunctionId] = useState('')
  const functions = useQuery(staffFunctionsQuery(props.tenantId))
  if (functions.isError) return <CheckError onRetry={() => void functions.refetch()} />
  if (functions.isPending || functions.isFetching) return <Checking />
  if (!functions.data.length)
    return (
      <p className="text-muted-foreground text-sm">
        Disponibilidad sin verificar. Configura las funciones del equipo para comprobar quién puede
        cubrir esta visita.
      </p>
    )
  const functionIsKnown = functions.data.some((item) => item.id === functionId)
  return (
    <>
      <SelectField
        label="Función requerida"
        value={functionIsKnown ? functionId : ''}
        options={[
          { value: '', label: 'Seleccionar función' },
          ...functions.data.map((item) => ({ value: item.id, label: item.name })),
        ]}
        onChange={setFunctionId}
      />
      {functionIsKnown ? (
        <SubstitutionMatches {...props} functionId={functionId} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Indica la función que exige esta visita para comprobar quién puede cubrirla.
        </p>
      )}
    </>
  )
}

function SubstitutionMatches({
  tenantId,
  visit,
  technicians,
  period,
  functionId,
  onChoose,
  selectedId,
  saving,
}: AssessmentProps & { functionId: string }) {
  const [showAll, setShowAll] = useState(false)
  const absences = useQuery(staffAbsencesQuery(tenantId, period.from, period.to))
  const slots = useQuery(substitutionSlotsQuery(tenantId, visit))
  const schedules = useQuery(staffSchedulesQuery(tenantId))
  const teams = useQuery(workTeamsQuery(tenantId))
  const requests = [absences, slots, schedules, teams]
  if (requests.some((request) => request.isError))
    return (
      <CheckError
        onRetry={() => {
          for (const request of requests) void request.refetch()
        }}
      />
    )
  if (
    !absences.isSuccess ||
    !slots.isSuccess ||
    !schedules.isSuccess ||
    !teams.isSuccess ||
    requests.some((request) => request.isFetching)
  )
    return <Checking />

  const result = visitSubstitutions({
    visit,
    functionId,
    technicians,
    schedules: schedules.data,
    absences: absences.data,
    teams: teams.data,
    slots: slots.data,
  })
  if (!result.verified)
    return (
      <p className="text-muted-foreground text-sm">
        Disponibilidad sin verificar. Puede que la visita, su ausencia o los equipos hayan cambiado.
        Cierra y vuelve a abrir la visita para revisarla.
      </p>
    )
  return (
    <div className="space-y-2" aria-live="polite">
      {result.candidates.length ? (
        <>
          <p className="text-sm font-medium">Con turno y sin solapes en Menos Líos</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(showAll ? result.candidates : result.candidates.slice(0, 4)).map((candidate) => (
              <li key={candidate.id} className="min-w-0">
                <Button
                  size="sm"
                  variant={candidate.id === selectedId ? 'default' : 'outline'}
                  className="h-auto min-h-11 w-full justify-start text-left break-words whitespace-normal"
                  aria-pressed={candidate.id === selectedId}
                  isDisabled={saving}
                  onPress={() => onChoose(candidate.id)}
                >
                  {candidate.label}
                </Button>
              </li>
            ))}
          </ul>
          {result.candidates.length > 4 ? (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              aria-expanded={showAll}
              onPress={() => setShowAll(!showAll)}
            >
              {showAll ? 'Ver menos' : `Ver ${result.candidates.length - 4} más`}
            </Button>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Al elegir una persona solo se rellena el técnico. El cambio se guarda al confirmar con
            un motivo.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay sustitutos confirmados para esta franja.
        </p>
      )}
      {result.unknown > 0 ? (
        <p className="text-muted-foreground text-sm">
          Disponibilidad sin verificar: {result.unknown}{' '}
          {result.unknown === 1
            ? 'persona sin horario comprobable'
            : 'personas sin horario comprobable'}
          .
        </p>
      ) : null}
    </div>
  )
}

function Checking() {
  return <output className="text-muted-foreground text-sm">Comprobando disponibilidad…</output>
}

function CheckError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-1.5">
      <p className="text-muted-foreground text-sm">No se pudo comprobar la disponibilidad.</p>
      <Button size="sm" variant="outline" className="min-h-11" onPress={onRetry}>
        Reintentar comprobación
      </Button>
    </div>
  )
}
