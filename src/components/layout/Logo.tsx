import { Link } from 'react-router-dom'

export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link to="/" className={`logo logo--${tone}`} aria-label="Gatherly AI home">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`lg-${tone}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8f74ff" />
            <stop offset="1" stopColor="#3b7bff" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={tone === 'light' ? '#ffffff14' : '#0b1033'} />
        <path d="M32 12l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill={`url(#lg-${tone})`} />
      </svg>
      <span className="logo__text">Gatherly<span className="logo__ai"> AI</span></span>
    </Link>
  )
}
