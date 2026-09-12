// Turns raw workout history into the per-exercise progress a chart and a set of PRs need.
// Shared by Stats' exercise picker and the per-exercise detail sheet, so the two can never
// drift into computing "best" or "which metrics are on offer" two different ways.
import { modeOf, isWorkSet } from './history.js'
import { e1rmSeries, best1RM } from './onerm.js'
import { avgRir, toScale, scaleName } from './effort.js'
import { fmtNum } from './format.js'
import { t } from './i18n.js'

export function exerciseProgress(S, exId, kind) {
  const hd = scaleName(kind)
  // How this exercise was logged most recently decides what the curve means: top weight,
  // longest hold or top speed. Sets logged in another mode lack the field and score 0, so a
  // switched exercise drops its old points instead of mixing seconds into a weight chart.
  const curMode = exId ? (() => {
    for (let i = S.workouts.length - 1; i >= 0; i--) {
      const en = S.workouts[i].entries.find(e => e.id === exId)
      if (en) return modeOf({ ...(en.target || {}), id: exId })
    }
    return modeOf({ id: exId })
  })() : 'reps'
  const curCardio = curMode === 'cardio'
  const curTimed = curMode === 'time'
  const metric = s => curCardio ? (s.speed || 0) : curTimed ? (s.sec || 0) : (s.w || 0)
  const exUnit = curCardio ? 'km/h' : curTimed ? 's' : S.unit
  let exPts = [], exList = [], exBest = 0
  if (exId) {
    S.workouts.forEach(w => {
      const en = w.entries.find(e => e.id === exId)
      if (en) { const mx = Math.max(0, ...en.sets.filter(s => s.done).map(metric), curCardio || curTimed ? 0 : (en.topW || 0)); if (mx > 0) { exPts.push({ t: w.start, y: mx, d: w.d, sets: en.sets.filter(s => s.done), target: en.target }); if (mx > exBest) exBest = mx } }
    })
    exList = exPts.slice(-5).reverse()
  }
  // Estimated 1RM — only reps-mode training produces one, so cardio and timed work simply
  // have no points and the toggle stays hidden.
  const e1Pts = exId ? e1rmSeries(S, exId) : []
  const e1Best = exId ? best1RM(S, exId) : null
  const showE1 = e1Pts.length > 0
  // Effort on this exercise, per session. It rides on the top-set curve as well as having a
  // curve of its own, because the two only mean something together: the same weight moved
  // with more left in the tank is progress a weight-only chart draws as a flat line.
  const exRir = exPts.map(p => avgRir(p.sets))
  const showEff = exRir.filter(v => v != null).length >= 3
  const effPts = exPts.map((p, i) => (exRir[i] == null ? null : { t: p.t, y: toScale(kind, exRir[i]), d: p.d })).filter(Boolean)
  const topPts = exPts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    // 0 RIR (nothing left) is a full dot, 4+ a faint one; unrated sessions keep the plain line.
    m: exRir[i] == null ? null : 1 - Math.min(4, Math.max(0, exRir[i])) / 4,
    note: exRir[i] == null ? undefined : hd + ' ' + fmtNum(toScale(kind, exRir[i]))
  }))
  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) exOpts.push({ value: 'effort', label: t('Effort') })
  return { curMode, curCardio, curTimed, exUnit, exPts, exList, exBest, e1Pts, e1Best, showE1, showEff, effPts, topPts, exOpts }
}

// The two volume PRs alongside the weight PR: the heaviest a single set moved, and the most
// a single session moved in total — set volume can climb on a day the weight PR doesn't.
export function bestSetVolumeFor(S, exId) {
  let best = 0
  S.workouts.forEach(w => w.entries.forEach(e => {
    if (e.id === exId) e.sets.forEach(s => { if (isWorkSet(s)) { const v = (s.w || 0) * (s.r || 0); if (v > best) best = v } })
  }))
  return best
}
export function bestSessionVolumeFor(S, exId) {
  let best = 0
  S.workouts.forEach(w => w.entries.forEach(e => {
    if (e.id === exId) {
      let v = 0
      e.sets.forEach(s => { if (isWorkSet(s)) v += (s.w || 0) * (s.r || 0) })
      if (v > best) best = v
    }
  }))
  return best
}

// Every workout that logged this exercise, most recent first — the "History" tab's list.
export function workoutsWithExercise(S, exId) {
  return S.workouts.filter(w => w.entries.some(e => e.id === exId)).slice().reverse()
}
