import { describe, it, expect } from 'vitest'
import { exportCSV, exportRows, exportWorkingRows } from './export-csv.js'
import { parseImport, detectSource } from './import-csv.js'
import { workoutVolume, setsDone } from './history.js'

const BENCH = '0025'   // barbell bench press
const PLANK = '0464'   // front plank with twist — a timed hold

const state = () => ({
  unit: 'kg', customEx: [],
  workouts: [{
    id: 'w1', d: '2026-03-02', start: new Date('2026-03-02T18:30:00').getTime(), name: 'Push',
    entries: [{
      id: BENCH, target: { id: BENCH, sets: 3, reps: 5, note: 'elbows tucked' },
      sets: [
        { w: 40, r: 5, done: true, wu: true },
        { w: 100, r: 5, done: true, rir: 2 },
        { w: 100, r: 5, done: true, rir: 1 },
        { w: 100, r: 4, done: false },        // never logged
      ],
    }],
  }],
})

describe('exporting the history', () => {
  it('writes a header the importer already knows how to read', () => {
    const head = exportCSV(state()).split('\n')[0]
    expect(head).toContain('Exercise Name')
    expect(head).toContain('Set Order')
    expect(head).toContain('Set Type')
  })

  it('writes one row per logged set and skips the ones never ticked', () => {
    const csv = exportCSV(state())
    expect(csv.trim().split('\n')).toHaveLength(1 + 3)
    expect(exportRows(state())).toBe(3)
    expect(exportWorkingRows(state())).toBe(2)   // the warm-up is not work
  })

  it('quotes a field that would otherwise split the row', () => {
    const s = state()
    s.workouts[0].entries[0].target.note = 'seat 4, elbows "tucked"'
    const line = exportCSV(s).split('\n')[1]
    expect(line).toContain('"seat 4, elbows ""tucked"""')
    expect(exportCSV(s).trim().split('\n')).toHaveLength(4)
  })

  it('is recognised as ours rather than as Strong', () => {
    const head = exportCSV(state()).split('\n')[0].split(',')
    expect(detectSource(head)).toBe('openGym')
  })
})

describe('putting the export back in', () => {
  const round = S => parseImport(exportCSV(S))

  it('comes back as the same sets, against the same exercise', () => {
    const r = round(state())
    expect(r.workouts).toHaveLength(1)
    const e = r.workouts[0].entries[0]
    expect(e.id).toBe(BENCH)
    expect(e.sets.map(s => [s.w, s.r])).toEqual([[40, 5], [100, 5], [100, 5]])
  })

  it('brings the warm-up back as a warm-up, so the numbers match on both sides', () => {
    const before = state().workouts[0]
    const after = round(state()).workouts[0]
    expect(after.entries[0].sets.filter(s => s.wu)).toHaveLength(1)
    expect(workoutVolume(after)).toBe(workoutVolume(before))
    expect(setsDone(after)).toBe(setsDone(before))
  })

  it('keeps the effort ratings that were logged', () => {
    const sets = round(state()).workouts[0].entries[0].sets
    expect(sets.map(s => s.rir ?? null)).toEqual([null, 2, 1])
  })

  it('carries a timed hold back as seconds rather than reps', () => {
    const s = state()
    s.workouts[0].entries.push({
      id: PLANK, target: { id: PLANK, mode: 'time', sets: 1, sec: 45 },
      sets: [{ sec: 45, w: 0, done: true }],
    })
    const e = round(s).workouts[0].entries.find(x => x.id === PLANK)
    expect(e.sets[0].sec).toBe(45)
    expect(e.sets[0].r).toBeFalsy()
  })
})
