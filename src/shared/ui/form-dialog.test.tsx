import { readFileSync } from 'node:fs'

import type { FormEvent, ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FormDialog } from './form-dialog'

const handlers = vi.hoisted(() => ({
  close: (_open: boolean) => {},
  submit: (_event: FormEvent<HTMLFormElement>) => {},
}))

// Keep the form and its event handlers real; replace portal-only presentation in Node.
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    DialogRoot: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode
      onOpenChange: typeof handlers.close
    }) => {
      handlers.close = onOpenChange
      return children
    },
    DialogContent: ({
      children,
      className,
    }: {
      children: ReactElement<{ onSubmit: typeof handlers.submit }>
      className?: string
    }) => {
      handlers.submit = children.props.onSubmit
      return <div className={className}>{children}</div>
    },
    DialogHeader: Container,
    DialogFooter: Container,
    DialogTitle: Container,
    DialogDescription: Container,
    Button: ({
      children,
      isDisabled,
      type,
    }: {
      children: ReactNode
      isDisabled?: boolean
      type?: 'button' | 'submit'
    }) => (
      <button disabled={isDisabled} type={type ?? 'button'}>
        {children}
      </button>
    ),
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? children : null,
    AlertDialogContent: Container,
    AlertDialogHeader: Container,
    AlertDialogTitle: Container,
    AlertDialogDescription: Container,
    AlertDialogFooter: Container,
    AlertDialogCancel: Container,
  }
})

describe('FormDialog interaction guards', () => {
  const onOpenChange = vi.fn()
  const onSubmit = vi.fn()
  const event = { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>
  const render = (
    props: {
      isSubmitting?: boolean
      isDirty?: boolean
      submitDisabled?: boolean
      compact?: boolean
      wide?: boolean
    } = {},
  ) =>
    renderToStaticMarkup(
      <FormDialog
        open
        onOpenChange={onOpenChange}
        title="Nuevo trabajo"
        submitLabel="Guardar"
        onSubmit={onSubmit}
        {...props}
      >
        <input aria-label="Título" />
      </FormDialog>,
    )

  beforeEach(() => vi.clearAllMocks())

  it('submits through the native form, so Enter works', () => {
    render()
    handlers.submit(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it.each([{ submitDisabled: true }, { isSubmitting: true }])(
    'does not submit when blocked: %o',
    (props) => {
      render(props)
      handlers.submit(event)
      expect(onSubmit).not.toHaveBeenCalled()
    },
  )

  it('allows dismissal of a pristine form', () => {
    render()
    handlers.close(false)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not discard a dirty form on Escape or backdrop dismissal', () => {
    render({ isDirty: true })
    handlers.close(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('blocks dismissal and disables editing while saving', () => {
    const html = render({ isSubmitting: true })
    handlers.close(false)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('<fieldset disabled=""')
    expect(html.match(/<button disabled=""/g)).toHaveLength(2)
  })

  it('uses the default, compact and wide dialog limits while keeping viewport scrolling', () => {
    const defaultMarkup = render()
    expect(defaultMarkup).toContain('app-dialog max-h-[90dvh] w-full overflow-y-auto')

    const compactMarkup = render({ compact: true })
    expect(compactMarkup).toContain('app-dialog app-dialog--compact')

    const wideMarkup = render({ wide: true })
    expect(wideMarkup).toContain('app-dialog app-dialog--wide max-h-[94dvh] w-full overflow-y-auto')
  })

  it('constrains the UI library modal wrapper as well as its content', () => {
    const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8').replaceAll(
      '"',
      "'",
    )
    for (const [variant, width] of [
      ['app-dialog', '36rem'],
      ['app-dialog--compact', '28rem'],
      ['app-dialog--details', '42rem'],
      ['app-dialog--wide', '72rem'],
    ]) {
      expect(css).toContain(
        `.${variant},\n[data-slot='dialog-overlay'] > :has(> .${variant}) {\n  max-width: min(100%, ${width});`,
      )
    }
    expect(css).toContain(
      ".app-dialog--alert,\n[data-slot='alert-dialog-overlay'] > :has(> .app-dialog--alert) {\n  max-width: min(100%, 20rem);",
    )
  })
})
