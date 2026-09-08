import { describe, it, expect } from 'vitest'
import {
  readSession, sessionsFor, stallCount, nextPrescription, applyPrescription,
  policyFor, defaultIncrement, POLICIES_FOR, DELOAD_AFTER, MAX_BW_SETS, tmFor, POLICY_NAME, POLICY_DESC
} from './progression.js'
import { EXDB } from './exercises.js'
import { cyclePos } from './cycles.js'

const LIFT = EXDB.find(e => e.bp !== 'cardio' && !['upper legs', 'lower legs', 'back', 'hips', 'glutes'].includes(e.bp)).id
const HEAVY = EXDB.find(e => e.bp === 'upper legs').id
const CARDIO = EXDB.find(e => e.bp === 'cardio').id

// Build a state whose history is a list of sessions given as [weight, ...repsPerSet].
// A rep count of null means "the set was never checked off".
const hist = (id, rows, target) => ({
  unit: 'kg',
  workouts: rows.map((row, i) => ({
    d: '2026-01-0' + (i + 1),
    entries: [{
      id,
      target: target || { sets: 3, reps: 5, weight: row[0] },
      sets: row.slice(1).map(r => (r === null ? { w: row[0], r: 0, done: false } : { w: row[0], r, done: true }))
    }]
  }))
})

describe('readSession', () => {
  const T = { sets: 3, reps: 5 }
  it('counts a session where every set made its reps as a hit', () => {
    const s = readSession({ id: LIFT, target: T, sets: [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: true }, { w: 60, r: 6, done: true }] })
    expect(s.ok).toBe(true)
    expect(s.weight).toBe(60)
    expect(s.amrap).toBe(6)
    expect(s.low).toBe(5)
  })

  it('counts short reps as a miss even when the set was checked off', () => {
    expect(readSession({ id: LIFT, target: T, sets: [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: true }, { w: 60, r: 3, done: true }] }).ok).toBe(false)
  })

  it('counts an unchecked set as a miss — it was not performed', () => {
    const s = readSession({ id: LIFT, target: T, sets: [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: true }, { w: 60, r: 0, done: false }] })
    expect(s.ok).toBe(false)
    expect(s.weight).toBe(60)       // the working weight is still known from the sets that counted
  })

  it('counts fewer sets than prescribed as a miss', () => {
    expect(readSession({ id: LIFT, target: T, sets: [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: true }] }).ok).toBe(false)
  })

  it('refuses to call a session a hit when nothing was prescribed', () => {
    expect(readSession({ id: LIFT, target: {}, sets: [{ w: 60, r: 5, done: true }] }).ok).toBe(false)
  })

  it('reads a timed session by the hold, not by reps', () => {
    const s = readSession({ id: LIFT, target: { sets: 2, sec: 45, mode: 'time' }, sets: [{ sec: 45, w: 0, done: true }, { sec: 50, w: 0, done: true }] })
    expect(s.mode).toBe('time')
    expect(s.ok).toBe(true)
    expect(s.best).toBe(50)
    expect(readSession({ id: LIFT, target: { sets: 2, sec: 45, mode: 'time' }, sets: [{ sec: 45, done: true }, { sec: 30, done: true }] }).ok).toBe(false)
  })
})

describe('stallCount', () => {
  it('counts consecutive misses back from the most recent session', () => {
    expect(stallCount([{ ok: true }, { ok: true }])).toBe(0)
    expect(stallCount([{ ok: true }, { ok: false }])).toBe(1)
    expect(stallCount([{ ok: false }, { ok: false }, { ok: false }])).toBe(3)
    expect(stallCount([{ ok: false }, { ok: true }, { ok: false }])).toBe(1)
    expect(stallCount([])).toBe(0)
  })
})

