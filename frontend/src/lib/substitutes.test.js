import { describe, it, expect } from 'vitest'
import { substitutesFor } from './substitutes.js'
import { EXDB } from './exercises.js'

const BENCH = '0025'          // barbell bench press · chest · barbell · pectorals
const SQUAT = '0043'          // barbell full squat — the library also has (back pov)/(side pov)
const LATERAL = '0334'        // dumbbell lateral raise · shoulders · dumbbell · delts
const CARDIO = EXDB.find(e => e.bp === 'cardio').id

describe('substitutesFor', () => {
  it('offers exercises for the same target muscle', () => {
    const out = substitutesFor(BENCH)
    expect(out.length).toBe(8)
    expect(out.every(e => e.tg === 'pectorals')).toBe(true)
  })

  it('never offers the exercise you are swapping away from', () => {
    expect(substitutesFor(BENCH, { limit: 200 }).some(e => e.id === BENCH)).toBe(false)
  })

  it('ranks the same target above an unrelated lift', () => {
    expect(substitutesFor(BENCH, { limit: 200 }).some(e => e.id === LATERAL)).toBe(false)
  })

  it('prefers a different implement — the bench being busy is the point', () => {
    expect(substitutesFor(BENCH)[0].eq).not.toBe('barbell')
  })

  it('ranks the same movement above a stretch that shares its muscles', () => {
    // The dataset gives a chest stretch the same tg and sm as a bench press; only the name
    // says one of them is not a working set.
    expect(substitutesFor(BENCH, { limit: 200 }).some(e => /stretch/.test(e.n))).toBe(false)
    expect(substitutesFor(BENCH).every(e => /press/.test(e.n))).toBe(true)
  })

  it('does not offer the same lift filmed from another angle', () => {
    expect(substitutesFor(SQUAT, { limit: 200 }).some(e => /^barbell full squat/.test(e.n))).toBe(false)
  })

  it('leaves out exercises already in the session', () => {
    const first = substitutesFor(BENCH)[0]
    expect(substitutesFor(BENCH, { exclude: [first.id] }).some(e => e.id === first.id)).toBe(false)
  })

  it('does not cross the cardio line in either direction', () => {
    expect(substitutesFor(BENCH, { limit: 200 }).some(e => e.bp === 'cardio')).toBe(false)
    expect(substitutesFor(CARDIO, { limit: 200 }).every(e => e.bp === 'cardio')).toBe(true)
  })

  it('returns nothing for an exercise the library does not know', () => {
    expect(substitutesFor('nope-not-here')).toEqual([])
  })
})
