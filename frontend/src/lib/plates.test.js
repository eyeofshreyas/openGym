import { describe, it, expect } from 'vitest'
import { BAR, PLATES, barOf, platesOf, platesFor } from './plates.js'

const KG = PLATES.kg
const noMicro = KG.filter(p => p !== 1.25)

describe('loading a bar', () => {
  it('splits an ordinary weight over both sides, heaviest plate first', () => {
    const r = platesFor(100, 20, KG)
    expect(r.perSide).toEqual([{ w: 25, n: 1 }, { w: 15, n: 1 }])
    expect(r.achieved).toBe(100)
    expect(r.short).toBe(0)
  })

  it('stacks the same plate rather than pretending it only owns one', () => {
    expect(platesFor(140, 20, KG).perSide).toEqual([{ w: 25, n: 2 }, { w: 10, n: 1 }])
  })

  it('says nothing to load when the target is the empty bar', () => {
    const r = platesFor(20, 20, KG)
    expect(r.perSide).toEqual([])
    expect(r.achieved).toBe(20)
    expect(r.short).toBe(0)
  })

  it('reaches an awkward number when the small plates are there', () => {
    const r = platesFor(102.5, 20, KG)
    expect(r.perSide).toEqual([{ w: 25, n: 1 }, { w: 15, n: 1 }, { w: 1.25, n: 1 }])
    expect(r.short).toBe(0)
  })

  it('says how far short it lands rather than quietly rounding', () => {
    // The whole point: without 1.25s that target is not loadable, and a calculator that
    // printed 100 kg without saying so would have you log a lift you did not do.
    const r = platesFor(102.5, 20, noMicro)
    expect(r.achieved).toBe(100)
    expect(r.short).toBe(2.5)
    expect(r.perSide).toEqual([{ w: 25, n: 1 }, { w: 15, n: 1 }])
  })

  it('is not confused by the arithmetic that breaks floating point', () => {
    // 2.5 and 1.25 are exactly the values that make a naive loop leave 0.30000000000004
    // on the bar and ask for a plate nobody makes.
    expect(platesFor(22.5, 20, KG).perSide).toEqual([{ w: 1.25, n: 1 }])
    expect(platesFor(62.5, 20, KG).perSide).toEqual([{ w: 20, n: 1 }, { w: 1.25, n: 1 }])
    expect(platesFor(97.5, 20, KG).perSide)
      .toEqual([{ w: 25, n: 1 }, { w: 10, n: 1 }, { w: 2.5, n: 1 }, { w: 1.25, n: 1 }])
    ;[22.5, 62.5, 97.5, 102.5].forEach(w => expect(platesFor(w, 20, KG).short, String(w)).toBe(0))
  })

  it('knows a loaded bar only moves in twice the smallest plate', () => {
    // Both sides take the plate, so a 1.25 is a 2.5 step. 61.25 looks reachable and is not,
    // and the honest answer is the 1.25 gap rather than a plate order that does not add up.
    const r = platesFor(61.25, 20, KG)
    expect(r.achieved).toBe(60)
    expect(r.short).toBe(1.25)
  })

  it('flags a target the bar alone already passes, instead of loading negative plates', () => {
    const r = platesFor(15, 20, KG)
    expect(r.underBar).toBe(true)
    expect(r.perSide).toEqual([])
    expect(r.achieved).toBe(20)
  })

  it('works in pounds on a pound bar', () => {
    expect(platesFor(225, 45, PLATES.lb).perSide).toEqual([{ w: 45, n: 2 }])
    expect(platesFor(135, 45, PLATES.lb).perSide).toEqual([{ w: 45, n: 1 }])
  })

  it('treats a missing or nonsense inventory as nothing to load', () => {
    expect(platesFor(100, 20, []).short).toBe(80)
    expect(platesFor(100, 20, undefined).achieved).toBe(20)
  })
})

describe('what the profile lifts with', () => {
  it('falls back to the commercial-gym bar for the unit', () => {
    expect(barOf({ unit: 'kg' })).toBe(BAR.kg)
    expect(barOf({ unit: 'lb' })).toBe(BAR.lb)
    expect(barOf({ unit: 'kg', bar: 15 })).toBe(15)
  })

  it('falls back to the full plate set, and keeps a chosen one sorted heaviest first', () => {
    expect(platesOf({ unit: 'kg' })).toEqual(PLATES.kg)
    expect(platesOf({ unit: 'lb' })).toEqual(PLATES.lb)
    expect(platesOf({ unit: 'kg', plates: [5, 20, 10] })).toEqual([20, 10, 5])
    expect(platesOf({ unit: 'kg', plates: [] })).toEqual([])
  })
})
