// Automatic progression (issue #17).
//
// Everything here is a pure function of the workout history. Nothing writes back into a
// finished workout: the log is what happened, and the next prescription is *derived* from
// it every time it is needed. That means changing a policy — or fixing a mistyped set —
// immediately produces the right next target, with no stored counters to drift out of sync.
//
// It replaces a single hard-coded rule ("all reps done → add 2.5") with a small set of named
// policies. The rule that applies is always visible in the app, together with the reason it
// picked this weight, because a suggestion you can't audit is one you stop trusting.
//
// Reading a session honestly is the whole game:
//   · a set checked off with at least its target reps  → hit
//   · a set checked off with fewer reps                → miss (you logged what you got)
//   · a set never checked off                          → miss (it was not performed)
//   · fewer sets than prescribed                       → miss
// So a session that fell apart can never advance the load as though it had succeeded.

import { modeOf, repStep } from './history.js'
import { EXIDX } from './exercises.js'
import { cycleSessions, weekCount, cyclePos, rowsFor, CYCLES } from './cycles.js'
import { best1RM } from './onerm.js'

export const POLICIES = ['off', 'linear', 'greyskull', 'double', 'cycle', 'time']

// Which policies can sensibly drive which logging mode.
export const POLICIES_FOR = {
  reps: ['off', 'linear', 'greyskull', 'double', 'cycle'],
  time: ['off', 'time'],
  cardio: ['off']
}

export const POLICY_NAME = {
  off: 'No automatic progression',
  linear: 'Linear progression',
  greyskull: 'Greyskull LP',
  double: 'Double progression',
  cycle: 'Training-max cycle',
  time: 'Add time'
}
export const POLICY_DESC = {
  off: 'Targets stay where you set them.',
  linear: 'Hit every rep in every set and the weight goes up. Repeated misses trigger a deload.',
  greyskull: 'Two straight sets plus a final set taken to failure. Beat the target on that set and the weight goes up — double if you double the reps. One failure resets 10 %.',
  double: 'Work up through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom.',
  cycle: 'Percentages of a training max over a repeating four-week cycle, the last set of each taken as far as it goes. Finish a cycle clean and the training max goes up; fall short and it resets 10 %.',
  time: 'Hold every set for the full duration and the target goes up.'
}

// Sessions of repeated misses before a deload. Greyskull resets on the first failure by
// design; the general linear policy gives you two more cracks at it first.
export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 3, cycle: 1, time: 3 }
const DELOAD_FACTOR = 0.9

// Body parts where a 5 kg jump is normal rather than brutal.
const HEAVY_BP = ['upper legs', 'lower legs', 'back', 'hips', 'glutes']

// Default load step. Lower-body lifts take the bigger jump — that is the "lift-specific
// increment" a linear program lives on; an exercise can override it with cfg.inc.
export function defaultIncrement(exId, unit) {
  const ex = EXIDX[exId]
  const heavy = ex && HEAVY_BP.includes(ex.bp)
  if (unit === 'lb') return heavy ? 10 : 5
  return heavy ? 5 : 2.5
}
export const DEFAULT_SEC_INCREMENT = 5
// Where adding another set of push-ups stops being progress and starts being a way to spend
// an evening. Past this the honest advice is load or a harder variation (issue #33).
export const MAX_BW_SETS = 6

// The policy in force for one exercise: its own override, else the routine's default, else
// the mode's default. Reps keeps behaving the way the app always did (all reps → add a step).
export function policyFor(cfg, routine, mode) {
  const m = mode || modeOf(cfg || {})
  const allowed = POLICIES_FOR[m] || ['off']
  const pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === 'reps' ? 'linear' : 'off')
  return allowed.includes(pick) ? pick : 'off'
}

// 90 % of the best estimate the history holds — 5/3/1's own starting point. Snapped to the
// step so the suggestion is already a loadable number.
export function tmSuggestionFor(S, id, inc, weight) {
  const best = best1RM(S, id)
  return best && best.est > 0
    ? Math.max(inc, Math.round(best.est * 0.9 / inc) * inc)
    : Math.max(inc, weight || 0)
}