describe('policyFor', () => {
  it('keeps the app\'s long-standing behaviour as the default for reps work', () => {
    expect(policyFor({ id: LIFT }, null, 'reps')).toBe('linear')
  })
  it('leaves timed and cardio work alone unless asked', () => {
    expect(policyFor({ id: LIFT, mode: 'time' }, null, 'time')).toBe('off')
    expect(policyFor({ id: CARDIO }, null, 'cardio')).toBe('off')
  })
  it('lets the exercise override the routine, and the routine override the default', () => {
    expect(policyFor({ id: LIFT }, { prog: 'greyskull' }, 'reps')).toBe('greyskull')
    expect(policyFor({ id: LIFT, prog: 'double' }, { prog: 'greyskull' }, 'reps')).toBe('double')
  })
  it('refuses a policy that makes no sense for the mode', () => {
    expect(policyFor({ id: LIFT, mode: 'time', prog: 'greyskull' }, null, 'time')).toBe('off')
    expect(policyFor({ id: CARDIO, prog: 'linear' }, null, 'cardio')).toBe('off')
    expect(POLICIES_FOR.cardio).toEqual(['off'])
  })
})

describe('defaultIncrement', () => {
  it('gives lower-body lifts the bigger jump', () => {
    expect(defaultIncrement(LIFT, 'kg')).toBe(2.5)
    expect(defaultIncrement(HEAVY, 'kg')).toBe(5)
  })
  it('scales to pounds', () => {
    expect(defaultIncrement(LIFT, 'lb')).toBe(5)
    expect(defaultIncrement(HEAVY, 'lb')).toBe(10)
  })
  it('falls back for an unknown exercise', () => {
    expect(defaultIncrement('nope', 'kg')).toBe(2.5)
  })
})

describe('linear progression', () => {
  const cfg = { id: LIFT, sets: 3, reps: 5, weight: 60, prog: 'linear' }

  it('says nothing useful before there is any history', () => {
    const p = nextPrescription({ unit: 'kg', workouts: [] }, cfg)
    expect(p.kind).toBe('first')
    expect(p.weight).toBeUndefined()
  })

  it('adds the increment after a clean session', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 5]]), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(62.5)
  })

  it('repeats the weight after a miss instead of advancing', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 3]]), cfg)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(60)
  })

  it('does not advance when the last set was left unchecked', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, null]]), cfg)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(60)
  })

  it('deloads after three misses in a row, onto a loadable weight', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 3], [60, 5, 4, 4], [60, 5, 5, 4]]), cfg)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(55)             // 60 × 0.9 = 54 → nearest loadable 2.5 step
    expect(DELOAD_AFTER.linear).toBe(3)
  })

  it('a good session in between clears the stall', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 3], [60, 5, 5, 5], [60, 5, 5, 3]]), cfg)
    expect(p.kind).toBe('hold')
  })

  it('never deloads below one increment, however light the lift already is', () => {
    const p = nextPrescription(hist(LIFT, [[2.5, 1, 1, 1], [2.5, 1, 1, 1], [2.5, 1, 1, 1]]), cfg)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(2.5)
  })

  it('always makes a deload actually lighter, even when rounding would not', () => {
    // 20 × 0.9 = 18 → nearest 2.5 step is 17.5, fine. 5 × 0.9 = 4.5 → nearest step is 5,
    // which is no deload at all, so it has to step down instead.
    const p = nextPrescription(hist(LIFT, [[5, 1, 1, 1], [5, 1, 1, 1], [5, 1, 1, 1]]), cfg)
    expect(p.weight).toBeLessThan(5)
  })

  it('uses the heavier step for a lower-body lift', () => {
    const p = nextPrescription(hist(HEAVY, [[100, 5, 5, 5]]), { id: HEAVY, sets: 3, reps: 5, prog: 'linear' })
    expect(p.weight).toBe(105)
  })

  it('honours a per-exercise increment override', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 5]]), { ...cfg, inc: 1 })
    expect(p.weight).toBe(61)
  })

  it('works in pounds', () => {
    const S = { ...hist(LIFT, [[135, 5, 5, 5]]), unit: 'lb' }
    expect(nextPrescription(S, cfg).weight).toBe(140)
  })
})

