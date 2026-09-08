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

import { cycleSessions, cyclePos } from './cycles.js'

// A finished session. `cyc` on the target is the marker that says "this was a cycle session";
// history from before you switched to 5/3/1 has none and must not count.
const sess = (d, opts = {}) => ({
  d,
  entries: [{
    id: '0025',
    target: opts.plain ? { id: '0025', reps: 5 } : { id: '0025', cyc: '531', rows: [{ w: 100, r: 5, amrap: true }] },
    sets: [{ w: 100, r: 5, done: opts.done !== false }],
  }],
})

describe('where you are in the cycle', () => {
  it('counts nothing when nothing has been logged', () => {
    expect(cyclePos({ workouts: [] }, '0025', '531')).toEqual({ n: 0, cycle: 0, week: 0 })
  })

  it('ignores the history from before you switched to a cycle', () => {
    const S = { workouts: [sess('2026-01-01', { plain: true }), sess('2026-01-08', { plain: true })] }
    expect(cyclePos(S, '0025', '531').n).toBe(0)
  })

  it('ignores a session where nothing was actually ticked off', () => {
    const S = { workouts: [sess('2026-01-01', { done: false })] }
    expect(cyclePos(S, '0025', '531').n).toBe(0)
  })

  it('walks week by week and rolls into the next cycle', () => {
    const days = ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29', '2026-02-05']
    const at = n => cyclePos({ workouts: days.slice(0, n).map(d => sess(d)) }, '0025', '531')
    expect(at(0)).toEqual({ n: 0, cycle: 0, week: 0 })
    expect(at(3)).toEqual({ n: 3, cycle: 0, week: 3 })
    expect(at(4)).toEqual({ n: 4, cycle: 1, week: 0 })
    expect(at(6)).toEqual({ n: 6, cycle: 1, week: 2 })
  })

  it('steps back on its own when a mislogged workout is deleted', () => {
    // The reason position is derived rather than stored: there is nothing to repair.
    const days = ['2026-01-01', '2026-01-08', '2026-01-15']
    const S = { workouts: days.map(d => sess(d)) }
    expect(cyclePos(S, '0025', '531').week).toBe(3)
    S.workouts = S.workouts.filter(w => w.d !== '2026-01-15')
    expect(cyclePos(S, '0025', '531').week).toBe(2)
  })

  it('counts each lift separately, because each lift is trained separately', () => {
    const S = { workouts: [sess('2026-01-01'), sess('2026-01-08')] }
    expect(cyclePos(S, '0025', '531').n).toBe(2)
    expect(cyclePos(S, '0043', '531').n).toBe(0)
  })

  it('hands back the sessions themselves, oldest first', () => {
    const S = { workouts: [sess('2026-01-01'), sess('2026-01-08')] }
    expect(cycleSessions(S, '0025').map(s => s.d)).toEqual(['2026-01-01', '2026-01-08'])
  })

  it('wraps on the length of the table it is given', () => {
    const S = { workouts: ['a', 'b', 'c', 'd', 'e'].map((_, i) => sess('2026-01-0' + (i + 1))) }
    expect(cyclePos(S, '0025', '531')).toEqual({ n: 5, cycle: 1, week: 1 })
  })
})
