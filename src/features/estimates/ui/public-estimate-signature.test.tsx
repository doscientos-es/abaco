import { readFileSync } from 'node:fs'

import type * as React from 'react'
import type { ReactNode, SVGProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type * as JSXDevRuntime from 'react/jsx-dev-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EstimateSignature } from '@/shared/domain/types'

import { PublicEstimateSignature } from './public-estimate-signature'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  actions: new Map<string, { onPress: () => void; isDisabled: boolean | undefined }>(),
  effects: [] as (() => void | (() => void))[],
  surface: undefined as SVGProps<SVGSVGElement> | undefined,
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = initial
    return [mocks.states[index], (next: unknown) => (mocks.states[index] = next)]
  },
  useRef: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = { current: initial }
    return mocks.states[index]
  },
  useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
}))
vi.mock('react/jsx-dev-runtime', async (original) => {
  const runtime = await original<typeof JSXDevRuntime>()
  return {
    ...runtime,
    jsxDEV: (type: React.ElementType, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (type === 'svg' && props['aria-label'] === 'Área para dibujar tu firma')
        mocks.surface = props as SVGProps<SVGSVGElement>
      return runtime.jsxDEV(
        type,
        props,
        ...(rest as Parameters<typeof runtime.jsxDEV> extends [unknown, unknown, ...infer P]
          ? P
          : never),
      )
    },
  }
})
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    DialogRoot: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? children : null,
    DialogContent: Container,
    DialogDescription: Container,
    DialogFooter: Container,
    DialogHeader: Container,
    DialogTitle: Container,
    Button: ({
      children,
      onPress,
      isDisabled,
    }: {
      children: string
      onPress: () => void
      isDisabled?: boolean
    }) => {
      mocks.actions.set(children, { onPress, isDisabled })
      return <button disabled={isDisabled}>{children}</button>
    },
  }
})

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected test element or handler')
  return value
}

describe('PublicEstimateSignature', () => {
  const onChange = vi.fn<(signature: EstimateSignature) => void>()
  const preventDefault = vi.fn()
  const setPointerCapture = vi.fn()
  const action = (name: string) => required(mocks.actions.get(name))
  const attributes = new Set<string>()
  const root = {
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string) => attributes.add(name),
    removeAttribute: (name: string) => attributes.delete(name),
  }
  const render = (value: EstimateSignature = []) => {
    mocks.cursor = 0
    mocks.actions.clear()
    mocks.effects = []
    mocks.surface = undefined
    return renderToStaticMarkup(<PublicEstimateSignature value={value} onChange={onChange} />)
  }
  const event = (x: number, y: number, pointerId = 1) =>
    ({
      clientX: x,
      clientY: y,
      pointerId,
      pointerType: 'touch',
      preventDefault,
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        setPointerCapture,
      },
    }) as unknown as React.PointerEvent<SVGSVGElement>

  beforeEach(() => {
    mocks.states = []
    attributes.clear()
    onChange.mockClear()
    preventDefault.mockClear()
    setPointerCapture.mockClear()
    vi.stubGlobal('document', { documentElement: root })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('locks the public page while open and restores it on close', () => {
    render()
    action('Dibujar firma').onPress()
    render()
    const unlock = required(mocks.effects[0])()
    expect(attributes.has('data-estimate-signature-open')).toBe(true)
    const surface = required(mocks.surface)
    required(surface.onPointerDown)(event(10, 20))
    required(surface.onPointerMove)(event(40, 50))
    action('Cancelar').onPress()
    unlock?.()
    render()
    expect(attributes.has('data-estimate-signature-open')).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    action('Dibujar firma').onPress()
    render()
    expect(action('Usar firma').isDisabled).toBe(true)

    const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(
      /html\[data-public-estimate\]\[data-estimate-signature-open\] body\s*\{\s*overflow:\s*hidden;\s*overscroll-behavior:\s*none;/,
    )
  })

  it('keeps rapid pointer points, ignores other pointers and saves only on confirmation', () => {
    render()
    action('Dibujar firma').onPress()
    render()
    expect(action('Usar firma').isDisabled).toBe(true)
    const surface = required(mocks.surface)
    expect(surface.className).toContain('touch-none')
    const start = event(10, 20)
    required(surface.onPointerDown)(start)
    required(surface.onPointerMove)(event(90, 80, 2))
    required(surface.onPointerMove)(event(40, 50))
    required(surface.onPointerMove)(event(80, 90))
    required(surface.onPointerCancel)(event(80, 90))
    required(surface.onPointerMove)(event(20, 20))
    expect(preventDefault).toHaveBeenCalledTimes(3)
    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(onChange).not.toHaveBeenCalled()
    render()
    expect(action('Usar firma').isDisabled).toBe(false)
    action('Usar firma').onPress()
    expect(onChange).toHaveBeenCalledWith([
      [
        { x: 0.1, y: 0.2 },
        { x: 0.4, y: 0.5 },
        { x: 0.8, y: 0.9 },
      ],
    ])
  })
})