describe('bodyweight exercises', () => {
  const cfg = { id: LIFT, sets: 3, reps: 10, weight: 0, prog: 'linear' }
  const bw = rows => hist(LIFT, rows, { sets: 3, reps: 10 })

  it('never invents a weight to deload to — there is nothing to take off a push-up', () => {
    const p = nextPrescription(bw([[0, 10, 10, 8], [0, 10, 10, 9], [0, 10, 10, 8]]), cfg)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(0)
    expect(p.reps).toBe(10)
  })

  it('progresses in reps instead of load after a clean session', () => {
    const p = nextPrescription(bw([[0, 10, 10, 10]]), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(0)
    expect(p.reps).toBe(11)
  })

  /* A ceiling turns "+1 rep forever" into a plan — issue #33. */
  it('climbs to the ceiling one rep at a time', () => {
    const p = nextPrescription(bw([[0, 10, 10, 10]]), { ...cfg, repsMax: 15 })
    expect(p.kind).toBe('up')
    expect(p.reps).toBe(11)
    expect(p.sets).toBeUndefined()
  })

  it('adds a set and restarts the range once the ceiling is reached', () => {
    const at15 = hist(LIFT, [[0, 15, 15, 15]], { sets: 3, reps: 15 })
    const p = nextPrescription(at15, { ...cfg, reps: 10, repsMax: 15 })
    expect(p.kind).toBe('up')
    expect(p.sets).toBe(4)
    expect(p.reps).toBe(10)
    expect(p.weight).toBe(0)
  })

  it('stops adding sets at the cap and says what to do instead', () => {
    const at15 = hist(LIFT, [[0, 15, 15, 15]], { sets: 3, reps: 15 })
    const p = nextPrescription(at15, { ...cfg, sets: MAX_BW_SETS, reps: 10, repsMax: 15 })
    expect(p.kind).toBe('hold')
    expect(p.sets).toBeUndefined()
    expect(p.why[0]).toMatch(/harder variation/)
  })

  it('leaves a belted set to the normal policies — there is a load to add now', () => {
    const belted = hist(LIFT, [[10, 10, 10, 10]], { sets: 3, reps: 10 })
    const p = nextPrescription(belted, { ...cfg, bodyweight: true, repsMax: 15 })
    expect(p.kind).toBe('up')
    expect(p.weight).toBeGreaterThan(10)
    expect(p.sets).toBeUndefined()
  })

  it('steps a unilateral total by two, so it lands on 16, 18, 20 (issue #31)', () => {
    const at16 = hist(LIFT, [[0, 16, 16, 16]], { sets: 3, reps: 16 })
    expect(nextPrescription(at16, { ...cfg, reps: 16, side: true }).reps).toBe(18)
    // and by one when it is not
    expect(nextPrescription(at16, { ...cfg, reps: 16 }).reps).toBe(17)
  })

  it('keeps climbing reps forever when no ceiling was set — the old behaviour', () => {
    const at30 = hist(LIFT, [[0, 30, 30, 30]], { sets: 3, reps: 30 })
    const p = nextPrescription(at30, cfg)
    expect(p.kind).toBe('up')
    expect(p.reps).toBe(31)
    expect(p.sets).toBeUndefined()
  })

  it('applies to every policy, not just linear', () => {
    for (const prog of ['linear', 'greyskull', 'double']) {
      const p = nextPrescription(bw([[0, 10, 10, 4], [0, 10, 10, 4], [0, 10, 10, 4]]), { ...cfg, prog })
      expect(p.weight, prog).toBe(0)
      expect(p.kind, prog).toBe('hold')
    }
  })

  it('still adds load the moment the exercise is actually weighted', () => {
    const p = nextPrescription(hist(LIFT, [[10, 10, 10, 10]], { sets: 3, reps: 10 }), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(12.5)
  })
})

describe('Greyskull LP', () => {
  const cfg = { id: LIFT, sets: 3, reps: 5, weight: 60, prog: 'greyskull' }

  it('advances when the final set makes the target', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 5]]), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(62.5)
  })

  it('takes a double jump when the last set doubles the target reps', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 10]]), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(65)
    expect(p.why[0]).toContain('double')
  })

  it('resets 10 % on the very first failure, unlike plain linear', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 3]]), cfg)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(55)
    expect(DELOAD_AFTER.greyskull).toBe(1)
  })

  it('keeps resetting from the reduced weight, not the original', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 3], [55, 5, 5, 2]]), cfg)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(50)            // 55 × 0.9 = 49.5 → nearest loadable 2.5 step
  })
})

