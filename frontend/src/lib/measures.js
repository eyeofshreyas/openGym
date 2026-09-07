// Body measurements — the tape-measure numbers, kept the way body weight is kept.
//
// One series per measurement, each entry the same {date, value, timestamp} triple as a
// weigh-in, sorted by date and upserted by day. A map of series rather than one flat list of
// {date, key, value}, because then every series drops straight into the chart body weight
// already uses and reads back with the same helpers.
//
// The whole state is persisted and pushed as one blob (store/useStore.js), and loaded state is
// overlaid on DEF, so this needed no migration, no sync work and no export format: an existing
// profile picks up an empty `measures` on next load and a backup carries it from then on.

import { todayISO } from './format.js'

// Head to toe, matching how MUSCLES and the body map order things, so the sheet reads like
// working down a person rather than a list someone typed in the order they thought of them.
export const MEASURES = [
  { k: 'neck', name: 'Neck' },
  { k: 'shoulders', name: 'Shoulders' },
  { k: 'chest', name: 'Chest' },
  { k: 'arm', name: 'Arm' },
  { k: 'waist', name: 'Waist' },
  { k: 'hips', name: 'Hips' },
  { k: 'thigh', name: 'Thigh' },
  { k: 'calf', name: 'Calf' },
]

/**
 * Length unit, taken from the weight unit rather than asked for separately: kg goes with cm
 * and lb with inches nearly everywhere, and one more setting to get wrong is worse than the
 * rare profile that wants the other pairing. It labels a number you typed, so the wrong one
 * reads wrong rather than storing anything wrong.
 */
export const lengthUnit = S => (S && S.unit === 'lb' ? 'in' : 'cm')

/** Whether a profile holds any measurement at all — see hasData in the store. */
export const anyMeasures = measures =>
  MEASURES.some(m => ((measures || {})[m.k] || []).length > 0)

const clean = v => {
  const n = Math.round(Number(v) * 10) / 10
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Write a sheet of measurements for one day (call inside store.update).
 *
 * You take these with a tape in one sitting, so this takes them all at once. A blank field is
 * left alone rather than written as zero or read as a deletion: people measure their waist
 * weekly and their neck twice a year, and "not today" must not wipe what January holds.
 * Returns how many were actually written.
 */
export function logMeasures(s, values, iso) {
  const d = iso || todayISO()
  const t = Date.now()
  s.measures = s.measures || {}
  let n = 0
  MEASURES.forEach(({ k }) => {
    const v = clean(values[k])
    if (v == null) return
    const series = s.measures[k] || (s.measures[k] = [])
    const at = series.find(e => e.d === d)
    if (at) { at.v = v; at.t = t } else series.push({ d, v, t })
    series.sort((a, b) => (a.d < b.d ? -1 : 1))
    n++
  })
  return n
}

/** Remove one entry from one series (call inside store.update). */
export function delMeasure(s, key, d) {
  if (s.measures && s.measures[key]) s.measures[key] = s.measures[key].filter(e => e.d !== d)
}

export const latestOf = series => (series && series.length ? series[series.length - 1] : null)

const inRange = (series, range, now) => (series || []).filter(e =>
  !range || (e.t || new Date(e.d).getTime()) > (now || Date.now()) - range * 86400000)

/** A series as LineChart points, narrowed to a range in days — 0 being all of it. */
export const pointsOf = (series, range, now) =>
  inRange(series, range, now).map(e => ({ t: e.t || new Date(e.d).getTime(), y: e.v, d: e.d }))

/** Change across the range, or null when there is nothing to compare against. */
export function deltaOf(series, range, now) {
  const win = inRange(series, range, now)
  return win.length > 1 ? Math.round((win[win.length - 1].v - win[0].v) * 10) / 10 : null
}
