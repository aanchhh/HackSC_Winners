import { Route, Routes } from 'react-router'
import Navbar from './components/layout/Navbar'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import SearchPage from './pages/SearchPage'
import ChatPage from './pages/ChatPage'
import CostPage from './pages/CostPage'
import PreferencesPage from './pages/PreferencesPage'

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/ask" element={<ChatPage />} />
          <Route path="/true-cost" element={<CostPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  )
}