describe('double progression', () => {
  const cfg = { id: LIFT, sets: 3, reps: 12, repsMin: 8, weight: 40, prog: 'double' }

  it('adds weight and drops back to the bottom of the range at the top of it', () => {
    const p = nextPrescription(hist(LIFT, [[40, 12, 12, 12]], { sets: 3, reps: 12 }), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(42.5)
    expect(p.reps).toBe(8)
  })

  it('keeps the weight and asks for one more rep while inside the range', () => {
    const p = nextPrescription(hist(LIFT, [[40, 10, 9, 9]], { sets: 3, reps: 12 }), cfg)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(40)
    expect(p.reps).toBe(10)             // worst set was 9 → aim for 10
  })

  it('never asks for more than the top of the range', () => {
    const p = nextPrescription(hist(LIFT, [[40, 12, 12, 11]], { sets: 3, reps: 12 }), cfg)
    expect(p.reps).toBeLessThanOrEqual(12)
  })

  it('deloads after a run of stalls and restarts at the bottom of the range', () => {
    const rows = [[40, 9, 9, 9], [40, 9, 9, 9], [40, 9, 9, 9]]
    const p = nextPrescription(hist(LIFT, rows, { sets: 3, reps: 12 }), cfg)
    expect(p.kind).toBe('deload')
    expect(p.reps).toBe(8)
    expect(p.weight).toBe(35)           // 40 × 0.9 = 36 → nearest loadable 2.5 step
  })
})

describe('timed progression', () => {
  const cfg = { id: LIFT, mode: 'time', sets: 2, sec: 45, prog: 'time' }
  const T = { sets: 2, sec: 45, mode: 'time' }
  const timeHist = rows => ({
    unit: 'kg',
    workouts: rows.map((row, i) => ({
      d: '2026-02-0' + (i + 1),
      entries: [{ id: LIFT, target: T, sets: row.map(sec => ({ sec, w: 0, done: true })) }]
    }))
  })

  it('adds time when every set went the full duration', () => {
    const p = nextPrescription(timeHist([[45, 45]]), cfg)
    expect(p.kind).toBe('up')
    expect(p.sec).toBe(50)
    expect(p.weight).toBeUndefined()
  })

  it('repeats the target when a hold came up short', () => {
    const p = nextPrescription(timeHist([[45, 38]]), cfg)
    expect(p.kind).toBe('hold')
    expect(p.sec).toBe(45)
  })

  it('backs the target off after a run of short sessions', () => {
    const p = nextPrescription(timeHist([[45, 30], [45, 32], [45, 31]]), cfg)
    expect(p.kind).toBe('deload')
    expect(p.sec).toBe(40)              // 45 × 0.9 = 40.5 → nearest 5 s step
  })

  it('ignores reps history when the exercise switched to time', () => {
    const S = hist(LIFT, [[60, 5, 5, 5]])
    const p = nextPrescription({ ...S, unit: 'kg' }, cfg)
    expect(p.kind).toBe('first')        // no timed session yet, so no opinion
  })
})

describe('policy "off"', () => {
  it('has no opinion at all', () => {
    const p = nextPrescription(hist(LIFT, [[60, 5, 5, 5]]), { id: LIFT, sets: 3, reps: 5, prog: 'off' })
    expect(p.kind).toBe('off')
    expect(p.weight).toBeUndefined()
  })
  it('is what cardio always gets', () => {
    expect(nextPrescription({ unit: 'kg', workouts: [] }, { id: CARDIO, sets: 1, min: 20 }).kind).toBe('off')
  })
})

describe('sessionsFor', () => {
  it('skips workouts where the exercise was never actually logged', () => {
    const S = {
      unit: 'kg',
      workouts: [
        { d: '2026-01-01', entries: [{ id: LIFT, target: { sets: 1, reps: 5 }, sets: [{ w: 60, r: 5, done: true }] }] },
        { d: '2026-01-02', entries: [{ id: LIFT, target: { sets: 1, reps: 5 }, sets: [{ w: 60, r: 0, done: false }] }] },
        { d: '2026-01-03', entries: [{ id: 'other', target: {}, sets: [{ w: 20, r: 5, done: true }] }] }
      ]
    }
    expect(sessionsFor(S, LIFT).map(s => s.d)).toEqual(['2026-01-01'])
  })

  it('reads a legacy entry that has no target without crashing', () => {
    const S = { unit: 'kg', workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, sets: [{ w: 60, r: 5, done: true }] }] }] }
    expect(sessionsFor(S, LIFT)).toHaveLength(1)
  })
})

