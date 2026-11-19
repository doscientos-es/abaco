import { Button } from '@doscientos/ui'
import { useState } from 'react'

import { estimateBlockOptions, type EstimateBlock } from '@/shared/domain/document-library'
import type { Estimate } from '@/shared/domain/types'
import { newId } from '@/shared/store/store'
import { SelectField } from '@/shared/ui/form'

import { estimateBlockFitError, insertEstimateBlock } from '../domain/estimate-blocks'
import { usePatchEstimate } from './estimate-draft-context'

export function EstimateBlockPicker({
  estimate,
  blocks,
}: {
  estimate: Estimate
  blocks: EstimateBlock[]
}) {
  const patchEstimate = usePatchEstimate()
  const [selected, setSelected] = useState('')
  const block = blocks.find(({ id }) => id === selected)
  const error = block && estimateBlockFitError(estimate, block)
  if (blocks.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Bloque guardado"
          className="min-w-0 flex-1 basis-40"
          value={block?.id ?? ''}
          options={estimateBlockOptions(blocks)}
          onChange={setSelected}
        />
        <Button
          variant="outline"
          isDisabled={!block || Boolean(error)}
          onPress={() => {
            if (!block) return
            const patch = insertEstimateBlock(estimate, block, newId)
            if (!patch) return
            patchEstimate(estimate.id, patch)
            setSelected('')
          }}
        >
          Insertar bloque
        </Button>
      </div>
      {error ? <p className="text-muted-foreground text-xs">{error}</p> : null}
    </div>
  )
}
