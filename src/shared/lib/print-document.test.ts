import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { printDocument } from './print-document'

function setup() {
  const clone = { className: 'invoice-document invoice-sheet' }
  const cloneNode = vi.fn(() => clone)
  const element = { cloneNode } as unknown as HTMLElement
  const afterPrint = new EventTarget()
  const print = vi.fn()
  const decode = vi.fn().mockResolvedValue(undefined)
  const frameDocument = {
    title: '',
    documentElement: { lang: '' },
    head: { append: vi.fn() },
    body: { className: '', append: vi.fn() },
    fonts: { ready: Promise.resolve() },
    images: [{ decode }],
  }
  const frame = {
    title: '',
    tabIndex: 0,
    style: { cssText: '' },
    setAttribute: vi.fn(),
    remove: vi.fn(),
    contentDocument: frameDocument,
    contentWindow: {
      addEventListener: afterPrint.addEventListener.bind(afterPrint),
      requestAnimationFrame: (callback: () => void) => callback(),
      focus: vi.fn(),
      print,
    },
  }
  const page = {
    createElement: vi.fn(() => frame),
    body: { append: vi.fn() },
    querySelectorAll: vi.fn<() => unknown[]>(() => []),
  }
  vi.stubGlobal('document', page)
  return { clone, cloneNode, element, frame, frameDocument, page, print, decode, afterPrint }
}

describe('printDocument', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('prints only an exact clone of the document, not the application or preview scaling', async () => {
    const { element, clone, cloneNode, frameDocument, print, decode } = setup()

    await printDocument(element, 'Factura F-2026-002')

    expect(cloneNode).toHaveBeenCalledWith(true)
    expect(frameDocument.body.append).toHaveBeenCalledWith(clone)
    expect(frameDocument.body.className).toBe('invoice-print')
    expect(frameDocument.title).toBe('Factura F-2026-002')
    expect(frameDocument.documentElement.lang).toBe('es')
    expect(decode).toHaveBeenCalledOnce()
    expect(print).toHaveBeenCalledOnce()
  })

  it('waits for the same fonts and logo to be ready before opening the PDF dialog', async () => {
    const { element, frameDocument, print } = setup()
    let fontsReady = () => {}
    frameDocument.fonts.ready = new Promise<void>((resolve) => {
      fontsReady = resolve
    })
    const task = printDocument(element, 'Factura')

    expect(print).not.toHaveBeenCalled()
    fontsReady()
    await task
    expect(print).toHaveBeenCalledOnce()
  })

  it('does not print an incomplete branded document when its logo fails to load', async () => {
    const { element, decode, print, frame } = setup()
    decode.mockRejectedValue(new Error('Image failed'))

    await expect(printDocument(element, 'Factura')).rejects.toThrow('Image failed')
    expect(print).not.toHaveBeenCalled()
    expect(frame.remove).toHaveBeenCalledOnce()
  })

  it('copies and waits for the original stylesheet rather than inventing a separate PDF design', async () => {
    const { element, page, frameDocument, print } = setup()
    const link = {
      href: '',
      onload: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
    }
    const source = {
      tagName: 'LINK',
      href: 'https://example.test/app.css',
      cloneNode: vi.fn(() => link),
    }
    page.querySelectorAll.mockReturnValue([source])

    const task = printDocument(element, 'Factura')
    expect(frameDocument.head.append).toHaveBeenCalledWith(link)
    expect(link.href).toBe(source.href)
    expect(print).not.toHaveBeenCalled()
    link.onload?.()
    await task
    expect(print).toHaveBeenCalledOnce()
  })

  it('times out and removes the frame if document assets never finish loading', async () => {
    const { element, frameDocument, frame, print } = setup()
    frameDocument.fonts.ready = new Promise<void>(() => {})
    const failure = expect(printDocument(element, 'Factura')).rejects.toThrow('demasiado')

    await vi.advanceTimersByTimeAsync(15_000)
    await failure

    expect(frame.remove).toHaveBeenCalledOnce()
    expect(print).not.toHaveBeenCalled()
  })

  it('cleans up the isolated print frame after printing', async () => {
    const { element, frame, afterPrint } = setup()
    await printDocument(element, 'Factura')

    afterPrint.dispatchEvent(new Event('afterprint'))

    expect(frame.remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fails safely if the browser cannot create the print document', async () => {
    const { element, frame, print } = setup()
    Object.assign(frame, { contentWindow: null })

    await expect(printDocument(element, 'Factura')).rejects.toThrow('preparar el documento')
    expect(frame.remove).toHaveBeenCalledOnce()
    expect(print).not.toHaveBeenCalled()
  })
})
