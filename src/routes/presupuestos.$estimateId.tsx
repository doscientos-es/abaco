import { createFileRoute } from '@tanstack/react-router'

import { EstimateEditorPage } from '@/features/estimates'

export const Route = createFileRoute('/presupuestos/$estimateId')({ component: EditorRoute })

function EditorRoute() {
  const { estimateId } = Route.useParams()
  return <EstimateEditorPage estimateId={estimateId} />
}
