/* oxlint-disable jsx-a11y/prefer-tag-over-role -- An editable ARIA combobox requires a custom listbox, not a native select. */
import { Button, Dialog, DialogContent, DialogTitle, Input, Kbd } from '@doscientos/ui'
import { ArrowElbowDownLeft, MagnifyingGlass, Question, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'

import type { TenantData } from '@/shared/domain/types'

import { shortcutCommand } from '../application/keyboard-shortcuts'
import { useSearchResults } from '../application/use-search-results'
import type { SearchItem } from '../domain/search'

export function GlobalSearch({
  data,
  navigation,
}: {
  data?: TenantData | undefined
  navigation: SearchItem[]
}) {
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const navigate = useNavigate()
  function showSearch() {
    setHelp(false)
    setOpen(true)
  }
  useEffect(() => {
    let prefixUntil = 0
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null
      const editing = Boolean(
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"]',
        ),
      )
      const inDialog = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'))
      const command = shortcutCommand(event, editing, inDialog)
      if (command === 'search') {
        event.preventDefault()
        setHelp(false)
        setOpen((value) => !value)
        prefixUntil = 0
      } else if (command === 'help') {
        event.preventDefault()
        setHelp(true)
        setOpen(true)
        prefixUntil = 0
      } else if (command === 'filter') {
        const input = document.querySelector<HTMLInputElement>(
          '#main-content input[aria-label^="Buscar"], #main-content input[type="search"], #main-content input[placeholder^="Buscar"]',
        )
        if (input) {
          event.preventDefault()
          input.focus()
        }
        prefixUntil = 0
      } else if (command && Date.now() < prefixUntil) {
        prefixUntil = 0
        const item = navigation.find((item) => item.shortcut === `g ${command}`)
        if (item) {
          event.preventDefault()
          void navigate(item.target)
        }
      } else prefixUntil = command === 'prefix' ? Date.now() + 1000 : 0
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate, navigation])

  return (
    <>
      <div className="workspace-tools">
        <Button
          variant="ghost"
          onPress={showSearch}
          aria-label="Búsqueda global"
          aria-keyshortcuts="Control+k Meta+k"
          className="workspace-search-trigger"
        >
          <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1 text-left">Buscar en Ábaco…</span>
          <Kbd className="hidden sm:inline-flex">Ctrl / ⌘ K</Kbd>
        </Button>
        <Button
          variant="ghost"
          aria-label="Atajos de teclado"
          aria-keyshortcuts="?"
          onPress={() => {
            setHelp(true)
            setOpen(true)
          }}
          className="size-9 shrink-0 p-0"
        >
          <Question aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent
            className="app-dialog app-dialog--details overflow-hidden p-0"
            aria-label={help ? 'Atajos de teclado' : 'Búsqueda global'}
          >
            <DialogTitle className="sr-only">
              {help ? 'Atajos de teclado' : 'Búsqueda global'}
            </DialogTitle>
            {help ? (
              <div className="p-6">
                <h2 className="mb-5 text-lg font-semibold">Muévete sin soltar el teclado</h2>
                <dl className="space-y-3 text-sm">
                  {[
                    ['Buscar en toda la aplicación', 'Ctrl / ⌘ K'],
                    ['Buscar en esta página', '/'],
                    ['Ver los atajos', '?'],
                    ...navigation
                      .filter((item) => item.shortcut)
                      .map((item) => [item.title, item.shortcut]),
                    ['Cerrar búsqueda o diálogo', 'Esc'],
                  ].map(([label, keys]) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <dt>{label}</dt>
                      <dd>
                        <Kbd>{keys}</Kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button variant="outline" className="mt-6" onPress={showSearch}>
                  Abrir búsqueda
                </Button>
              </div>
            ) : (
              <SearchPanel
                data={data}
                navigation={navigation}
                onSelect={(item) => {
                  setOpen(false)
                  void navigate(item.target)
                }}
              />
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

function SearchPanel({
  data,
  navigation,
  onSelect,
}: {
  data?: TenantData | undefined
  navigation: SearchItem[]
  onSelect: (item: SearchItem) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const { items, loading, failed, retry } = useSearchResults(data, navigation, query, true)
  const selected = items[Math.min(active, Math.max(0, items.length - 1))]
  const optionRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    optionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected?.id])
  return (
    <>
      <div className="flex items-center gap-3 border-b px-5 py-3 pr-12">
        <MagnifyingGlass aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
        <Input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- This dialog is explicitly opened by the user to start searching.
          autoFocus
          aria-label="Buscar recursos y secciones"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-${selected.id}` : undefined}
          value={query}
          maxLength={120}
          placeholder="Clientes, presupuestos, facturas, personas…"
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((value) =>
                items.length
                  ? (Math.min(value, items.length - 1) +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      items.length) %
                    items.length
                  : 0,
              )
            } else if (event.key === 'Enter' && selected) {
              event.preventDefault()
              onSelect(selected)
            }
          }}
        />
      </div>
      <div className="max-h-[min(60svh,28rem)] overflow-y-auto p-2">
        <output className="text-muted-foreground block px-3 py-2 text-xs">
          {loading
            ? 'Buscando…'
            : query.trim()
              ? `${items.length} resultados`
              : 'Ir a una sección o buscar un recurso'}
        </output>
        <div id={listId} role="listbox" aria-label="Resultados de búsqueda">
          {items.map((item) => (
            <button
              type="button"
              tabIndex={-1}
              key={item.id}
              id={`${listId}-${item.id}`}
              ref={selected?.id === item.id ? optionRef : undefined}
              role="option"
              aria-selected={selected?.id === item.id}
              className={`search-result w-full text-left ${selected?.id === item.id ? 'search-result--active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
            >
              <span className="search-result-icon">
                <ArrowRight aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="text-muted-foreground block text-xs">{item.category}</span>
              </span>
              {item.shortcut ? (
                <Kbd>{item.shortcut}</Kbd>
              ) : selected?.id === item.id ? (
                <ArrowElbowDownLeft aria-hidden="true" className="text-muted-foreground size-4" />
              ) : null}
            </button>
          ))}
        </div>
        {!items.length && !loading ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            No hay coincidencias. Prueba con otro nombre o referencia.
          </p>
        ) : null}
        {failed ? (
          <div className="bg-muted flex items-center justify-between gap-3 rounded-lg p-3 text-xs">
            <output>Algunos recursos no se han podido consultar.</output>
            <Button variant="ghost" size="sm" onPress={retry}>
              Reintentar
            </Button>
          </div>
        ) : null}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-4 border-t px-5 py-3 text-xs">
        <span>
          <Kbd>↑ ↓</Kbd> Navegar
        </span>
        <span>
          <Kbd>Enter</Kbd> Abrir
        </span>
        <span className="ml-auto">
          <Kbd>Esc</Kbd> Cerrar
        </span>
      </div>
    </>
  )
}
