import { Button } from '@doscientos/ui'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import type { NavItem } from './frame-navigation'

import './mobile-navigation.css'

export function MobileNavigation({
  items,
  searchOpen,
  onOpenSearch,
}: {
  items: readonly NavItem[]
  searchOpen: boolean
  onOpenSearch: () => void
}) {
  return (
    <nav
      aria-label="Navegación móvil"
      className="mobile-bottom-nav"
      style={{
        gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-label={item.label}
          activeOptions={{ exact: item.to === '/' }}
          activeProps={{ className: 'mobile-bottom-nav__link--active' }}
          className="mobile-bottom-nav__link"
        >
          {item.icon}
          <span>{item.mobileLabel ?? item.label}</span>
        </Link>
      ))}
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        onPress={onOpenSearch}
        className="mobile-bottom-nav__link"
      >
        <MagnifyingGlass aria-hidden="true" className="size-[18px] shrink-0" />
        <span>Buscar</span>
      </Button>
    </nav>
  )
}
