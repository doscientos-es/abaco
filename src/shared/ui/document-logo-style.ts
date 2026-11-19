import type { CSSProperties } from 'react'

import type { DocumentAppearance } from '@/shared/domain/document-appearance'

export function documentLogoStyle(appearance?: DocumentAppearance): CSSProperties | undefined {
  if (!appearance) return undefined
  const { logoSize, logoPosition } = appearance
  return {
    ...(logoSize === 'small' ? { maxHeight: '7mm', maxWidth: 'min(100%, 28mm)' } : {}),
    ...(logoSize === 'large' ? { maxHeight: '23mm', maxWidth: 'min(100%, 58mm)' } : {}),
    ...(logoPosition !== 'auto'
      ? {
          display: 'block',
          marginInlineStart: logoPosition === 'left' ? 0 : 'auto',
          marginInlineEnd: logoPosition === 'right' ? 0 : 'auto',
        }
      : {}),
  }
}
