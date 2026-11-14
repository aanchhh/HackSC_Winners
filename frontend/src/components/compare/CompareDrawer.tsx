import { useAppStore } from '../../store/useAppStore'
import ReportCard from '../report/ReportCard'

// TODO(Aanchal): drawer UI + "add to compare" button on ReportCard
export default function CompareDrawer() {
  const ids = useAppStore((s) => s.compareIds)
  if (ids.length < 2) return null
  return (
    <div className="grid grid-cols-3 gap-2 border-t bg-white">
      {ids.map((id) => <ReportCard key={id} id={id} />)}
    </div>
  )
}