// The progression fields to persist for one exercise's config: the policy and its step, plus
// — only when cycle is the policy actually in force — the table, training max and step it
// runs on. A linear exercise must never pick up a stray training max, and someone who accepts
// the suggested training max and saves without touching the stepper must get that number
// stored, not nothing. Pulled out of the config sheet's save() so this shape is pinned by a
// test rather than only by the one call site that builds it.
export function progFieldsFor(c, id, routine, mode, S) {
  const prog = {}
  if (c.prog) prog.prog = c.prog
  if (c.inc > 0) prog.inc = c.inc
  if (policyFor({ ...c, id }, routine, mode) === 'cycle') {
    const inc = c.inc > 0 ? c.inc : defaultIncrement(id, (S && S.unit) || 'kg')
    prog.cyc = c.cyc || '531'
    prog.tm = c.tm || tmSuggestionFor(S, id, inc, c.weight)
    prog.tmStep = c.tmStep || defaultIncrement(id, (S && S.unit) || 'kg')
  }
  return prog
}

const round1 = v => Math.round(v * 10) / 10
// Snap to a loadable multiple of the step.
function snap(v, step) {
  if (!(step > 0)) return round1(v)
  return round1(Math.round(v / step) * step)
}
const fmtTm = v => Math.round(v * 10) / 10
// Back off by DELOAD_FACTOR, landing on something you can actually load. Rounding to the
// nearest step keeps the cut close to the intended 10 %, but on small weights the nearest
// step can be the weight you started from — so a deload that did not actually reduce
// anything takes one step down instead. Never goes below a single step.
function deloadTo(cur, step) {
  let next = snap(cur * DELOAD_FACTOR, step)
  if (next >= cur) next = snap(cur - step, step)
  return Math.max(step, next)
}

/**
 * Reduce one finished workout entry to what a policy needs to judge it.
 *
 * Workouts only started recording their prescription in v1.2.2, so most existing history has
 * no `target` at all. Judging those against nothing would score every past session as a miss
 * — and then greet a long-standing user with "missed reps 11 sessions running, deload". So an
 * entry without its own target is judged against `fallback`, the exercise's current plan,
 * which is exactly what the app's old weight hint compared against.
 */
export function readSession(entry, fallback) {
  const target = (entry && entry.target) || fallback || {}
  const mode = modeOf({ ...target, id: entry && entry.id })
  // Warm-ups come out before anything is measured. Left in, they fill the planned set count
  // so a short session reads as complete, and a clean warm-up in front of a missed working
  // set makes `every()` pass — the load would go up off the back of the warm-ups.
  const sets = ((entry && entry.sets) || []).filter(s => !(s && s.wu))
  // A cycle prescribes each set separately, so the session is judged set by set: every
  // ordinary set has to meet its own target, and the last one only has to reach its minimum
  // — going past it is what that set is for.
  if (target.rows) {
    const rows = target.rows
    const reps = sets.map(s => (s.done ? (s.r || 0) : 0))
    const met = rows.every((row, i) => reps[i] >= row.r)
    return {
      mode, goal: rows[rows.length - 1].r, reps,
      weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
      count: reps.length,
      low: reps.length ? Math.min(...reps) : 0,
      amrap: reps.length ? reps[reps.length - 1] : 0,
      ok: reps.length >= rows.length && met,
    }
  }
  const planned = target.sets || sets.length
  const enough = sets.length >= planned

  if (mode === 'time') {
    const goal = target.sec || 0
    const held = sets.map(s => (s.done ? (s.sec || 0) : 0))
    return {
      mode, goal, held,
      weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
      best: Math.max(0, ...held),
      ok: goal > 0 && enough && held.length > 0 && held.every(h => h >= goal)
    }
  }
  const goal = target.reps || 0
  const reps = sets.map(s => (s.done ? (s.r || 0) : 0))
  return {
    mode, goal, reps,
    weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
    count: reps.length,                                   // the dimension bodyweight work grows (#33)
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,       // Greyskull's final set
    ok: goal > 0 && enough && reps.length > 0 && reps.every(r => r >= goal)
  }
}

/** Every past session for one exercise, oldest first. `fallback` — see readSession. */
export function sessionsFor(S, exId, fallback) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const entry = w.entries.find(e => e.id === exId)
    if (entry && entry.sets.some(s => s.done)) out.push({ d: w.d, ...readSession(entry, fallback) })
  })
  return out
}

// How many sessions in a row ended in a miss, counting back from the most recent.
export function stallCount(sessions) {
  let n = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break
    n++
  }
  return n
}

/**
 * The next prescription for one exercise.
 *
 * Returns `{ weight, reps, sec, why, kind }` — `kind` being one of
 * first | up | hold | deload | off, and `why` a translatable template + args so the app can
 * always answer "why this number?". A field the policy has no opinion on comes back
 * undefined and the caller keeps whatever the plan said.
 */