// Workouts only began storing their prescription in v1.2.2. Everything logged before that is
// targetless, and reading it as "missed" would tell every long-standing user to deload on
// their first session after updating — which is exactly what the demo history did.
describe('history logged before targets were recorded', () => {
  const legacy = rows => ({
    unit: 'kg',
    workouts: rows.map((row, i) => ({
      d: '2026-03-' + String(i + 1).padStart(2, '0'),
      entries: [{ id: LIFT, sets: row.slice(1).map(r => ({ w: row[0], r, done: true })) }]   // no target
    }))
  })
  const cfg = { id: LIFT, sets: 3, reps: 5, weight: 60, prog: 'linear' }

  it('judges a targetless session against the current plan instead of calling it a miss', () => {
    const p = nextPrescription(legacy([[60, 5, 5, 5]]), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(62.5)
  })

  it('does not manufacture a stall out of a long clean history', () => {
    const p = nextPrescription(legacy(Array.from({ length: 11 }, () => [60, 5, 5, 5])), cfg)
    expect(p.kind).toBe('up')
  })

  it('still spots a genuine miss in old data', () => {
    expect(nextPrescription(legacy([[60, 5, 5, 2]]), cfg).kind).toBe('hold')
  })

  it('matches the weight hint the app showed before this engine existed', () => {
    // Old rule: every set at or above the plan's reps, with a real weight → suggest a step up.
    expect(nextPrescription(legacy([[60, 5, 6, 5]]), cfg).weight).toBe(62.5)
    expect(nextPrescription(legacy([[60, 5, 4, 5]]), cfg).kind).toBe('hold')
  })
})

describe('applyPrescription', () => {
  const sets = [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }]

  it('rewrites only what the policy decided, and only unlogged sets', () => {
    const out = applyPrescription(sets, { kind: 'up', weight: 62.5 })
    expect(out[0]).toEqual({ w: 60, r: 5, done: true })
    expect(out[1]).toEqual({ w: 62.5, r: 5, done: false })
  })

  it('sets reps too when the policy has an opinion about them', () => {
    expect(applyPrescription(sets, { kind: 'up', weight: 42.5, reps: 8 })[1]).toEqual({ w: 42.5, r: 8, done: false })
  })

  it('touches nothing for "off" or a first session', () => {
    expect(applyPrescription(sets, { kind: 'off' })).toBe(sets)
    expect(applyPrescription(sets, { kind: 'first' })).toBe(sets)
    expect(applyPrescription(sets, null)).toBe(sets)
  })

  it('adjusts a timed set without inventing a weight', () => {
    const timed = [{ sec: 45, w: 0, done: false }]
    expect(applyPrescription(timed, { kind: 'up', sec: 50 })).toEqual([{ sec: 50, w: 0, done: false }])
  })

  it('grows the list when the policy added a set (issue #33)', () => {
    const three = [{ w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }]
    const out = applyPrescription(three, { kind: 'up', weight: 0, reps: 10, sets: 4 })
    expect(out).toHaveLength(4)
    expect(out[3]).toEqual({ w: 0, r: 10, done: false })
  })

  it('never shrinks a session that has already logged sets', () => {
    expect(applyPrescription(sets, { kind: 'up', weight: 60, sets: 1 })).toHaveLength(sets.length)
  })
})

