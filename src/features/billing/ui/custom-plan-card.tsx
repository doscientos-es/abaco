import { LinkButton } from '@doscientos/ui'

import { fieldIcons } from '@/shared/ui/field-icons'

import { MAX_SCALE_PLAN_MEMBERS } from '../domain/plans'

export function CustomPlanCard() {
  return (
    <article
      aria-label={`Plan personalizado para más de ${MAX_SCALE_PLAN_MEMBERS} personas`}
      className="border-foreground bg-foreground text-background relative flex flex-col gap-3 overflow-hidden rounded-lg border p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="bg-background/10 rounded-full px-2 py-0.5 text-[11px] font-medium">
          Más de {MAX_SCALE_PLAN_MEMBERS} personas
        </span>
        <span className="bg-background/10 flex size-8 items-center justify-center rounded-lg">
          {fieldIcons.building}
        </span>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Personalizado</h3>
        <p className="text-background/70 text-xs">
          Para empresas con necesidades, estructura o volumen especiales.
        </p>
      </div>
      <p className="text-2xl font-semibold">Hablemos</p>
      <p className="text-background/70 text-xs leading-relaxed">
        Cuéntanos cómo trabaja tu empresa y prepararemos una propuesta a medida.
      </p>
      <div className="mt-auto space-y-2 pt-1">
        <LinkButton
          href="tel:+34624140151"
          variant="secondary"
          className="bg-background text-foreground hover:bg-background/90 w-full"
          aria-label="Llámanos al 624 14 01 51 para un plan personalizado"
        >
          {fieldIcons.phone}
          Llámanos
        </LinkButton>
        <p className="text-background/70 text-center text-xs">624 14 01 51</p>
      </div>
    </article>
  )
}