export function nextPrescription(S, cfg, routine) {
  const mode = modeOf(cfg)
  const policy = policyFor(cfg, routine, mode)
  const unit = S.unit || 'kg'
  const inc = cfg.inc > 0 ? cfg.inc : (mode === 'time' ? DEFAULT_SEC_INCREMENT : defaultIncrement(cfg.id, unit))
  if (policy === 'off') return { policy, kind: 'off' }

  // Ahead of the "nothing logged yet" branch on purpose: a cycle knows what week one is
  // before you have lifted anything, and answering "this session sets the baseline" would be
  // both unhelpful and untrue.
  if (policy === 'cycle') {
    const { cycle, week } = cyclePos(S, cfg.id, cfg.cyc)
    const tm = tmFor(S, cfg)
    const rows = rowsFor(cfg.cyc, week, tm, inc)
    const name = (CYCLES[cfg.cyc] || CYCLES['531']).name
    // An unset training max (0, before the exercise config carries one) would otherwise divide
    // by zero and print "Infinity %" — 0 % reads as nothing to work from, which is the truth.
    const pct = w => tm > 0 ? Math.round(w / tm * 100) : 0
    return {
      policy, kind: 'cycle', rows, tm, cycle, week,
      why: ['{0} · cycle {1}, week {2} — {3} % to {4} % of a {5} {6} training max',
        name, cycle + 1, week + 1, pct(rows[0].w), pct(rows[rows.length - 1].w), fmtTm(tm), unit],
    }
  }

  const sessions = sessionsFor(S, cfg.id, cfg).filter(s => s.mode === mode)
  const last = sessions[sessions.length - 1]
  if (!last) return { policy, kind: 'first', why: ['Nothing logged yet — this session sets the baseline.'] }

  const stalls = stallCount(sessions)
  const deloadAt = DELOAD_AFTER[policy] || 3

  if (mode === 'time') {
    if (last.ok) {
      const sec = (last.goal || cfg.sec || 0) + inc
      return { policy, kind: 'up', sec, why: ['Held every set for the full time — target up by {0}s.', inc] }
    }
    if (stalls >= deloadAt) {
      const sec = deloadTo(last.goal || cfg.sec || 0, 5)
      return { policy, kind: 'deload', sec, why: ['Short {0} sessions in a row — back off to {1}s and build up again.', stalls, sec] }
    }
    return { policy, kind: 'hold', sec: last.goal || cfg.sec, why: ['Last time came up short — same target again.'] }
  }

  const w = last.weight
  // Bodyweight work carries no external load, so there is nothing to add or take away —
  // "deload your push-ups to 2.5 kg" is not advice. Progress in reps instead. This runs ahead
  // of the individual policies because it is true for all of them. Note the trigger is the
  // *logged* weight, not the `bw` flag: a dip done with a belt has a load to progress and
  // belongs on the normal policies, and a barbell lift logged at 0 has nothing to add to.
  if (w <= 0) {
    const goal = last.goal || cfg.reps || 0
    if (!last.ok || goal <= 0) return { policy, kind: 'hold', weight: 0, reps: goal || undefined, why: ['Bodyweight — same target again until every set is clean.'] }
    // A ceiling turns "+1 rep forever" into a plan (issue #33). Past the top of the range the
    // reps go back to the bottom and a set is added instead, which is how bodyweight work
    // actually progresses once a set of 30 push-ups stops being a strength stimulus.
    const top = cfg.repsMax > 0 ? cfg.repsMax : 0
    if (top > 0 && goal >= top) {
      const sets = Math.max(1, cfg.sets || last.count || 1) + 1
      const bottom = Math.max(1, Math.min(cfg.reps || top, top))
      if (sets <= MAX_BW_SETS) return { policy, kind: 'up', weight: 0, reps: bottom, sets, why: ['{0} reps in every set — add a set and go back to {1}.', goal, bottom] }
      // Out of sets worth adding: more volume is no longer the answer, load or a harder
      // variation is — and that is a decision for a person, not a policy.
      return { policy, kind: 'hold', weight: 0, reps: goal, why: ['{0} sets of {1} — time to add weight or move to a harder variation.', sets - 1, goal] }
    }
    // Unilateral work steps by two, so the total stays even and both sides get the rep.
    const next = goal + repStep(cfg)
    return { policy, kind: 'up', weight: 0, reps: next, why: ['Bodyweight — every rep last time, so go for {0} this time.', next] }
  }
  if (policy === 'double') {
    const top = cfg.reps || last.goal || 10
    const bottom = Math.min(cfg.repsMin || Math.max(1, top - 2), top)
    if (last.ok) return { policy, kind: 'up', weight: snap(w + inc, inc), reps: bottom, why: ['Top of the rep range in every set — {0} {1} more, back to {2} reps.', inc, unit, bottom] }
    if (stalls >= deloadAt) {
      const dw = deloadTo(w, inc)
      return { policy, kind: 'deload', weight: dw, reps: bottom, why: ['Stalled {0} sessions — deload to {1} {2}.', stalls, dw, unit] }
    }
    const aim = Math.min(top, Math.max(bottom, last.low + repStep(cfg)))
    return { policy, kind: 'hold', weight: w, reps: aim, why: ['Same weight — aim for {0} reps this time.', aim] }
  }

  // linear + greyskull
  if (last.ok) {
    // Greyskull's final set is taken to failure: double the target reps there and you have
    // earned a double jump.
    const dbl = policy === 'greyskull' && last.goal > 0 && last.amrap >= last.goal * 2
    const step = dbl ? inc * 2 : inc
    return {
      policy, kind: 'up', weight: snap(w + step, inc),
      why: dbl
        ? ['Last set hit {0} reps — twice the target, so take a double jump of {1} {2}.', last.amrap, step, unit]
        : ['Every rep last time — {0} {1} more.', step, unit]
    }
  }
  if (stalls >= deloadAt) {
    const dw = deloadTo(w, inc)
    return {
      policy, kind: 'deload', weight: dw,
      why: stalls > 1
        ? ['Missed reps {0} sessions running — reset to {1} {2} and work back up.', stalls, dw, unit]
        : ['Missed reps — reset to {0} {1} and work back up.', dw, unit]
    }
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
}

/**
 * Apply a prescription to freshly built sets. Only the fields the policy actually decided
 * are touched, and only on sets that have not been logged yet.
 */
export function applyPrescription(sets, p) {
  if (!p || p.kind === 'off' || p.kind === 'first') return sets
  // A cycle prescribes a different weight and rep target for each set — 65 × 5, 75 × 5,
  // 85 × 5+ — so it arrives as rows rather than as the one weight every other policy decides.
  if (p.rows) {
    // A set past the end of this week's rows is dropped — unless it was already logged, in
    // which case it stays: the routine's set count can be wider than the cycle's, and an
    // unlogged surplus set (buildSets over-provisioning against a shorter week) must not sit
    // there prescribing nothing, while logged work is never taken away.
    const out = sets
      .map((s, i) => {
        const row = p.rows[i]
        if (s.done) return s
        if (!row) return null
        return { ...s, w: row.w, r: row.r }
      })
      .filter(s => s !== null)
    // Only ever grows past what is already logged. A week longer than what buildSets
    // produced must not leave the extra top sets missing, which is the same rule the
    // set-count branch below follows.
    for (let i = out.length; i < p.rows.length; i++) {
      out.push({ w: p.rows[i].w, r: p.rows[i].r, done: false })
    }
    return out
  }
  const out = sets.map(s => {
    if (s.done) return s
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })
  // A policy that decided on a set count gets to grow the list — bodyweight progression adds
  // a set where a barbell would have added a plate. Only ever upwards, and only by copying a
  // row that is already there: a session in progress must not lose a set it has logged.
  if (p.sets > out.length) {
    const seed = out[out.length - 1]
    while (out.length < p.sets) out.push({ ...seed, done: false })
  }
  return out
}

/**
 * The training max for the cycle this exercise is about to start.
 *
 * Derived like everything else: the base you set, then one step for every cycle you finished
 * clean. A cycle whose sets fell short does not advance it — it resets to 90 %, which is what
 * 5/3/1 says to do and the same back-off the linear policies take on a stall.
 *
 * Only whole cycles count. Part way through, the training max is whatever it was when the
 * cycle started, so the percentages you are working to do not move under you mid-cycle.
 */
export function tmFor(S, cfg) {
  const step = cfg.tmStep > 0 ? cfg.tmStep : defaultIncrement(cfg.id, (S && S.unit) || 'kg')
  const len = weekCount(cfg.cyc)
  const sessions = cycleSessions(S, cfg.id)
  let tm = cfg.tm > 0 ? cfg.tm : 0
  for (let i = 0; i + len <= sessions.length; i += len) {
    const clean = sessions.slice(i, i + len).every(x => readSession(x.entry, cfg).ok)
    tm = clean ? snap(tm + step, step) : Math.max(step, snap(tm * DELOAD_FACTOR, step))
  }
  return tm
}