describe('applyPrescription with per-set rows', () => {
  const rows = [{ w: 65, r: 5, amrap: false }, { w: 75, r: 5, amrap: false }, { w: 85, r: 5, amrap: true }]

  it('gives each set its own weight instead of broadcasting one', () => {
    const sets = [{ w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }]
    const out = applyPrescription(sets, { kind: 'cycle', rows })
    expect(out.map(s => [s.w, s.r])).toEqual([[65, 5], [75, 5], [85, 5]])
  })

  it('grows the list to fit the week', () => {
    const out = applyPrescription([{ w: 0, r: 10, done: false }], { kind: 'cycle', rows })
    expect(out).toHaveLength(3)
    expect(out[2].w).toBe(85)
  })

  it('never touches a set already logged', () => {
    const sets = [{ w: 60, r: 6, done: true }, { w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }]
    const out = applyPrescription(sets, { kind: 'cycle', rows })
    expect(out[0]).toEqual({ w: 60, r: 6, done: true })
    expect(out[1].w).toBe(75)
  })

  it('never drops a set that has been logged, even past the end of the week', () => {
    // A shorter week must not take away work you already did.
    const sets = [
      { w: 65, r: 5, done: true }, { w: 75, r: 5, done: true },
      { w: 85, r: 8, done: true }, { w: 85, r: 6, done: true },
    ]
    const out = applyPrescription(sets, { kind: 'cycle', rows })
    expect(out).toHaveLength(4)
    expect(out[3]).toEqual({ w: 85, r: 6, done: true })
  })

  it('leaves the scalar policies exactly as they were', () => {
    const sets = [{ w: 0, r: 0, done: false }, { w: 0, r: 0, done: false }]
    const out = applyPrescription(sets, { kind: 'up', weight: 100, reps: 5 })
    expect(out).toEqual([{ w: 100, r: 5, done: false }, { w: 100, r: 5, done: false }])
  })
})

