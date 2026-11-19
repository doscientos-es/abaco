import { Button, Skeleton } from '@doscientos/ui'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { Component, Suspense, type ReactNode } from 'react'

function ChartLoading({ title }: { title: string }) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Cargando {title}…</span>
      <div aria-hidden="true" className="border-border flex h-36 items-end gap-3 border-b px-3">
        {['h-1/3', 'h-2/3', 'h-1/2', 'h-4/5', 'h-3/5', 'h-full'].map((height) => (
          <Skeleton
            key={height}
            className={`flex-1 rounded-b-none motion-reduce:animate-none ${height}`}
          />
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-3 w-28 max-w-full motion-reduce:animate-none" />
    </div>
  )
}

class ChartErrorBoundary extends Component<
  {
    title: string
    onRetry: () => void
    children: ReactNode
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm">
        <p role="alert">No se pudo cargar {this.props.title}.</p>
        <Button
          size="sm"
          variant="outline"
          onPress={() => {
            this.props.onRetry()
            this.setState({ failed: false })
          }}
        >
          Reintentar
        </Button>
      </div>
    )
  }
}

/** Mount chart-specific data hooks in a child so the title and settings remain usable. */
export function ChartContent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ChartErrorBoundary title={title} onRetry={reset}>
          <Suspense fallback={<ChartLoading title={title} />}>{children}</Suspense>
        </ChartErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
