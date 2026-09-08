// Percentage tables — what a training-max cycle actually prescribes.
//
// A table is weeks of rows, a row being [percent of training max, reps] with an optional
// third element marking the set taken as far as it goes. Data, not code: 5/3/1 is one entry
// here and nSuns or Madcow would be another, which is the whole reason this is a table
// rather than a policy per program.
//
// Nothing here knows about history or the store — see cyclePos for position, and
// progression.js for the training max, which needs readSession and would otherwise import
// in a circle.

export const CYCLES = {
  '531': {
    name: '5/3/1',
    desc: 'Four weeks of percentages off a training max, the last set of each taken as far as it goes.',
    weeks: [
      [[65, 5], [75, 5], [85, 5, 1]],
      [[70, 3], [80, 3], [90, 3, 1]],
      [[75, 5], [85, 3], [95, 1, 1]],
      [[40, 5], [50, 5], [60, 5]],
    ],
  },
  bbb: {
    name: 'Boring But Big',
    desc: 'Five sets of ten at a percentage that climbs across the cycle. Supplemental volume, not the main lift.',
    weeks: [
      [[50, 10], [50, 10], [50, 10], [50, 10], [50, 10]],
      [[60, 10], [60, 10], [60, 10], [60, 10], [60, 10]],
      [[70, 10], [70, 10], [70, 10], [70, 10], [70, 10]],
      [[50, 10], [50, 10], [50, 10], [50, 10], [50, 10]],
    ],
  },
}

export const CYCLE_KEYS = Object.keys(CYCLES)

const table = cyc => CYCLES[cyc] || CYCLES['531']
export const weeksOf = cyc => table(cyc).weeks
export const weekCount = cyc => table(cyc).weeks.length

// Snap to a multiple of the step the bar actually moves in. Rounding to one decimal on top
// because weights are stored and shown that way, and 1.25-kg steps otherwise read back as
// 92.3 when the plan said 92.25.
const snap = (v, step) => {
  const s = step > 0 ? step : 2.5
  return Math.max(s, Math.round(Math.round(v / s) * s * 10) / 10)
}

/** One week of a table as sets, against a training max. `week` wraps. */
export function rowsFor(cyc, week, tm, step) {
  const weeks = weeksOf(cyc)
  const wk = weeks[((week % weeks.length) + weeks.length) % weeks.length]
  return wk.map(([pct, r, amrap]) => ({ w: snap((tm || 0) * pct / 100, step), r, amrap: !!amrap }))
}

/**
 * Past sessions of one exercise that were logged against a cycle target, oldest first.
 *
 * `target.cyc` is the marker, which makes this self-anchoring: everything you lifted before
 * switching the exercise onto a cycle carries no such target and does not count, so there is
 * no "cycle start date" to store, migrate or get wrong.
 */
export function cycleSessions(S, exId) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (entry && entry.target && entry.target.cyc && (entry.sets || []).some(s => s.done)) {
      out.push({ d: w.d, entry })
    }
  })
  return out
}

/**
 * Which week of which cycle the next session of this exercise is, both zero-based.
 *
 * Derived rather than stored, like every other decision the engine makes. Delete a mislogged
 * workout and the position steps back on its own; two lifts drift apart only if you genuinely
 * trained one more often than the other, which is the right answer rather than a bug.
 */
export function cyclePos(S, exId, cyc) {
  const n = cycleSessions(S, exId).length
  const len = weekCount(cyc)
  return { n, cycle: Math.floor(n / len), week: n % len }
}
