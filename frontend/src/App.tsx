import { Route, Routes } from 'react-router'
import Navbar from './components/layout/Navbar'
import { AlertBanner } from './components/free/Alerts'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import SearchPage from './pages/SearchPage'
import ChatPage from './pages/ChatPage'
import CostPage from './pages/CostPage'
import PreferencesPage from './pages/PreferencesPage'
import RidesPage from './pages/RidesPage'
import FreePage from './pages/FreePage'
import ProfilePage from './pages/ProfilePage'
import AuthDonePage from './pages/AuthDonePage'

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <Navbar />
      <AlertBanner />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/ask" element={<ChatPage />} />
          <Route path="/true-cost" element={<CostPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/rides" element={<RidesPage />} />
          <Route path="/free" element={<FreePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/auth/done" element={<AuthDonePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  )
}
