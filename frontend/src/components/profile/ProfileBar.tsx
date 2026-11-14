import { useAppStore } from '../../store/useAppStore'

// TODO(Aanchal): building picker + priority sliders
export default function ProfileBar() {
  const { profile, setProfile } = useAppStore()
  return (
    <div className="flex items-center gap-4 border-b p-3 text-sm">
      <span className="font-bold text-[#990000]">TrojanScout</span>
      <label>Budget ${profile.budget}
        <input type="range" min={800} max={3000} step={50} value={profile.budget}
          onChange={(e) => setProfile({ budget: +e.target.value })} className="ml-2 align-middle" />
      </label>
      <label>Late nights/wk
        <input type="number" min={0} max={7} value={profile.lateNights}
          onChange={(e) => setProfile({ lateNights: +e.target.value })} className="ml-2 w-12 rounded border px-1" />
      </label>
    </div>
  )
}
