import {
  cn,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectList,
  SelectTrigger,
  SelectValue,
} from '@doscientos/ui'
import { useId, type ReactNode } from 'react'

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
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
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

export function PlatformSelect({
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  value,
  options,
  onChange,
  isDisabled,
  placeholder,
}: ControlProps & {
  value: string | null
  options: readonly { id: string; label: string; isDisabled?: boolean }[]
  onChange: (value: string) => void
  isDisabled?: boolean
  placeholder?: string
}) {
  return (
    <Select
      aria-labelledby={`${id}-label`}
      {...(describedBy && { 'aria-describedby': describedBy })}
      isInvalid={invalid ?? false}
      isDisabled={isDisabled ?? false}
      placeholder={placeholder ?? 'Selecciona una opción'}
      disabledKeys={options.filter((option) => option.isDisabled).map((option) => option.id)}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (typeof key === 'string') onChange(key)
      }}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectList items={options}>
          {(option) => (
            <SelectItem id={option.id} textValue={option.label}>
              {option.label}
            </SelectItem>
          )}
        </SelectList>
      </SelectContent>
    </Select>
  )
}
