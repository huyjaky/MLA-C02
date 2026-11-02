import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpenText, Dumbbell, Layers, LayoutGrid, ListChecks, LogOut, Moon, NotebookPen, PlayCircle, Sun, SunMoon, Library, Languages, UserRound } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useApp } from '../state/AppContext'
import { BiText } from './BiText'
import { SectionTab } from './SectionTab'
import { Segmented } from './Segmented'

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: LayoutGrid, end: true },
  { to: '/quizzes', key: 'nav.quizzes', icon: ListChecks },
  { to: '/mistakes', key: 'mistakes.title', icon: Dumbbell },
  { to: '/flashcards', key: 'nav.flashcards', icon: Layers },
  { to: '/glossary', key: 'nav.glossary', icon: Library },
  { to: '/notes', key: 'nav.notes', icon: NotebookPen },
]

export function Shell() {
  const { repo, tracker, state, l, user, logout } = useApp()
  const { pathname } = useLocation()
  const main = useRef(null)

  // New route: start at the top and move focus into the page for screen readers.
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{l.ui('a11y.skip')}</a>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span>
            <strong>MLA-C02</strong>
            <small>{l.ui('app.tagline')}</small>
          </span>
        </NavLink>
        <nav className="nav" aria-label={l.ui('nav.main')}>
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav__link">
              <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
              {l.ui(key)}
            </NavLink>
          ))}
        </nav>
        <nav className="dividers" aria-label={l.ui('nav.sections')}>
          <p className="dividers__label"><BookOpenText size={14} aria-hidden="true" /> {l.ui('nav.sections')}</p>
          {repo.studySections.map((s) => {
            const { ratio } = tracker.sectionProgress(s)
            return (
              <NavLink key={s.id} to={`/section/${s.id}`} className="divider" style={{ '--done': ratio }}>
                <SectionTab id={s.id} size="sm" />
                <span className="divider__title"><BiText pair={s.title} /></span>
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          {state.lastLecture && (
            <Link to={`/lecture/${state.lastLecture}?resume=1`} className="btn btn--primary topbar__resume">
              <PlayCircle size={16} aria-hidden="true" /> {l.ui('nav.resume')}
            </Link>
          )}
          <Segmented
            label={l.ui('settings.language')}
            value={state.settings.lang}
            onChange={(v) => tracker.setSetting('lang', v)}
            options={[{ value: 'vi', label: 'VI' }, { value: 'en', label: 'EN' }]}
          />
          <button
            type="button"
            className="toggle"
            aria-pressed={state.settings.dual}
            onClick={() => tracker.setSetting('dual', !state.settings.dual)}
          >
            <Languages size={16} aria-hidden="true" />
            {l.ui('settings.dual')}
          </button>
          <Segmented
            label={l.ui('settings.theme')}
            value={state.settings.theme}
            onChange={(v) => tracker.setSetting('theme', v)}
            options={[
              { value: 'light', icon: <Sun size={15} />, title: l.ui('settings.light') },
              { value: 'system', icon: <SunMoon size={15} />, title: l.ui('settings.system') },
              { value: 'dark', icon: <Moon size={15} />, title: l.ui('settings.dark') },
            ]}
          />
          <span className="topbar__user" title={l.ui('auth.signedInAs')}>
            <UserRound size={16} aria-hidden="true" /> {user.username}
          </span>
          <button type="button" className="toggle" onClick={logout}>
            <LogOut size={16} aria-hidden="true" /> {l.ui('auth.logout')}
          </button>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="main" key={pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
