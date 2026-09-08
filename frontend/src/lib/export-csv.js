// Export the training history as CSV — one row per logged set.
//
// The column names are the ones import-csv.js already reads, so openGym round-trips its own
// export: anything you can get out, you can put back. That is also why the header looks like
// Strong's — matching a dialect the importer knows beats inventing a better one it doesn't.

import { EXIDX } from './exercises.js'
import { modeOf, isWorkSet } from './history.js'

const COLS = ['Date', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Weight Unit',
  'Reps', 'Seconds', 'Distance km', 'RIR', 'RPE', 'Set Type', 'Notes']

// Quote only where a quote is needed, so the common row stays readable in a text editor.
const cell = v => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

const stamp = w => {
  const t = w.start ? new Date(w.start) : new Date(w.d + 'T12:00:00')
  const p = n => String(n).padStart(2, '0')
  return `${w.d} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
}

const nameOf = (entry, customEx) => {
  const c = (customEx || []).find(x => x.id === entry.id)
  return (c && c.n) || (EXIDX[entry.id] && EXIDX[entry.id].n) || entry.n || entry.id
}

/**
 * The whole history as CSV text. Only sets that were actually logged: an untouched row in a
 * session you abandoned is not something that happened.
 *
 * Warm-ups travel as their set type rather than being dropped, so a re-import puts them back
 * as warm-ups and they stay out of volume, PRs and the muscle map on the other side too.
 */
export function exportCSV(S) {
  const unit = S.unit || 'kg'
  const rows = [COLS.join(',')]
  ;[...(S.workouts || [])].sort((a, b) => (a.d < b.d ? -1 : 1)).forEach(w => {
    const when = stamp(w)
    ;(w.entries || []).forEach(entry => {
      const mode = modeOf({ ...(entry.target || {}), id: entry.id })
      const name = nameOf(entry, S.customEx)
      ;(entry.sets || []).forEach((s, i) => {
        if (!s.done) return
        // Cardio stores minutes and a speed; the dialect carries a duration and a distance,
        // so the speed travels as the distance it implies and is read back from it.
        const secs = mode === 'cardio' ? Math.round((s.min || 0) * 60) : (mode === 'time' ? s.sec : '')
        const km = mode === 'cardio' ? Math.round((s.speed || 0) * ((s.min || 0) / 60) * 1000) / 1000 : ''
        rows.push([
          when, w.name || '', name, i + 1,
          mode === 'cardio' ? '' : (s.w ?? ''), mode === 'cardio' ? '' : unit,
          mode === 'reps' ? (s.r ?? '') : '',
          secs === undefined ? '' : secs, km,
          s.rir ?? '', s.rpe ?? '',
          s.wu ? 'warmup' : 'normal',
          (entry.target && entry.target.note) || '',
        ].map(cell).join(','))
      })
    })
  })
  return rows.join('\n') + '\n'
}

/** How many rows an export would hold — the count shown before you download it. */
export const exportRows = S =>
  (S.workouts || []).reduce((n, w) =>
    n + (w.entries || []).reduce((m, e) => m + (e.sets || []).filter(s => s.done).length, 0), 0)

/** Working sets only — what the numbers elsewhere in the app are counted from. */
export const exportWorkingRows = S =>
  (S.workouts || []).reduce((n, w) =>
    n + (w.entries || []).reduce((m, e) => m + (e.sets || []).filter(isWorkSet).length, 0), 0)
