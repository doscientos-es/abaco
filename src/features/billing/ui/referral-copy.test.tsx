import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReferralProgram } from './referral-program'

const buttons = vi.hoisted(() => ({
  props: [] as Array<{ children: ReactNode; onPress?: () => void }>,
}))
vi.mock('@doscientos/ui', () => ({
  Button: (props: { children: ReactNode; onPress?: () => void }) => {
    buttons.props.push(props)
    return <button>{props.children}</button>
  },
}))

afterEach(() => {
  buttons.props = []
  vi.unstubAllGlobals()
})

describe('referral link copying', () => {
  it('ignores rapid repeats and allows another attempt after an error', async () => {
    let reject!: (reason: Error) => void
    const writeText = vi.fn().mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderToStaticMarkup(
      <ReferralProgram
        summary={{
          code: 'AB12CD34EF56AB78',
          referred_count: 0,
          recommended_by: null,
          rewards_active: false,
        }}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )
    const copy = buttons.props.find((button) => button.children === 'Copiar enlace')?.onPress
    expect(copy).toBeDefined()
    copy?.()
    copy?.()
    expect(writeText).toHaveBeenCalledTimes(1)
    reject(new Error('clipboard unavailable'))
    await vi.waitFor(() => {
      copy?.()
      expect(writeText).toHaveBeenCalledTimes(2)
    })
  })
})
