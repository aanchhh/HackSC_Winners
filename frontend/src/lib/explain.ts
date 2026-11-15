// Plain-English definitions shown wherever these metrics appear.
export const EXPLAIN = {
  longestWalk:
    'The walk to the furthest of the class buildings you picked in Preferences, on real streets (OpenStreetMap) at a normal pace (80 m/min). It’s your worst-case daily walk, so a place 5 min from Marshall but 25 min from Viterbi shows 25.',
  fit:
    'A 0–100 match to your Preferences. Four sub-scores, each 0–1, averaged with your priority weights: Cost (True Cost vs budget: 1 if ≤ half your budget, 0.5 at budget, 0 at 1.5×), Commute (1 − longest walk ÷ 30 min), Zone (inside DPS + inside Fryft, ÷ 2), Incidents (fewer LAPD-reported incidents within 150 m than other listings → higher).',
  trueCost: 'Rent + utilities + Metro pass (if you need one) + late-night rides home when outside the Fryft area. Your share if you split with roommates.',
  incidents: 'Incidents reported to LAPD within 150 m in the last 6 months (theft, assault, robbery, burglary…). Warrants, DUIs and drug possession are excluded. Counts are facts, not labels.',
  dps: 'USC Department of Public Safety patrols this area 24/7. Boundary traced from the DPS Crime Analysis Unit map.',
  fryft: 'USC’s free late-night Lyft service. In this app the Fryft area uses the same boundary as the DPS zone.',
}
