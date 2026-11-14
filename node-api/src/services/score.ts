// Fit = w_cost·budget headroom + w_commute·commute headroom + w_zone·(inFryft+inDps)/2 + w_inc·(1 − norm incidents)
export interface ScoreInput { total: number; budget: number; maxCommuteMin: number; worstCommuteMin: number; inFryft: boolean; inDps: boolean; incidentsNorm: number }
const clamp = (x: number) => Math.max(0, Math.min(1, x))

export function fitScore(i: ScoreInput, w = { cost: 0.4, commute: 0.3, zone: 0.2, incidents: 0.1 }) {
  const sum = w.cost + w.commute + w.zone + w.incidents || 1
  const s =
    w.cost * clamp((i.budget - i.total) / i.budget + 0.5) +
    w.commute * clamp(1 - i.worstCommuteMin / Math.max(i.maxCommuteMin, 1)) +
    w.zone * ((+i.inFryft + +i.inDps) / 2) +
    w.incidents * clamp(1 - i.incidentsNorm)
  return Math.round((s / sum) * 100) / 100
}
