/* oxlint-disable jsx-a11y/prefer-tag-over-role -- An editable ARIA combobox requires a custom listbox, not a native select. */
import { Button, Dialog, DialogContent, DialogTitle, Input, Kbd } from '@doscientos/ui'
import { ArrowElbowDownLeft, MagnifyingGlass, Question, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'

import type { TenantData } from '@/shared/domain/types'

import { shortcutCommand } from '../application/keyboard-shortcuts'
import { useSearchResults } from '../application/use-search-results'
import type { SearchItem } from '../domain/search'

import './global-search.css'

export type SearchMode = 'search' | 'help' | 'mobile' | null

export function GlobalSearch({
  data,
  navigation,
  navigationOnly = false,
  mode,
  onModeChange,
}: {
  data?: TenantData | undefined
  navigation: SearchItem[]
  navigationOnly?: boolean
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
}) {
  const open = mode !== null
  const help = mode === 'help'
  const navigate = useNavigate()
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
        onModeChange(open ? null : 'search')
        prefixUntil = 0
      } else if (command === 'help') {
        event.preventDefault()
        onModeChange('help')
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
  }, [navigate, navigation, onModeChange, open])

  return (
    <>
      <div
        className={`workspace-tools workspace-tools--desktop${navigationOnly ? ' worker-search' : ''}`}
      >
        <Button
          variant="ghost"
          onPress={() => onModeChange('search')}
          aria-label="Búsqueda global"
          aria-haspopup="dialog"
          aria-expanded={mode === 'search'}
          aria-keyshortcuts="Control+k Meta+k"
          className="workspace-search-trigger"
        >
          <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {navigationOnly ? 'Buscar una sección…' : 'Buscar en Menos Líos…'}
          </span>
          <Kbd className="hidden sm:inline-flex">Ctrl / ⌘ K</Kbd>
        </Button>
        <Button
          variant="ghost"
          aria-label="Atajos de teclado"
          aria-haspopup="dialog"
          aria-expanded={help}
          aria-keyshortcuts="?"
          onPress={() => onModeChange('help')}
          className="mr-0.5 size-8 shrink-0 p-0"
        >
          <Question aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(nextOpen) => onModeChange(nextOpen ? 'search' : null)}>
        {open ? (
          <DialogContent
            overlaySlot="global-search-overlay"
            className="global-search-dialog overflow-hidden p-0"
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
                    [
                      navigationOnly ? 'Buscar una sección' : 'Buscar en toda la aplicación',
                      'Ctrl / ⌘ K',
                    ],
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
                <Button variant="outline" className="mt-6" onPress={() => onModeChange('search')}>
                  Abrir búsqueda
                </Button>
              </div>
            ) : (
              <SearchPanel
                data={data}
                navigation={navigation}
                navigationOnly={navigationOnly}
                focusInput={mode !== 'mobile'}
                onSelect={(item) => {
                  onModeChange(null)
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
  navigationOnly,
  focusInput,
  onSelect,
}: {
  data?: TenantData | undefined
  navigation: SearchItem[]
  navigationOnly: boolean
  focusInput: boolean
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
      <div className="global-search-field flex items-center gap-3 border-b px-5 py-3 pr-12">
        <MagnifyingGlass aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
        <Input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- This dialog is explicitly opened by the user to start searching.
          autoFocus={focusInput}
          aria-label="Buscar recursos y secciones"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-${selected.id}` : undefined}
          value={query}
          maxLength={120}
          placeholder={
            navigationOnly ? 'Buscar una sección…' : 'Clientes, presupuestos, facturas, personas…'
          }
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
      <div className="global-search-results max-h-[min(60svh,28rem)] overflow-y-auto p-2">
        <output className="text-muted-foreground block px-3 py-2 text-xs">
          {loading
            ? 'Buscando…'
            : query.trim()
              ? `${items.length} resultados`
              : navigationOnly
                ? 'Ir a una sección'
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
                <Kbd className="hidden md:inline-flex">{item.shortcut}</Kbd>
              ) : selected?.id === item.id ? (
                <ArrowElbowDownLeft
                  aria-hidden="true"
                  className="text-muted-foreground hidden size-4 md:block"
                />
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
      <div className="text-muted-foreground hidden flex-wrap items-center gap-4 border-t px-5 py-3 text-xs md:flex">
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
