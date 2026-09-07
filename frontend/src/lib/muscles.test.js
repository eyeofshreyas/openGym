import { describe, it, expect } from 'vitest'
import {
  MUSCLES, TARGETED, WEEKLY_TARGET, perWeek, statusOf, loadOf, loadOfWorkouts, weeksOfWindow,
} from './muscles.js'

const BENCH = '0025'   // primary chest, secondaries triceps + shoulders

describe('the weekly set target', () => {
  it('applies to the muscles the guidance is actually about', () => {
    TARGETED.forEach(m => expect(MUSCLES, m).toContain(m))
    expect(TARGETED).toContain('chest')
    expect(TARGETED).toContain('quadriceps')
  })

  it('says nothing about the small muscles nobody does ten sets for', () => {
    // Judged against 10–20 they would read as neglected forever, which teaches you to
    // ignore the colour on the ones that matter.
    ;['serratus', 'tibialis', 'hip-flexors', 'adductors', 'obliques', 'forearm']
      .forEach(m => expect(statusOf(m, 0), m).toBeNull())
  })

  it('reads a rate against the band, inclusive at both ends', () => {
    expect(statusOf('chest', 0)).toBe('under')
    expect(statusOf('chest', WEEKLY_TARGET.min - 0.1)).toBe('under')
    expect(statusOf('chest', WEEKLY_TARGET.min)).toBe('in')
    expect(statusOf('chest', 15)).toBe('in')
    expect(statusOf('chest', WEEKLY_TARGET.max)).toBe('in')
    expect(statusOf('chest', WEEKLY_TARGET.max + 0.1)).toBe('over')
  })
})

describe('turning a window of training into a weekly rate', () => {
  it('divides the load by the weeks it was spread over', () => {
    expect(perWeek(20, 1)).toBe(20)
    expect(perWeek(20, 2)).toBe(10)
    expect(perWeek(30, 30 / 7)).toBe(7)
  })

  it('never divides by less than a week, so a short history cannot inflate the rate', () => {
    expect(perWeek(12, 0)).toBe(12)
    expect(perWeek(12, 0.5)).toBe(12)
  })

  it('rounds to one decimal, the same as the number the card already shows', () => {
    expect(perWeek(10, 3)).toBe(3.3)
  })

  it('measures a fixed window in weeks, and an open one by the history it holds', () => {
    expect(weeksOfWindow(7, [])).toBe(1)
    expect(weeksOfWindow(30, [])).toBe(30 / 7)
    // All-time spans the training, not the calendar: first workout to last.
    const ws = [{ d: '2026-01-01' }, { d: '2026-01-29' }]
    expect(weeksOfWindow(0, ws)).toBe(4)
    expect(weeksOfWindow(0, [{ d: '2026-01-01' }])).toBe(1)   // one session is one week
    expect(weeksOfWindow(0, [])).toBe(1)
  })
})

describe('load still counts a supporting muscle as less than a primary', () => {
  it('gives the primary the set and the secondaries a fraction of it', () => {
    const load = loadOf([{ id: BENCH, sets: 10 }])
    expect(load.chest).toBe(10)
    expect(load.triceps).toBe(4)
    expect(load.deltoids).toBe(4)
  })

  it('so ten sets of bench is in range for chest and under it for triceps', () => {
    const load = loadOfWorkouts([{
      entries: [{ id: BENCH, sets: Array.from({ length: 10 }, () => ({ w: 60, r: 8, done: true })) }],
    }])
    expect(statusOf('chest', perWeek(load.chest, 1))).toBe('in')
    expect(statusOf('triceps', perWeek(load.triceps, 1))).toBe('under')
  })

  it('does not count a warm-up toward the weekly rate', () => {
    const sets = Array.from({ length: 10 }, () => ({ w: 60, r: 8, done: true }))
    const load = loadOfWorkouts([{ entries: [{ id: BENCH, sets: [...sets, { w: 20, r: 8, done: true, wu: true }] }] }])
    expect(load.chest).toBe(10)
  })
})
