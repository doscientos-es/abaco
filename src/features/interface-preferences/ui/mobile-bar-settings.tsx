import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { ArrowLeft, ArrowRight, DeviceMobile, DotsSixVertical } from '@phosphor-icons/react'
import { useId, useState } from 'react'

import { SelectField } from '@/shared/ui/form'
import {
  MobileBottomBar,
  MobileBottomBarItem,
  MobileBottomBarSearch,
} from '@/shared/ui/mobile-bottom-bar'

import type { MobileDestination, NavigationLayout } from '../application/use-navigation-layout'

// Keyboard users can select a shortcut normally and reorder it with the arrow buttons.
const sensors = [PointerSensor]

type Props = Pick<
  NavigationLayout,
  'mobile' | 'choices' | 'moveShortcut' | 'setShortcut' | 'resetMobile'
>

export function MobileBarSettings({
  mobile,
  choices,
  moveShortcut,
  setShortcut,
  resetMobile,
}: Props) {
  const [selectedRoute, setSelectedRoute] = useState<string>()
  const instructionsId = useId()
  const index = Math.max(
    0,
    mobile.findIndex((item) => item.to === selectedRoute),
  )
  const selected = mobile[index]

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <DeviceMobile aria-hidden="true" /> Barra inferior del móvil
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p id={instructionsId} className="text-muted-foreground text-sm">
          Arrastra los accesos o usa las flechas para ordenarlos. Selecciona uno para cambiarlo.
          Buscar queda fijo a la derecha.
        </p>

        <div className="border-border bg-muted/40 mx-auto w-full max-w-sm overflow-hidden rounded-xl border">
          <div className="text-muted-foreground flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
            Vista previa
            <DotsSixVertical aria-hidden="true" className="size-4" />
          </div>
          <DragDropProvider
            sensors={sensors}
            onDragEnd={({ canceled, operation: { source } }) => {
              if (canceled || !isSortable(source) || typeof source.id !== 'string') return
              moveShortcut(source.id, source.index)
              setSelectedRoute(source.id)
            }}
          >
            <MobileBottomBar shortcuts={mobile.length} preview>
              {mobile.map((item, position) => (
                <PreviewShortcut
                  key={item.to}
                  item={item}
                  index={position}
                  selected={item.to === selected?.to}
                  sortable={mobile.length > 1}
                  instructionsId={instructionsId}
                  onSelect={() => setSelectedRoute(item.to)}
                />
              ))}
              <span className="mobile-bottom-nav__link">
                <MobileBottomBarSearch />
              </span>
            </MobileBottomBar>
          </DragDropProvider>
        </div>

        {selected ? (
          <div className="mx-auto flex w-full max-w-sm flex-wrap items-end gap-2">
            <SelectField
              label={`Cambiar acceso ${index + 1}`}
              value={selected.to}
              className="min-w-0 flex-1 basis-36"
              searchable={false}
              options={choices.map(({ to, label }) => ({ value: to, label }))}
              onChange={(to) => {
                setShortcut(index, to)
                setSelectedRoute(to)
              }}
            />
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label={`Mover ${selected.label} a la izquierda`}
                isDisabled={index === 0}
                onPress={() => moveShortcut(selected.to, index - 1)}
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label={`Mover ${selected.label} a la derecha`}
                isDisabled={index === mobile.length - 1}
                onPress={() => moveShortcut(selected.to, index + 1)}
              >
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              resetMobile()
              setSelectedRoute(undefined)
            }}
          >
            Restaurar accesos móviles
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PreviewShortcut({
  item,
  index,
  selected,
  sortable,
  instructionsId,
  onSelect,
}: {
  item: MobileDestination
  index: number
  selected: boolean
  sortable: boolean
  instructionsId: string
  onSelect: () => void
}) {
  const { ref, isDragging } = useSortable({ id: item.to, index, disabled: !sortable })

  return (
    <button
      ref={ref}
      type="button"
      aria-label={item.label}
      aria-pressed={selected}
      aria-describedby={instructionsId}
      className={`mobile-bottom-nav__link hover:bg-muted ${sortable ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${selected ? 'mobile-bottom-nav__link--active' : ''} ${isDragging ? 'bg-sidebar relative z-10 opacity-80' : ''}`}
      onClick={onSelect}
    >
      <MobileBottomBarItem {...item} />
    </button>
  )
}
