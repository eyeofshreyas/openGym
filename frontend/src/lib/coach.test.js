import { describe, it, expect } from 'vitest'
import { candidateExercises, buildPrompt, MAX_EX } from './coach.js'
import { EXIDX } from './exercises.js'

describe('candidateExercises', () => {
  it('returns only exercises using the equipment asked for', () => {
    const names = candidateExercises(['barbell'])
    expect(names.length).toBeGreaterThan(10)
    const byName = new Map(Object.values(EXIDX).map(e => [e.n, e]))
    names.forEach(n => expect(byName.get(n).eq).toBe('barbell'))
  })

  it('never returns cardio — the builder plans lifting', () => {
    const byName = new Map(Object.values(EXIDX).map(e => [e.n, e]))
    candidateExercises([]).forEach(n => expect(byName.get(n).bp).not.toBe('cardio'))
  })

  it('honours the limit and stays well under the full library', () => {
    expect(candidateExercises([], 50)).toHaveLength(50)
    expect(candidateExercises([]).length).toBeLessThanOrEqual(200)
  })

  it('spreads across body parts rather than exhausting one', () => {
    const byName = new Map(Object.values(EXIDX).map(e => [e.n, e]))
    const parts = new Set(candidateExercises([], 40).map(n => byName.get(n).bp))
    expect(parts.size).toBeGreaterThan(4)
  })

  it('returns nothing for equipment no exercise uses', () => {
    expect(candidateExercises(['moon rocks'])).toEqual([])
  })
})

describe('buildPrompt', () => {
  const p = () => buildPrompt(
    { days: 4, equipment: ['barbell', 'dumbbell'], goal: 'strength', limits: 'bad left shoulder' },
    ['barbell bench press', 'dumbbell curl']
  )

  it('states the day count, goal and limitations', () => {
    expect(p()).toContain('4')
    expect(p()).toContain('strength')
    expect(p()).toContain('bad left shoulder')
  })

  it('lists every candidate and nothing else to choose from', () => {
    expect(p()).toContain('barbell bench press')
    expect(p()).toContain('dumbbell curl')
  })

  it('demands JSON and forbids numbers', () => {
    const s = p()
    expect(s).toContain('"routines"')
    expect(s.toLowerCase()).toContain('json')
    expect(s).toMatch(/do not include sets, reps or weights/i)
    expect(s).toContain(String(MAX_EX))
  })

  it('omits empty optional fields instead of writing blanks', () => {
    const s = buildPrompt({ days: 3, equipment: [], goal: '', limits: '' }, ['squat'])
    expect(s).not.toMatch(/Goal:/)
    expect(s).not.toMatch(/Limitations/)
  })
})

import { coercePlan, planBundleFrom, planFromModel, MAX_DAYS } from './coach.js'

const GOOD = JSON.stringify({
  routines: [
    { name: 'Push', day: 1, exercises: ['bench press', 'lateral raise'] },
    { name: 'Pull', day: 3, exercises: ['barbell row', 'lat pulldown'] },
  ],
})

