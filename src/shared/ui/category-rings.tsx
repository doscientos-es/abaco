type Ring = { label: string; share: number; tone: { stroke: string } }

export function CategoryRings({
  rings,
  active,
  onHighlight,
}: {
  rings: Ring[]
  active: number | null
  onHighlight: (index: number | null) => void
}) {
  return (
    <svg
      data-slot="category-rings"
      viewBox="0 0 42 42"
      className="size-full -rotate-90"
      aria-hidden="true"
    >
      {rings.map(({ label, share, tone }, index) => {
        const radius = 19 - index * (10 / Math.max(rings.length - 1, 5))
        return (
          <g key={`${label}-${index}`}>
            <circle
              cx="21"
              cy="21"
              r={radius}
              fill="none"
              strokeWidth="1.5"
              className="stroke-muted"
            />
            <circle
              cx="21"
              cy="21"
              r={radius}
              fill="none"
              strokeWidth={active === index ? 1.8 : 1.5}
              pathLength="100"
              strokeLinecap="round"
              strokeDasharray={share < 100 ? `${share} ${100 - share}` : undefined}
              className={`${tone.stroke} ${active !== null && active !== index ? 'opacity-40' : ''}`}
              onMouseEnter={() => onHighlight(index)}
              onMouseLeave={() => onHighlight(null)}
            />
          </g>
        )
      })}
    </svg>
  )
}
