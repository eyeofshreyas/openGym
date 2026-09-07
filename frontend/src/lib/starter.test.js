import { describe, it, expect } from 'vitest'
import { starterRoutines } from './starter.js'
import { EXIDX } from './exercises.js'
import { MUSCLES, MUSCLE_NAME, loadOfRoutine } from './muscles.js'
import { defaultIncrement, nextPrescription } from './progression.js'
import { isBodyweightEq } from './exercises.js'

const week = () => {
  const load = {}
  starterRoutines().forEach(r => {
    const l = loadOfRoutine(r)
    for (const m in l) load[m] = (load[m] || 0) + l[m]
  })
  return load
}

describe('the starter plan', () => {
  it('names exercises the library actually has', () => {
    starterRoutines().forEach(r => r.ex.forEach(e => expect(EXIDX[e.id], e.id).toBeTruthy()))
  })

  it('trains every muscle the body map draws', () => {
    const load = week()
    const blank = MUSCLES.filter(m => !load[m]).map(m => MUSCLE_NAME[m])
    expect(blank).toEqual([])
  })

  it('gives each of them enough work to register, not a token set', () => {
    const load = week()
    const thin = MUSCLES.filter(m => load[m] < 1).map(m => MUSCLE_NAME[m] + ' ' + load[m].toFixed(1))
    expect(thin).toEqual([])
  })

  it('steps the small lifts by less than the body-part default', () => {
    // A 10 kg lateral raise taking the 2.5 kg default is a 25 % jump — it stalls on the
    // second session, which reads as the plan being wrong rather than the step being wrong.
    const all = starterRoutines().flatMap(r => r.ex)
    const small = ['0334', '0328', '0031', '0313', '0426']
    small.forEach(id => {
      const e = all.find(x => x.id === id)
      expect(e.inc, id).toBeLessThan(defaultIncrement(id, 'kg'))
    })
  })

  it('leaves bodyweight work without a load step', () => {
    starterRoutines().flatMap(r => r.ex)
      .filter(e => isBodyweightEq(e.id))
      .forEach(e => expect(e.inc, e.id).toBeUndefined())
  })

  it('doubles every step for a profile in pounds', () => {
    const kg = starterRoutines('kg').flatMap(r => r.ex)
    const lb = starterRoutines('lb').flatMap(r => r.ex)
    kg.forEach((e, i) => expect(lb[i].inc ?? null).toBe(e.inc ? e.inc * 2 : null))
  })

  it('adds exactly that step after a clean session', () => {
    const [push] = starterRoutines()
    const cfg = push.ex.find(e => e.id === '0334')          // lateral raise, 1 kg step
    const S = {
      unit: 'kg',
      workouts: [{
        d: '2026-01-05',
        entries: [{ id: cfg.id, target: { ...cfg }, sets: Array.from({ length: cfg.sets }, () => ({ w: 10, r: cfg.reps, done: true })) }]
      }]
    }
    const p = nextPrescription(S, { ...cfg }, push)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(11)
  })

  it('keeps each day to a sane length', () => {
    starterRoutines().forEach(r => {
      expect(r.ex.length, r.name).toBeLessThanOrEqual(8)
      expect(r.ex.reduce((n, e) => n + e.sets, 0), r.name).toBeLessThanOrEqual(30)
    })
  })
})
