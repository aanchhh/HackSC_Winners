export interface Step { label: string; status: 'running' | 'done' }
export default function AgentSteps({ steps }: { steps: Step[] }) {
  return (
    <ul className="space-y-0.5 text-xs text-gray-600">
      {steps.map((s, i) => <li key={i}>{s.status === 'done' ? '✅' : '⏳'} {s.label}</li>)}
    </ul>
  )
}
