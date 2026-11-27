import { brand } from '@/shared/lib/brand'

import './public-flow.css'

export function FlowBrand() {
  return (
    <span className="flow-brand">
      <img src={brand.mark} alt="" width={36} height={36} />
      {brand.name}
    </span>
  )
}

export function FlowProgress({
  labels,
  step,
  name = 'Progreso',
}: {
  labels: readonly string[]
  step: number
  name?: string
}) {
  return (
    <section className="flow-progress" aria-label={name}>
      <div className="flow-progress-caption">
        <strong>{labels[step]}</strong>
        <span>
          Paso {step + 1} de {labels.length}
        </span>
      </div>
      <ol className="flow-progress-track" aria-label="Pasos">
        {labels.map((label, index) => (
          <li
            key={label}
            data-reached={index <= step}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className="sr-only">
              {label}
              {index < step ? ' · completado' : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function FlowIllustration({ variant = 'journey' }: { variant?: 'journey' | 'start' }) {
  return (
    <svg
      className="flow-illustration"
      viewBox="0 0 390 164"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M54 94c42-74 104-58 146-18 40 38 84 47 139-17"
        stroke="#87ad72"
        strokeWidth="3"
        strokeDasharray="4 8"
        strokeLinecap="round"
      />
      <g className="flow-art-card" transform="translate(37 26) rotate(-9 41 47)">
        <rect x="3" y="11" width="86" height="101" rx="19" fill="#b9d5a5" />
        <rect width="86" height="105" rx="19" fill="#fdfff6" stroke="#263e25" strokeWidth="3" />
        <path
          d="M20 32h45M20 49h34M20 66h25"
          stroke="#263e25"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="m52 76 7 7 13-14"
          stroke="#3f6a33"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="flow-art-card" transform="translate(155 51) rotate(7 43 40)">
        <rect x="2" y="8" width="90" height="76" rx="17" fill="#b9d5a5" />
        <rect width="90" height="76" rx="17" fill="#d9f2c0" stroke="#263e25" strokeWidth="3" />
        <path
          d="M16 25h58M31 13v15M59 13v15"
          stroke="#263e25"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect x="23" y="42" width="19" height="14" rx="4" fill="#3f6a33" />
        <rect x="48" y="42" width="19" height="14" rx="4" fill="#a5cb8b" />
      </g>
      <g className="flow-art-card" transform="translate(276 19) rotate(11 37 46)">
        <rect x="3" y="8" width="72" height="99" rx="16" fill="#b9d5a5" />
        <rect width="72" height="100" rx="16" fill="#f0f7cf" stroke="#263e25" strokeWidth="3" />
        {variant === 'journey' ? (
          <path
            d="M48 37c-4-4-7-5-12-5-9 0-15 7-15 16s6 16 15 16c5 0 8-1 12-5M17 45h22M17 52h19"
            stroke="#263e25"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M36 25c0 14 8 23 22 25-14 2-22 11-22 25-2-14-10-23-23-25 13-2 21-11 23-25Z"
            fill="#42813a"
          />
        )}
        <path d="M22 79h28" stroke="#85a374" strokeWidth="4" strokeLinecap="round" />
      </g>
      <path
        d="M141 27v16m-8-8h16m114 97v15m-7-8h14M364 116v13m-6-7h13"
        stroke="#46703b"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
