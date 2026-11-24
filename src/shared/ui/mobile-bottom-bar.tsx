import { MagnifyingGlass } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import './mobile-bottom-bar.css'

export function MobileBottomBar({
  shortcuts,
  children,
  preview = false,
}: {
  shortcuts: number
  children: ReactNode
  preview?: boolean
}) {
  const Element = preview ? 'div' : 'nav'
  return (
    <Element
      role={preview ? 'group' : undefined}
      aria-label={preview ? 'Vista previa de la barra inferior' : 'Navegación móvil'}
      className="mobile-bottom-nav"
      data-preview={preview || undefined}
      style={{ gridTemplateColumns: `repeat(${shortcuts + 1}, minmax(0, 1fr))` }}
    >
      {children}
    </Element>
  )
}

export function MobileBottomBarItem({
  icon,
  label,
  mobileLabel,
}: {
  icon: ReactNode
  label: string
  mobileLabel?: string
}) {
  return (
    <>
      {icon}
      <span>{mobileLabel ?? label}</span>
    </>
  )
}

export function MobileBottomBarSearch() {
  return (
    <MobileBottomBarItem
      icon={<MagnifyingGlass aria-hidden="true" className="size-[18px] shrink-0" />}
      label="Buscar"
    />
  )
}
