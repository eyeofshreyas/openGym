import { describe, it, expect } from 'vitest'
import { starterRoutines } from './starter.js'
import { EXIDX } from './exercises.js'
import { MUSCLES, MUSCLE_NAME, loadOfRoutine } from './muscles.js'

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

  it('keeps each day to a sane length', () => {
    starterRoutines().forEach(r => {
      expect(r.ex.length, r.name).toBeLessThanOrEqual(8)
      expect(r.ex.reduce((n, e) => n + e.sets, 0), r.name).toBeLessThanOrEqual(30)
    })
  })
})
