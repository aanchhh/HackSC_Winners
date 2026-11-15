import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile } from '../api/types'

interface AppState {
  profile: Profile
  compareIds: string[]
  highlightedIds: string[]
  setProfile: (p: Partial<Profile>) => void
  toggleCompare: (id: string) => void
  clearCompare: () => void
  highlight: (ids: string[]) => void
}

export const MAX_COMPARE = 3

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      profile: { budget: 1500, buildingIds: [1, 3], lateNights: 2, priorities: { cost: 0.4, commute: 0.3, zone: 0.2, incidents: 0.1 } },
      compareIds: [],
      highlightedIds: [],
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      toggleCompare: (id) =>
        set((s) => ({ compareIds: s.compareIds.includes(id) ? s.compareIds.filter((x) => x !== id) : [...s.compareIds, id].slice(-MAX_COMPARE) })),
      clearCompare: () => set({ compareIds: [] }),
      highlight: (ids) => set({ highlightedIds: ids }),
    }),
    { name: 'trojanscout', partialize: (s) => ({ profile: s.profile, compareIds: s.compareIds }) },
  ),
)
