import { encode } from 'uqr'

export function EquipmentLabelCode({ url }: { url: string }) {
  const { data } = encode(url, { ecc: 'M', border: 4 })
  const size = data.length
  const path = data
    .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join('')
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="184"
      height="184"
      role="img"
      aria-label="Código QR para abrir el equipo en Menos Líos"
      shapeRendering="crispEdges"
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  )
}
