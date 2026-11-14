import type { Block } from '../../api/types'
export default function BlockSummary({ block }: { block: Block }) {
  return (
    <div className="space-y-2 text-sm">
      <p>{block.summary}</p>
      <p className="text-xs text-gray-600">
        Last 6 months: {Object.entries(block.incidents6mo).map(([k, v]) => `${v} ${k}`).join(' · ') || 'no incidents on record'}
      </p>
      <div className="flex flex-wrap gap-1">
        {block.citations.map((c) => (
          <a key={c.n} href={c.url} target="_blank" rel="noreferrer" className="rounded bg-gray-100 px-2 py-0.5 text-xs">
            [{c.n}] {c.source} · {c.date}
          </a>
        ))}
      </div>
    </div>
  )
}
