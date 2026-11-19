import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { init, use as registerECharts } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

import type { ChartOption } from './chart-options'

registerECharts([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, SVGRenderer])

export default function ChartRenderer({
  option,
  className,
}: {
  option: ChartOption
  className: string
}) {
  const elementRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof init> | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const chart = init(element, undefined, { renderer: 'svg' })
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={elementRef} aria-hidden="true" className={className} />
}
