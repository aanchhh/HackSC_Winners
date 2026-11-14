import MapView from './components/map/MapView'
import ProfileBar from './components/profile/ProfileBar'
import ReportCard from './components/report/ReportCard'
import ChatPanel from './components/chat/ChatPanel'
import CompareDrawer from './components/compare/CompareDrawer'
import { useAppStore } from './store/useAppStore'

// Layout: map left, list/report/chat right
export default function App() {
  const selectedId = useAppStore((s) => s.selectedId)
  return (
    <div className="flex h-full flex-col">
      <ProfileBar />
      <div className="flex min-h-0 flex-1">
        <div className="flex-1"><MapView /></div>
        <aside className="flex w-[420px] flex-col border-l">
          <div className="max-h-[55%] overflow-y-auto border-b">
            {selectedId ? <ReportCard id={selectedId} /> : <p className="p-4 text-sm text-gray-500">Click a listing to see its Trojan Report Card.</p>}
          </div>
          <div className="min-h-0 flex-1"><ChatPanel /></div>
        </aside>
      </div>
      <CompareDrawer />
    </div>
  )
}
