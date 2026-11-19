import type { CSSProperties } from 'react'

export const hexColor = /^#[0-9a-f]{6}$/i
export const defaultBrandColor = '#2a4227'

type BrandThemeStyle = CSSProperties &
  Record<'--primary' | '--primary-foreground' | '--ring', string>

export function brandThemeStyle(color?: string): BrandThemeStyle | undefined {
  if (!color || !hexColor.test(color)) return undefined

  const linear = (offset: number) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
  const whiteContrast = 1.05 / (luminance + 0.05)
  const blackContrast = (luminance + 0.05) / 0.05
  return {
    '--primary': color,
    '--primary-foreground': blackContrast > whiteContrast ? '#000000' : '#ffffff',
    '--ring': color,
  }
}
