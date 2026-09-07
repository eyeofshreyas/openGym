import { describe, it, expect } from 'vitest'
import {
  MEASURES, lengthUnit, anyMeasures, logMeasures, latestOf, pointsOf, deltaOf, delMeasure,
} from './measures.js'

const draft = () => ({ measures: {} })
const T = (iso, v) => ({ d: iso, v, t: new Date(iso).getTime() })

describe('the measurement list', () => {
  it('runs head to toe, the way every other list of body parts here does', () => {
    expect(MEASURES.map(m => m.k)).toEqual(
      ['neck', 'shoulders', 'chest', 'arm', 'waist', 'hips', 'thigh', 'calf'])
  })

  it('takes its length unit from the profile rather than asking again', () => {
    expect(lengthUnit({ unit: 'kg' })).toBe('cm')
    expect(lengthUnit({ unit: 'lb' })).toBe('in')
    expect(lengthUnit({})).toBe('cm')
  })
})

describe('logging a set of measurements', () => {
  it('writes only the ones you filled in', () => {
    const s = draft()
    const n = logMeasures(s, { waist: 82, chest: 101.5, arm: '', thigh: null }, '2026-03-01')
    expect(n).toBe(2)
    expect(Object.keys(s.measures).sort()).toEqual(['chest', 'waist'])
    expect(s.measures.waist[0]).toEqual({ d: '2026-03-01', v: 82, t: expect.any(Number) })
  })

  it('leaves a blank alone rather than reading it as zero or as a deletion', () => {
    // You measure your waist every week and your neck twice a year. A blank means "not
    // today", and clearing the entry you took in January would be the wrong reading of it.
    const s = { measures: { neck: [T('2026-01-01', 38)] } }
    logMeasures(s, { neck: '', waist: 82 }, '2026-03-01')
    expect(s.measures.neck).toEqual([T('2026-01-01', 38)])
  })

  it('refuses a value that is not a measurement', () => {
    const s = draft()
    expect(logMeasures(s, { waist: 0, chest: -3, arm: 'abc' }, '2026-03-01')).toBe(0)
    expect(s.measures).toEqual({})
  })

  it('replaces the same day instead of stacking two entries on it', () => {
    const s = draft()
    logMeasures(s, { waist: 82 }, '2026-03-01')
    logMeasures(s, { waist: 81.5 }, '2026-03-01')
    expect(s.measures.waist).toHaveLength(1)
    expect(s.measures.waist[0].v).toBe(81.5)
  })

  it('keeps a series in date order however it was entered', () => {
    const s = draft()
    logMeasures(s, { waist: 84 }, '2026-03-01')
    logMeasures(s, { waist: 86 }, '2026-01-01')
    logMeasures(s, { waist: 85 }, '2026-02-01')
    expect(s.measures.waist.map(e => e.v)).toEqual([86, 85, 84])
  })

  it('rounds to one decimal, the same as body weight', () => {
    const s = draft()
    logMeasures(s, { waist: 82.26 }, '2026-03-01')
    expect(s.measures.waist[0].v).toBe(82.3)
  })

  it('drops one entry without disturbing the rest', () => {
    const s = { measures: { waist: [T('2026-01-01', 84), T('2026-02-01', 83)] } }
    delMeasure(s, 'waist', '2026-01-01')
    expect(s.measures.waist).toEqual([T('2026-02-01', 83)])
  })
})

describe('reading a series back', () => {
  const series = [T('2026-01-01', 88), T('2026-02-01', 85), T('2026-03-01', 83)]

  it('finds the latest entry, and copes with having none', () => {
    expect(latestOf(series).v).toBe(83)
    expect(latestOf([])).toBeNull()
    expect(latestOf(undefined)).toBeNull()
  })

  it('shapes points the way the chart wants them', () => {
    const pts = pointsOf(series, 0)
    expect(pts).toHaveLength(3)
    expect(pts[0]).toEqual({ t: series[0].t, y: 88, d: '2026-01-01' })
  })

  it('narrows to the range asked for, and 0 means everything', () => {
    const now = new Date('2026-03-15').getTime()
    expect(pointsOf(series, 30, now)).toHaveLength(1)
    expect(pointsOf(series, 90, now)).toHaveLength(3)
    expect(pointsOf(series, 0, now)).toHaveLength(3)
  })

  it('reads the change across the range, and says nothing on a single point', () => {
    expect(deltaOf(series, 0)).toBe(-5)
    expect(deltaOf([T('2026-03-01', 83)], 0)).toBeNull()
    expect(deltaOf([], 0)).toBeNull()
  })
})

describe('whether a profile holds any measurements at all', () => {
  it('is what stops a sign-in overwriting someone who only ever logged their waist', () => {
    expect(anyMeasures(undefined)).toBe(false)
    expect(anyMeasures({})).toBe(false)
    expect(anyMeasures({ waist: [] })).toBe(false)
    expect(anyMeasures({ waist: [T('2026-01-01', 84)] })).toBe(true)
  })
})
