import { cn, Field, FieldDescription, FieldError, FieldLabel } from '@doscientos/ui'
import { useId, type ComponentProps, type ReactNode } from 'react'

type ControlProps = {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

export function PlatformField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | undefined
  className?: string
  children: (props: ControlProps) => ReactNode
}) {
  const id = useId()
  const descriptions = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean)
  return (
    <Field className={cn('min-w-0 gap-1.5', className)} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({
        id,
        'aria-describedby': descriptions.join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint ? <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription> : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}

export function PlatformSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(
        'border-input bg-background focus-visible:outline-ring min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  )
}
