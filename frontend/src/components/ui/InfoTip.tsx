import { useState } from 'react'

// Small "?" that explains a metric on hover/tap.
export default function InfoTip({ children, side = 'bottom' }: { children: React.ReactNode; side?: 'bottom' | 'left' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen(!open)} aria-label="Explain"
        className="grid h-4 w-4 place-items-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-600 hover:bg-cardinal hover:text-white">?</button>
      {open && (
        <span className={`absolute z-[2000] w-64 rounded-xl bg-ink p-3 text-left text-xs font-normal leading-relaxed text-white shadow-xl ${side === 'left' ? 'right-6 top-0' : 'left-1/2 top-6 -translate-x-1/2'}`}>
          {children}
        </span>
      )}
    </span>
  )
}
