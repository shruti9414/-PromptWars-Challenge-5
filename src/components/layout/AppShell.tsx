import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { EVENT_TYPE_LABEL } from '../../data/constants'
import { dismissLoadNotice, getLoadNotice } from '../../state/persistence'
import { store, useSaveFailed, useStore } from '../../state/store'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { IconButton } from '../ui/Button'
import { ToastHost } from '../ui/Toast'
import { Logo } from './Logo'

interface NavItem { to: string; label: string; icon: IconName }

const NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/app/events', label: 'My Events', icon: 'calendar' },
  { to: '/app/ai', label: 'AI Planner', icon: 'bot' },
  { to: '/app/budget', label: 'Budget', icon: 'wallet' },
  { to: '/app/timeline', label: 'Timeline', icon: 'tasks' },
  { to: '/app/vendors', label: 'Vendor Checklist', icon: 'store' },
  { to: '/app/vendors/directory', label: 'Vendor Directory', icon: 'compass' },
  { to: '/app/ideas', label: 'Ideas Gallery', icon: 'sparkles' },
  { to: '/app/guests', label: 'Guests', icon: 'users' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
]

function EventSwitcher() {
  const events = useStore((s) => s.events)
  const activeId = useStore((s) => s.activeEventId)
  if (events.length === 0) return null
  return (
    <div className="switcher">
      <label htmlFor="event-switcher" className="switcher__label">Planning</label>
      <select
        id="event-switcher"
        className="switcher__select"
        value={activeId ?? ''}
        onChange={(e) => store.dispatch({ type: 'event/setActive', id: e.target.value })}
      >
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({EVENT_TYPE_LABEL[e.type]})
          </option>
        ))}
      </select>
    </div>
  )
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="sidenav">
      <ul>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === '/app/vendors'} className="sidenav__link" onClick={onNavigate}>
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Tells people when their data could not be read at startup, or when the browser refused to save. */
function StorageNotices() {
  const saveFailed = useSaveFailed()
  const [loadNotice, setLoadNotice] = useState(getLoadNotice)
  if (!saveFailed && !loadNotice) return null
  return (
    <div className="notice storage-notice" role="status">
      <Icon name="alert" size={18} />
      <div>
        {saveFailed && (
          <p>Your latest changes could not be saved in this browser (storage may be full or blocked, for example in a private window). They will be lost when you close this tab. Use Settings &rarr; Export as JSON to keep a copy.</p>
        )}
        {loadNotice && (
          <p>
            {loadNotice}{' '}
            <button type="button" className="link" onClick={() => { dismissLoadNotice(); setLoadNotice(null) }}>Dismiss</button>
          </p>
        )}
      </div>
    </div>
  )
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Move focus to the page content after a route change so keyboard and screen-reader users land on the new screen.
  useEffect(() => {
    setMenuOpen(false)
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to main content</a>
      <aside className={`shell__side${menuOpen ? ' is-open' : ''}`} aria-label="Sidebar">
        <div className="shell__brand">
          <Logo tone="light" />
          <IconButton className="shell__close" icon="x" label="Close menu" onClick={() => setMenuOpen(false)} />
        </div>
        <EventSwitcher />
        <SideNav onNavigate={() => setMenuOpen(false)} />
        <div className="shell__foot">
          <p className="shell__note">
            <Icon name="info" size={16} /> Your events are saved only in this browser. Sample events are fictional. AI plans are labelled live or demo.
          </p>
          <Link to="/" className="shell__home">Back to landing page</Link>
        </div>
      </aside>
      {menuOpen && <div className="shell__scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="shell__main">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-btn topbar__menu"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <Logo />
          <span className="topbar__badge">Saved in this browser</span>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="content">
          <StorageNotices />
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  )
}

