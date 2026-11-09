import { LinkButton } from '@doscientos/ui'

import { fieldIcons } from '@/shared/ui/field-icons'

import { MAX_SCALE_PLAN_MEMBERS, smallestPlanFor } from '../domain/plans'

export function CustomPlanCard({ members }: { members?: number }) {
  const scalePlan =
    members !== undefined && members <= MAX_SCALE_PLAN_MEMBERS && smallestPlanFor(members) === null
  const title = scalePlan ? 'Ábaco Escala' : 'Personalizado'
  const audience = scalePlan
    ? `Para equipos de 16 a ${MAX_SCALE_PLAN_MEMBERS} personas.`
    : 'Para más de 100 personas.'
  const description = scalePlan
    ? `Te preparamos una propuesta para ${members} personas según las necesidades de tu equipo. Si sois más de 100, también podemos adaptarla.`
    : 'Cuéntanos el tamaño de tu equipo y cómo trabajáis para preparar una propuesta a medida.'

  return (
    <article
      aria-label={
        scalePlan
          ? `Propuesta de Ábaco Escala para ${members} personas`
          : 'Plan personalizado para más de 100 personas'
      }
      className="border-foreground bg-foreground text-background relative flex flex-col gap-3 overflow-hidden rounded-lg border p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="bg-background/10 rounded-full px-2 py-0.5 text-[11px] font-medium">
          {scalePlan ? `16–${MAX_SCALE_PLAN_MEMBERS} personas` : 'Más de 100 personas'}
        </span>
        <span className="bg-background/10 flex size-8 items-center justify-center rounded-lg">
          {fieldIcons.building}
        </span>
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-background/70 text-xs">{audience}</p>
      </div>
      <p className="text-2xl font-semibold">Hablemos</p>
      <p className="text-background/70 text-xs leading-relaxed">{description}</p>
      <div className="mt-auto space-y-2 pt-1">
        <LinkButton
          href="tel:+34624140151"
          variant="secondary"
          className="bg-background text-foreground hover:bg-background/90 w-full"
          aria-label={`Llámanos al 624 14 01 51 para ${scalePlan ? 'solicitar una propuesta de Ábaco Escala' : 'un plan personalizado'}`}
        >
          {fieldIcons.phone}
          {scalePlan ? 'Pedir propuesta' : 'Llámanos'}
        </LinkButton>
        <p className="text-background/70 text-center text-xs">624 14 01 51</p>
      </div>
    </article>
  )
}
