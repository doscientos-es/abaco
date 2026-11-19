import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { ArrowDown, ArrowUp, Desktop, DeviceMobile, MagnifyingGlass } from '@phosphor-icons/react'
import { useContext } from 'react'

import { NavigationLayoutContext } from '../application/use-navigation-layout'
import { moveNavigationItem, type Destination } from '../domain/navigation-layout'

export function InterfaceSettings() {
  const layout = useContext(NavigationLayoutContext)
  if (!layout) return null
  const { mobile, choices, desktop, setShortcut, setDesktopGroups, setDesktopItems } = layout

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground text-sm">
        Los cambios se aplican al momento y se guardan en este navegador para tu cuenta y empresa.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DeviceMobile aria-hidden="true" /> Barra inferior del móvil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Elige los accesos de izquierda a derecha. Si eliges uno que ya está en la barra, se
            intercambiarán las posiciones.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {mobile.map((item, index) => (
              <label key={index} className="grid min-w-0 gap-1.5 text-sm font-medium">
                Acceso {index + 1}
                <select
                  value={item.to}
                  onChange={(event) => setShortcut(index, event.target.value)}
                  className="border-input bg-card min-h-11 w-full min-w-0 rounded-md border px-3 text-base font-normal"
                >
                  {choices.map((choice) => (
                    <option key={choice.to} value={choice.to}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <MagnifyingGlass aria-hidden="true" /> Buscar queda fijo a la derecha.
            </p>
            <Button variant="outline" size="sm" onPress={layout.resetMobile}>
              Restaurar accesos móviles
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Desktop aria-hidden="true" /> Barra lateral del ordenador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {desktop.length > 1
              ? 'Ordena los grupos y los accesos de cada grupo.'
              : 'Ordena los accesos de arriba abajo.'}
          </p>
          {desktop.length === 1 && desktop[0] ? (
            <OrderedLinks items={desktop[0].items} onChange={setDesktopItems} />
          ) : (
            <ol className="space-y-2">
              {desktop.map((group, index) => (
                <li key={group.id} className="border-border space-y-1 rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{group.label}</span>
                    <OrderButtons
                      label={`grupo ${group.label}`}
                      index={index}
                      count={desktop.length}
                      onMove={(direction) =>
                        setDesktopGroups(
                          moveNavigationItem(
                            desktop.map((item) => item.id),
                            index,
                            direction,
                          ),
                        )
                      }
                    />
                  </div>
                  {group.items.length > 1 ? (
                    <details>
                      <summary className="text-muted-foreground cursor-pointer py-2 text-sm">
                        Ordenar accesos de {group.label}
                      </summary>
                      <OrderedLinks items={group.items} onChange={setDesktopItems} />
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          <Button variant="outline" size="sm" onPress={layout.resetDesktop}>
            Restaurar orden del ordenador
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function OrderedLinks({
  items,
  onChange,
}: {
  items: readonly Destination[]
  onChange: (ids: string[]) => void
}) {
  return (
    <ol className="divide-border divide-y">
      {items.map((item, index) => (
        <li key={item.to} className="flex items-center justify-between gap-2 py-1 text-sm">
          <span>{item.label}</span>
          <OrderButtons
            label={item.label}
            index={index}
            count={items.length}
            onMove={(direction) =>
              onChange(
                moveNavigationItem(
                  items.map((entry) => entry.to),
                  index,
                  direction,
                ),
              )
            }
          />
        </li>
      ))}
    </ol>
  )
}

function OrderButtons({
  label,
  index,
  count,
  onMove,
}: {
  label: string
  index: number
  count: number
  onMove: (direction: -1 | 1) => void
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Subir ${label}`}
        isDisabled={index === 0}
        onPress={() => onMove(-1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Bajar ${label}`}
        isDisabled={index === count - 1}
        onPress={() => onMove(1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
    </div>
  )
}
