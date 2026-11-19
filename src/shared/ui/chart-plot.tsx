import { Skeleton } from '@doscientos/ui'
import { lazy, Suspense } from 'react'

import type { ChartOption } from './chart-options'

const ChartRenderer = lazy(() => import('./chart-renderer'))

export function ChartPlot({ option, className }: { option: ChartOption; className: string }) {
  return (
    <Suspense
      fallback={
        <Skeleton aria-hidden="true" className={`${className} motion-reduce:animate-none`} />
      }
    >
      <ChartRenderer option={option} className={className} />
    </Suspense>
  )
}
