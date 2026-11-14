import { create } from 'zustand'
import type { Profile } from '../api/types'

interface AppState {
  profile: Profile
  selectedId: number | null
  highlightedIds: number[]
  compareIds: number[]
  setProfile: (p: Partial<Profile>) => void
  select: (id: number | null) => void
  highlight: (ids: number[]) => void
  toggleCompare: (id: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  profile: { budget: 1500, buildingIds: [], lateNights: 2, priorities: { cost: 0.4, commute: 0.3, zone: 0.2, incidents: 0.1 } },
  selectedId: null,
  highlightedIds: [],
  compareIds: [],
  setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
  select: (id) => set({ selectedId: id }),
  highlight: (ids) => set({ highlightedIds: ids }),
  toggleCompare: (id) =>
    set((s) => ({
      compareIds: s.compareIds.includes(id) ? s.compareIds.filter((x) => x !== id) : [...s.compareIds, id].slice(-3),
    })),
}))
