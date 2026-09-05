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