describe('coercePlan', () => {
  it('reads a clean response', () => {
    const c = coercePlan(GOOD)
    expect(c.routines).toHaveLength(2)
    expect(c.routines[0]).toEqual({ name: 'Push', day: 1, names: ['bench press', 'lateral raise'] })
  })

  it('digs the JSON out of prose and code fences', () => {
    expect(coercePlan('Sure! Here you go:\n```json\n' + GOOD + '\n```\nHope that helps.').routines).toHaveLength(2)
  })

  it('returns null for junk rather than throwing', () => {
    expect(coercePlan('I cannot help with that.')).toBeNull()
    expect(coercePlan('{ broken json')).toBeNull()
    expect(coercePlan('')).toBeNull()
    expect(coercePlan(null)).toBeNull()
  })

  it('returns null when no routine has any exercise', () => {
    expect(coercePlan('{"routines":[{"name":"Push","day":1,"exercises":[]}]}')).toBeNull()
  })

  it('clamps a padded routine to MAX_EX and drops duplicates', () => {
    const many = Array.from({ length: 20 }, (_, i) => 'ex' + i).concat('ex0')
    const c = coercePlan(JSON.stringify({ routines: [{ name: 'A', day: 1, exercises: many }] }))
    expect(c.routines[0].names).toHaveLength(MAX_EX)
    expect(new Set(c.routines[0].names).size).toBe(MAX_EX)
  })

  it('caps the week at MAX_DAYS routines', () => {
    const rs = Array.from({ length: 9 }, (_, i) => ({ name: 'R' + i, day: i % 7, exercises: ['squat'] }))
    expect(coercePlan(JSON.stringify({ routines: rs })).routines).toHaveLength(MAX_DAYS)
  })

  it('nulls a day that is out of range, not an integer, or already taken', () => {
    const c = coercePlan(JSON.stringify({ routines: [
      { name: 'A', day: 9, exercises: ['squat'] },
      { name: 'B', day: 'monday', exercises: ['squat'] },
      { name: 'C', day: 1, exercises: ['squat'] },
      { name: 'D', day: 1, exercises: ['squat'] },
    ] }))
    expect(c.routines.map(r => r.day)).toEqual([null, null, 1, null])
  })

  it('names an unnamed routine instead of leaving it blank', () => {
    const c = coercePlan('{"routines":[{"day":1,"exercises":["squat"]}]}')
    expect(c.routines[0].name).toBe('Routine 1')
  })
})

describe('planBundleFrom', () => {
  it('resolves names to library ids and fills in sets and reps', () => {
    const { bundle, unmatched } = planBundleFrom(coercePlan(GOOD))
    expect(unmatched).toBe(0)
    expect(bundle.routines).toHaveLength(2)
    const ex = bundle.routines[0].ex[0]
    expect(ex.id).toBe('0025')
    expect(ex.sets).toBe(3)
    expect(ex.reps).toBe(10)
    expect(bundle.week).toEqual({ 1: bundle.routines[0].id, 3: bundle.routines[1].id })
  })

  it('counts names it cannot resolve and leaves them out', () => {
    const { bundle, unmatched } = planBundleFrom(coercePlan(
      '{"routines":[{"name":"A","day":1,"exercises":["bench press","hyperbolic quad blaster"]}]}'
    ))
    expect(unmatched).toBe(1)
    expect(bundle.routines[0].ex).toHaveLength(1)
  })

  it('drops a routine whose every exercise was unresolvable, and its weekday with it', () => {
    const { bundle } = planBundleFrom(coercePlan('{"routines":[{"name":"A","day":2,"exercises":["zzzz nonsense"]}]}'))
    expect(bundle.routines).toHaveLength(0)
    expect(bundle.week).toEqual({})
  })

  it('gives every routine a distinct id', () => {
    const { bundle } = planBundleFrom(coercePlan(GOOD))
    expect(bundle.routines[0].id).not.toBe(bundle.routines[1].id)
  })
})

describe('planFromModel', () => {
  it('produces a bundle parsePlan accepts, ready for the import sheet', () => {
    const p = planFromModel(GOOD)
    expect(p.routineCount).toBe(2)
    expect(p.exerciseCount).toBe(4)
    expect(p.scheduledDays).toBe(2)
  })

  it("reports unmatched names through the sheet's dropped count", () => {
    const p = planFromModel('{"routines":[{"name":"A","day":1,"exercises":["bench press","zzzz nonsense"]}]}')
    expect(p.dropped).toBe(1)
  })

  it('returns null when nothing usable survives', () => {
    expect(planFromModel('nope')).toBeNull()
    expect(planFromModel('{"routines":[{"name":"A","exercises":["zzzz nonsense"]}]}')).toBeNull()
  })
})
