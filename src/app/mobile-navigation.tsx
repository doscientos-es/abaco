import { Button } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'

import {
  MobileBottomBar,
  MobileBottomBarItem,
  MobileBottomBarSearch,
} from '@/shared/ui/mobile-bottom-bar'

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
    <MobileBottomBar shortcuts={items.length}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-label={item.label}
          activeOptions={{ exact: item.to === '/' }}
          activeProps={{ className: 'mobile-bottom-nav__link--active' }}
          className="mobile-bottom-nav__link"
        >
          <MobileBottomBarItem {...item} />
        </Link>
      ))}
      <Button
        variant="ghost"
        aria-label="Buscar y ver todas las secciones"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        onPress={onOpenSearch}
        className="mobile-bottom-nav__link"
      >
        <MobileBottomBarSearch />
      </Button>
    </MobileBottomBar>
  )
}