describe('readSession against per-set targets', () => {
  const target = {
    id: '0025', cyc: '531',
    rows: [{ w: 65, r: 5, amrap: false }, { w: 75, r: 5, amrap: false }, { w: 85, r: 5, amrap: true }],
  }
  const entry = reps => ({ id: '0025', target, sets: reps.map((r, i) => ({ w: target.rows[i].w, r, done: true })) })

  it('passes when every set met its own target', () => {
    expect(readSession(entry([5, 5, 5])).ok).toBe(true)
  })

  it('passes when the last set went past its target, which is the point of it', () => {
    const r = readSession(entry([5, 5, 9]))
    expect(r.ok).toBe(true)
    expect(r.amrap).toBe(9)
  })

  it('fails when the AMRAP set fell short of its minimum', () => {
    expect(readSession(entry([5, 5, 3])).ok).toBe(false)
  })

  it('fails when an ordinary set fell short, however good the last one was', () => {
    // A missed 75 × 5 is a missed session even if the top set flew — the load was wrong.
    expect(readSession(entry([5, 3, 9])).ok).toBe(false)
  })

  it('fails when the session was cut short of the sets it asked for', () => {
    const e = { id: '0025', target, sets: [{ w: 65, r: 5, done: true }, { w: 75, r: 5, done: true }] }
    expect(readSession(e).ok).toBe(false)
  })

  it('reports the heaviest weight and the lowest rep count, as it always did', () => {
    const r = readSession(entry([5, 4, 6]))
    expect(r.weight).toBe(85)
    expect(r.low).toBe(4)
    expect(r.count).toBe(3)
  })

  it('still ignores a warm-up', () => {
    const e = {
      id: '0025', target,
      sets: [{ w: 40, r: 5, done: true, wu: true },
        ...[5, 5, 5].map((r, i) => ({ w: target.rows[i].w, r, done: true }))],
    }
    expect(readSession(e).ok).toBe(true)
  })

  it('leaves a session with no rows judged exactly as before', () => {
    const e = { id: '0025', target: { id: '0025', sets: 3, reps: 5 }, sets: [
      { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }
    expect(readSession(e).ok).toBe(true)
    expect(readSession(e).goal).toBe(5)
  })
})

describe('the training max', () => {
  const rows = [{ w: 65, r: 5, amrap: false }, { w: 75, r: 5, amrap: false }, { w: 85, r: 5, amrap: true }]
  const cfg = { id: '0025', prog: 'cycle', cyc: '531', tm: 100, tmStep: 2.5 }
  // One finished cycle session. `hit` false makes the top set fall short of its minimum.
  const s = (d, hit = true) => ({
    d,
    entries: [{ id: '0025', target: { id: '0025', cyc: '531', rows },
      sets: [{ w: 65, r: 5, done: true }, { w: 75, r: 5, done: true }, { w: 85, r: hit ? 5 : 2, done: true }] }],
  })
  const S = (...ws) => ({ unit: 'kg', workouts: ws })

  it('starts at the base you set', () => {
    expect(tmFor(S(), cfg)).toBe(100)
  })

  it('does not move part way through a cycle', () => {
    expect(tmFor(S(s('1'), s('2'), s('3')), cfg)).toBe(100)
  })

  it('goes up one step for a cycle you completed', () => {
    expect(tmFor(S(s('1'), s('2'), s('3'), s('4')), cfg)).toBe(102.5)
  })

  it('keeps going up, cycle after cycle', () => {
    const eight = ['1', '2', '3', '4', '5', '6', '7', '8'].map(d => s(d))
    expect(tmFor(S(...eight), cfg)).toBe(105)
  })

  it('drops to 90 % after a cycle whose top set fell short', () => {
    // What 5/3/1 says to do, and it is what the engine already does on a stall elsewhere.
    expect(tmFor(S(s('1'), s('2'), s('3', false), s('4')), cfg)).toBe(90)
  })

  it('snaps the reset to something loadable rather than to a fraction', () => {
    expect(tmFor(S(s('1'), s('2'), s('3', false), s('4')), { ...cfg, tm: 142.5 })).toBe(127.5)
  })

  it('recovers upward from a reset once a cycle goes clean', () => {
    const eight = ['1', '2', '3', '4', '5', '6', '7', '8'].map((d, i) => s(d, i !== 2))
    expect(tmFor(S(...eight), cfg)).toBe(92.5)
  })

  it('never goes below a single step', () => {
    expect(tmFor(S(s('1'), s('2'), s('3', false), s('4')), { ...cfg, tm: 2.5 })).toBe(2.5)
  })
})

describe('the cycle policy', () => {
  const cfg = { id: '0025', sets: 3, reps: 5, weight: 0, prog: 'cycle', cyc: '531', tm: 100, tmStep: 2.5 }

  it('is offered for rep work and nothing else', () => {
    expect(POLICIES_FOR.reps).toContain('cycle')
    expect(POLICIES_FOR.time).not.toContain('cycle')
    expect(POLICIES_FOR.cardio).not.toContain('cycle')
    expect(POLICY_NAME.cycle).toBeTruthy()
    expect(POLICY_DESC.cycle).toBeTruthy()
  })

  it('prescribes week one on the very first session, rather than calling it a baseline', () => {
    // Every other policy has nothing to say until you have lifted once. A cycle knows exactly
    // what week one is before you start, and refusing to say so would be the wrong answer.
    const p = nextPrescription({ unit: 'kg', workouts: [] }, { ...cfg }, null)
    expect(p.kind).toBe('cycle')
    expect(p.week).toBe(0)
    expect(p.cycle).toBe(0)
    expect(p.tm).toBe(100)
    expect(p.rows.map(r => [r.w, r.r])).toEqual([[65, 5], [75, 5], [85, 5]])
    expect(p.rows[2].amrap).toBe(true)
  })

  it('moves to the next week once a session is logged against it', () => {
    const S = { unit: 'kg', workouts: [{
      d: '2026-01-01',
      entries: [{ id: '0025', target: { id: '0025', cyc: '531', rows: [{ w: 85, r: 5, amrap: true }] },
        sets: [{ w: 85, r: 6, done: true }] }],
    }] }
    const p = nextPrescription(S, { ...cfg }, null)
    expect(p.week).toBe(1)
    expect(p.rows.map(r => r.r)).toEqual([3, 3, 3])
  })

  it('says which cycle and week it is, so the number can be explained', () => {
    const p = nextPrescription({ unit: 'kg', workouts: [] }, { ...cfg }, null)
    expect(Array.isArray(p.why)).toBe(true)
    expect(p.why.join(' ')).toContain('{0}')
  })

  it('is not offered a policy the mode cannot take', () => {
    expect(policyFor({ id: '0025', prog: 'cycle', mode: 'time' }, null, 'time')).toBe('off')
  })

  it('leaves the other policies alone', () => {
    const S = { unit: 'kg', workouts: [{
      d: '2026-01-01',
      entries: [{ id: '0025', target: { id: '0025', sets: 3, reps: 5 },
        sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }],
    }] }
    const p = nextPrescription(S, { id: '0025', sets: 3, reps: 5, weight: 100, prog: 'linear' }, null)
    expect(p.kind).toBe('up')
    expect(p.rows).toBeUndefined()
  })
})

describe('a prescribed cycle session, recorded and read back', () => {
  const cfg = { id: '0025', sets: 3, reps: 5, weight: 0, prog: 'cycle', cyc: '531', tm: 100, tmStep: 2.5 }

  // What the entry builders in sheets.jsx and Workout.jsx must produce. Kept here as a test
  // so the shape is pinned by something that runs, not only by the two call sites.
  const buildEntry = (S, c) => {
    const plan = nextPrescription(S, c, null)
    return {
      id: c.id,
      target: { ...c, ...(plan.rows ? { rows: plan.rows } : {}) },
      plan,
      sets: applyPrescription([{ w: 0, r: 0, done: false }], plan),
    }
  }

  it('records the rows it was given, so the session can be judged against them', () => {
    const e = buildEntry({ unit: 'kg', workouts: [] }, cfg)
    expect(e.target.cyc).toBe('531')
    expect(e.target.rows).toHaveLength(3)
    expect(e.sets.map(s => s.w)).toEqual([65, 75, 85])
  })

  it('counts toward the position once it is logged, and only then', () => {
    const S = { unit: 'kg', workouts: [] }
    const e = buildEntry(S, cfg)
    expect(cyclePos(S, '0025', '531').week).toBe(0)
    e.sets = e.sets.map((s, i) => ({ ...s, r: e.target.rows[i].r, done: true }))
    S.workouts.push({ d: '2026-01-01', entries: [e] })
    expect(cyclePos(S, '0025', '531').week).toBe(1)
  })

  it('reads back as the session it actually was', () => {
    const S = { unit: 'kg', workouts: [] }
    const e = buildEntry(S, cfg)
    e.sets = e.sets.map((s, i) => ({ ...s, r: e.target.rows[i].r, done: true }))
    expect(readSession(e, cfg).ok).toBe(true)
  })

  it('adds nothing to the target for a policy that has no rows', () => {
    const e = buildEntry({ unit: 'kg', workouts: [] }, { id: '0025', sets: 3, reps: 5, weight: 60, prog: 'linear' })
    expect(e.target.rows).toBeUndefined()
  })
})
