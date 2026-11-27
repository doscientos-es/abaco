import { Button, Spinner } from '@doscientos/ui'
import {
  ArrowUpRight,
  FileText,
  MagnifyingGlass,
  Package,
  Question,
  Sparkle,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'

type Credits = { monthly_limit: number; monthly_used: number; extra_remaining: number }

export function ChatCredits({
  credits,
  error,
}: {
  credits: Credits | null | undefined
  error: boolean
}) {
  const remaining = credits ? Math.max(0, credits.monthly_limit - credits.monthly_used) : 0
  return (
    <div className="flex items-center gap-2">
      {credits ? (
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs tabular-nums">
            <span>Solicitudes disponibles</span>
            <span>
              {remaining} / {credits.monthly_limit}
              {credits.extra_remaining > 0 ? ` · +${credits.extra_remaining} extra` : ''}
            </span>
          </div>
          <progress
            aria-label="Solicitudes mensuales disponibles"
            aria-valuetext={`${remaining} de ${credits.monthly_limit} solicitudes mensuales disponibles`}
            max={Math.max(1, credits.monthly_limit)}
            value={Math.min(remaining, Math.max(1, credits.monthly_limit))}
            className="bg-muted [&::-moz-progress-bar]:bg-primary/70 [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary/70 mt-1.5 block h-1 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full"
          />
        </div>
      ) : (
        <span className="text-muted-foreground flex-1 text-xs">
          {error || credits === null ? 'No se pudo consultar el saldo' : 'Consultando saldo…'}
        </span>
      )}
      <details className="relative shrink-0">
        <summary
          aria-label="Información sobre el asistente y las solicitudes"
          className="text-muted-foreground hover:bg-muted focus-visible:ring-ring flex size-8 cursor-pointer list-none items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        >
          <Question aria-hidden="true" className="size-4" />
        </summary>
        <div className="bg-popover text-popover-foreground border-border absolute top-full right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border p-4 text-xs leading-relaxed shadow-lg">
          <p>El saldo mensual y los créditos extra se muestran por separado.</p>
          <p>
            Cada llamada al modelo consume una solicitud, incluso si falla después de reservarse.
            Continuar tras una búsqueda puede consumir otra.
          </p>
          <p>
            Las propuestas se revisan antes de aplicarse. Tras completar una acción, el asistente
            puede iniciar un contexto nuevo; los mensajes siguen visibles.
          </p>
        </div>
      </details>
    </div>
  )
}

export function ChatWelcome({
  onSuggest,
  clients,
  estimates,
  inventory,
}: {
  onSuggest: (prompt: string) => void
  clients: boolean
  estimates: boolean
  inventory: boolean
}) {
  const suggestions = [
    ...(clients
      ? [
          {
            label: 'Buscar un cliente',
            prompt: 'Ayúdame a buscar un cliente',
            icon: MagnifyingGlass,
          },
        ]
      : []),
    ...(estimates
      ? [
          {
            label: 'Preparar un presupuesto',
            prompt: 'Ayúdame a preparar un presupuesto',
            icon: FileText,
          },
        ]
      : []),
    ...(inventory
      ? [
          {
            label: 'Consultar inventario',
            prompt: 'Ayúdame a consultar el inventario',
            icon: Package,
          },
        ]
      : []),
  ]
  return (
    <div className="flex min-h-full flex-col justify-center py-6">
      <div className="bg-primary/10 text-primary mb-5 flex size-12 items-center justify-center rounded-2xl">
        <Sparkle aria-hidden="true" weight="fill" className="size-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">¿En qué puedo ayudarte?</h2>
      <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed">
        Consulta información o prepara cambios en Menos Líos. Tú decides antes de aplicar cualquier
        propuesta.
      </p>
      {suggestions.length ? (
        <div className="mt-6 grid gap-2">
          {suggestions.map(({ label, prompt, icon: Icon }) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              aria-label={label}
              onPress={() => onSuggest(prompt)}
              className="hover:bg-muted/60 h-auto min-h-12 w-full justify-start gap-3 rounded-xl px-3 text-left text-sm shadow-none"
            >
              <Icon aria-hidden="true" className="text-primary size-4 shrink-0" />
              <span className="flex-1">{label}</span>
              <ArrowUpRight aria-hidden="true" className="text-muted-foreground size-4" />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChatActivity({ children }: { children: ReactNode }) {
  return (
    <output className="text-muted-foreground flex items-center gap-2 py-1 text-xs">
      <Spinner aria-hidden="true" size="sm" speed="slow" className="text-primary" />
      <span>{children}</span>
    </output>
  )
}

export function ChatMessage({ text, user }: { text: string; user: boolean }) {
  if (user)
    return (
      <div className="bg-primary text-primary-foreground ml-auto max-w-[90%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {text}
      </div>
    )
  return (
    <div className="[&_a]:text-primary [&_blockquote]:border-border [&_code]:bg-muted min-w-0 text-sm leading-relaxed break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:whitespace-pre-wrap [&_p:not(:first-child)]:mt-3 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown skipHtml disallowedElements={['img']} unwrapDisallowed>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export function ChatProposal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card min-w-0 overflow-hidden rounded-2xl border text-sm shadow-sm">
      <div className="border-border bg-muted/30 flex items-center gap-2 border-b px-4 py-3">
        <Sparkle aria-hidden="true" className="text-primary size-4 shrink-0" />
        <h3 className="min-w-0 font-semibold break-words">{title}</h3>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  )
}
