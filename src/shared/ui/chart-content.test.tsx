import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'

import { use } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { expect, it } from 'vitest'

import { ChartCard } from './chart-card'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

it('streams a pending chart skeleton without hiding its settings or blocking other charts', async () => {
  const data = deferred<string>()
  const firstChunk = deferred<void>()
  let html = ''
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      html += chunk.toString()
      firstChunk.resolve()
      callback()
    },
  })

  function WaitingPlot() {
    return <p>{use(data.promise)}</p>
  }

  const stream = renderToPipeableStream(
    <>
      <ChartCard title="Gastos" settings={<button type="button">Cambiar periodo</button>}>
        <WaitingPlot />
      </ChartCard>
      <ChartCard title="Ingresos">
        <p>Ingresos ya disponibles</p>
      </ChartCard>
    </>,
    { onShellReady: () => stream.pipe(output), onShellError: firstChunk.reject },
  )
  await firstChunk.promise
  const shell = html
  data.resolve('Gastos calculados')
  await finished(output)

  expect(shell).toContain('Cargando Gastos…')
  expect(shell).toContain('Cambiar periodo')
  expect(shell).toContain('Ingresos ya disponibles')
  expect(shell).not.toContain('Gastos calculados')
  expect(html).toContain('Gastos calculados')
})
