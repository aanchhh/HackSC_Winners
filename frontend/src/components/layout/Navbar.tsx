import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { useAppStore } from '../../store/useAppStore'

const LINKS = [
  { to: '/map', label: 'Explore Map' },
  { to: '/search', label: 'Search' },
  { to: '/ask', label: 'Ask Scout' },
  { to: '/true-cost', label: 'True Cost' },
  { to: '/preferences', label: 'Preferences' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const compareCount = useAppStore((s) => s.compareIds.length)
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${isActive ? 'bg-cardinal text-white' : 'text-stone-700 hover:bg-stone-100'}`
  return (
    <header className="sticky top-0 z-[1000] border-b border-stone-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cardinal text-sm font-extrabold text-gold">TS</span>
          <span className="text-lg font-extrabold tracking-tight">Trojan<span className="text-cardinal">Scout</span></span>
        </Link>
        <div className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={cls}>
              {l.label}
              {l.to === '/map' && compareCount > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-xs font-bold text-ink">{compareCount}</span>}
            </NavLink>
          ))}
        </div>
        <button className="ml-auto rounded-lg p-2 md:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
        </button>
      </nav>
      {open && (
        <div className="flex flex-col gap-1 border-t border-stone-200 px-4 py-3 md:hidden">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to} className={cls} onClick={() => setOpen(false)}>{l.label}</NavLink>)}
        </div>
      )}
    </header>
  )
}
