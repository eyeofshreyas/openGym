import { describe, it, expect } from 'vitest'
import { CYCLES, CYCLE_KEYS, weeksOf, weekCount, rowsFor } from './cycles.js'

describe('the percentage tables', () => {
  it('ships the two the app offers', () => {
    expect(CYCLE_KEYS).toEqual(['531', 'bbb'])
    CYCLE_KEYS.forEach(k => {
      expect(CYCLES[k].name, k).toBeTruthy()
      expect(CYCLES[k].desc, k).toBeTruthy()
    })
  })

  it('is four weeks of real percentages either way', () => {
    CYCLE_KEYS.forEach(k => {
      const weeks = weeksOf(k)
      expect(weekCount(k), k).toBe(4)
      weeks.forEach((wk, i) => {
        expect(wk.length, `${k} week ${i}`).toBeGreaterThan(0)
        wk.forEach(([pct, reps]) => {
          expect(pct, `${k} week ${i}`).toBeGreaterThan(0)
          expect(pct, `${k} week ${i}`).toBeLessThanOrEqual(100)
          expect(reps, `${k} week ${i}`).toBeGreaterThan(0)
        })
      })
    })
  })

  it('marks at most one AMRAP a week, and always the last set of it', () => {
    CYCLE_KEYS.forEach(k => weeksOf(k).forEach((wk, i) => {
      const marked = wk.map((r, idx) => (r[2] ? idx : -1)).filter(x => x >= 0)
      expect(marked.length, `${k} week ${i}`).toBeLessThanOrEqual(1)
      if (marked.length) expect(marked[0], `${k} week ${i}`).toBe(wk.length - 1)
    }))
  })

  it('has 5/3/1 climb and then deload', () => {
    const top = weeksOf('531').map(wk => wk[wk.length - 1][0])
    expect(top).toEqual([85, 90, 95, 60])
  })

  it('falls back to 5/3/1 rather than throwing on a table it does not have', () => {
    expect(weeksOf('nonsense')).toEqual(weeksOf('531'))
    expect(weekCount('nonsense')).toBe(4)
  })
})

describe('turning a week into sets', () => {
  it('takes each percentage off the training max', () => {
    // 5/3/1 week 1 on a 100 kg training max: 65, 75, 85, last one as far as it goes.
    expect(rowsFor('531', 0, 100, 2.5)).toEqual([
      { w: 65, r: 5, amrap: false },
      { w: 75, r: 5, amrap: false },
      { w: 85, r: 5, amrap: true },
    ])
  })

  it('snaps to something you can actually load', () => {
    // 65 % of 142.5 is 92.625, which is not a weight. The step is what the bar moves in.
    const rows = rowsFor('531', 0, 142.5, 2.5)
    // 92.625 / 106.875 / 121.125 to the nearest 2.5. The last one rounds DOWN — 121.125 is
    // nearer 120 than 122.5, and a calculator that rounded it up would put 0.9 kg on the bar
    // that the percentage never asked for.
    expect(rows.map(r => r.w)).toEqual([92.5, 107.5, 120])
  })

  it('never returns a weight with more precision than the app stores', () => {
    rowsFor('531', 2, 137.5, 1.25).forEach(r => {
      expect(Math.round(r.w * 10) / 10, String(r.w)).toBe(r.w)
    })
  })

  it('never goes below one step, however small the training max', () => {
    rowsFor('531', 3, 1, 2.5).forEach(r => expect(r.w).toBeGreaterThanOrEqual(2.5))
  })

  it('wraps a week index past the end of the table', () => {
    expect(rowsFor('531', 4, 100, 2.5)).toEqual(rowsFor('531', 0, 100, 2.5))
  })
})
