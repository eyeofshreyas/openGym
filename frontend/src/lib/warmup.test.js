import { describe, it, expect } from 'vitest'
import { isWorkSet, workoutVolume, setsDone, setsDoneActive, lastEntryFor, bestWeightFor } from './history.js'
import { readSession, nextPrescription } from './progression.js'
import { best1RM, bestSetOf } from './onerm.js'
import { loadOfWorkouts } from './muscles.js'
import { parseImport } from './import-csv.js'

// A loaded barbell lift, so nothing here goes down the bodyweight path.
const BENCH = '0025'

const set = (w, r, extra) => ({ w, r, done: true, ...extra })
// The same session twice: once as three working sets, once with two warm-ups in front of
// them. Every number the app shows should be blind to the difference — that is the feature.
const working = [set(100, 5), set(100, 5), set(100, 5)]
const withWarmups = [set(40, 5, { wu: true }), set(70, 5, { wu: true }), ...working]

const workout = sets => ({ d: '2026-01-05', entries: [{ id: BENCH, target: { id: BENCH, sets: 3, reps: 5 }, sets }] })
const state = sets => ({ unit: 'kg', workouts: [workout(sets)], exWeights: {} })

describe('a warm-up set counts toward nothing', () => {
  it('knows which sets count', () => {
    expect(isWorkSet({ done: true })).toBe(true)
    expect(isWorkSet({ done: true, wu: true })).toBe(false)
    expect(isWorkSet({ done: false })).toBe(false)
    expect(isWorkSet({ done: false, wu: true })).toBe(false)
    expect(isWorkSet(null)).toBe(false)
  })

  it('leaves volume where it was', () => {
    expect(workoutVolume(workout(withWarmups))).toBe(workoutVolume(workout(working)))
    expect(workoutVolume(workout(working))).toBe(1500)
  })

  it('leaves the set count where it was', () => {
    expect(setsDone(workout(withWarmups))).toBe(3)
    expect(setsDoneActive({ entries: workout(withWarmups).entries })).toBe(3)
  })

  it('leaves the muscle map where it was', () => {
    expect(loadOfWorkouts([workout(withWarmups)])).toEqual(loadOfWorkouts([workout(working)]))
  })

  it('is never the best set, however heavy the app thinks it is', () => {
    // A mis-flagged heavy single would otherwise become a personal record out of nowhere.
    const sneaky = [set(200, 1, { wu: true }), ...working]
    expect(bestSetOf({ sets: sneaky }).w).toBe(100)
    expect(best1RM(state(sneaky), BENCH).w).toBe(100)
    expect(bestWeightFor(state(sneaky), BENCH)).toBe(100)
  })

  it('never seeds the next session, so warm-up weights do not become working ones', () => {
    const last = lastEntryFor(state(withWarmups), BENCH)
    expect(last.sets.length).toBe(3)
    expect(last.sets.every(s => s.w === 100)).toBe(true)
  })
})

describe('a warm-up set is invisible to progression', () => {
  it('reads the session as the working sets alone', () => {
    const a = readSession(workout(working).entries[0])
    const b = readSession(workout(withWarmups).entries[0])
    expect(b).toEqual(a)
    expect(b.ok).toBe(true)
    expect(b.count).toBe(3)
  })

  it('cannot rescue a session that missed its reps', () => {
    // Two clean warm-ups in front of a failed working set used to make `every()` pass and
    // `low` read 5 — the session would advance the load off the back of the warm-ups.
    const missed = [set(40, 5, { wu: true }), set(70, 5, { wu: true }), set(100, 5), set(100, 5), set(100, 2)]
    const r = readSession({ id: BENCH, target: { id: BENCH, sets: 3, reps: 5 }, sets: missed })
    expect(r.ok).toBe(false)
    expect(r.low).toBe(2)
    expect(r.count).toBe(3)
  })

  it('prescribes the same next session either way', () => {
    const cfg = { id: BENCH, sets: 3, reps: 5, weight: 100, prog: 'linear' }
    const plain = nextPrescription(state(working), { ...cfg }, null)
    const warmed = nextPrescription(state(withWarmups), { ...cfg }, null)
    expect(warmed.kind).toBe(plain.kind)
    expect(warmed.weight).toBe(plain.weight)
  })

  it('does not count toward the sets the plan asked for', () => {
    // Three planned sets, two warm-ups and two working ones: the session is short, and
    // counting the warm-ups toward `enough` would call it complete.
    const short = [set(40, 5, { wu: true }), set(70, 5, { wu: true }), set(100, 5), set(100, 5)]
    expect(readSession({ id: BENCH, target: { id: BENCH, sets: 3, reps: 5 }, sets: short }).ok).toBe(false)
  })
})

describe('importing a file that marks its warm-ups', () => {
  // Strong and Hevy both write a set-type column. These rows used to arrive as working sets,
  // which inflated volume, set counts and the muscle map for every imported history.
  const csv = [
    'Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Set Type',
    '2026-01-05 09:00:00,Push,Bench Press (Barbell),1,40,5,warmup',
    '2026-01-05 09:00:00,Push,Bench Press (Barbell),2,100,5,normal',
    '2026-01-05 09:00:00,Push,Bench Press (Barbell),3,100,5,normal',
  ].join('\n')

  it('keeps the warm-up row but marks it, so nothing in the file is dropped or miscounted', () => {
    const r = parseImport(csv)
    const sets = r.workouts[0].entries[0].sets
    expect(sets.length).toBe(3)
    expect(sets.filter(s => s.wu).length).toBe(1)
    expect(sets.find(s => s.wu).w).toBe(40)
    expect(workoutVolume(r.workouts[0])).toBe(1000)
    expect(setsDone(r.workouts[0])).toBe(2)
  })
})
