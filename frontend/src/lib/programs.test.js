import { describe, it, expect } from 'vitest'
import { PROGRAMS, programBundle, daysOf } from './programs.js'
import { EXIDX, isBodyweightEq } from './exercises.js'
import { MUSCLE_NAME, loadOfRoutine, TARGETED } from './muscles.js'
import { POLICIES_FOR } from './progression.js'
import { mergePlan } from './plan-share.js'

const bundles = (unit = 'kg') => PROGRAMS.map(p => [p, programBundle(p, unit)])

// The muscles every serious week is expected to train — the same ones the weekly set target
// speaks for. Deliberately not all eighteen: the starter plan reaches the last few (serratus,
// shins, hip flexors) because it has three days to fill and does it on purpose. A faithful
// PHUL or Arnold week does not, and padding one out to pass a test would mean shipping a plan
// under a name it doesn't follow. The starter's own full-coverage assertion is in
// starter.test.js.
const MAJOR = TARGETED

const weekLoad = bundle => {
  const load = {}
  // A routine trained twice a week counts twice — Arnold's week is the reason.
  Object.values(bundle.week).forEach(id => {
    const l = loadOfRoutine(bundle.routines.find(r => r.id === id))
    for (const m in l) load[m] = (load[m] || 0) + l[m]
  })
  return load
}

describe('the program library', () => {
  it('names exercises the library actually has', () => {
    bundles().forEach(([p, b]) =>
      b.routines.forEach(r => r.ex.forEach(e =>
        expect(EXIDX[e.id], `${p.key} · ${r.name} · ${e.id}`).toBeTruthy())))
  })

  it('schedules every day onto a routine it ships', () => {
    bundles().forEach(([p, b]) => {
      const ids = b.routines.map(r => r.id)
      Object.entries(b.week).forEach(([day, id]) =>
        expect(ids, `${p.key} day ${day}`).toContain(id))
      expect(b.scheduledDays, p.key).toBe(daysOf(p))
    })
  })

  it('uses every routine it ships', () => {
    // A routine no day points at would be imported, sit in the plan unscheduled, and read as
    // the program having a day the user forgot to do.
    bundles().forEach(([p, b]) => {
      const used = new Set(Object.values(b.week))
      expect(b.routines.filter(r => !used.has(r.id)).map(r => r.name), p.key).toEqual([])
    })
  })

  it('never repeats an exercise inside one day', () => {
    bundles().forEach(([p, b]) => b.routines.forEach(r => {
      const ids = r.ex.map(e => e.id)
      expect(ids.length, `${p.key} · ${r.name}`).toBe(new Set(ids).size)
    }))
  })

  it('only asks for progression rules the engine has', () => {
    // A routine may declare none — policyFor then falls back to linear, which is what the
    // starter plan has always done.
    bundles().forEach(([p, b]) => b.routines.filter(r => r.prog).forEach(r =>
      expect(POLICIES_FOR.reps, `${p.key} · ${r.name}`).toContain(r.prog)))
  })

  it('gives double progression a range to work up through', () => {
    // Without a bottom the engine invents one at top − 2, which turns a 12-rep hypertrophy
    // set into a 10-12 range nobody asked for.
    bundles().forEach(([p, b]) => b.routines.filter(r => r.prog === 'double').forEach(r =>
      r.ex.filter(e => !isBodyweightEq(e.id)).forEach(e => {
        expect(e.repsMin, `${p.key} · ${r.name} · ${e.id}`).toBeGreaterThan(0)
        expect(e.repsMin, `${p.key} · ${r.name} · ${e.id}`).toBeLessThan(e.reps)
      })))
  })

  it('trains every major muscle, every week', () => {
    bundles().forEach(([p, b]) => {
      const load = weekLoad(b)
      const blank = MAJOR.filter(m => !load[m]).map(m => MUSCLE_NAME[m])
      expect(blank, p.key).toEqual([])
    })
  })

  it('leaves bodyweight work without a load step', () => {
    bundles().forEach(([p, b]) => b.routines.flatMap(r => r.ex)
      .filter(e => isBodyweightEq(e.id))
      .forEach(e => expect(e.inc, `${p.key} · ${e.id}`).toBeUndefined()))
  })

  it('doubles every step for a profile in pounds', () => {
    const kg = bundles('kg').flatMap(([, b]) => b.routines.flatMap(r => r.ex))
    const lb = bundles('lb').flatMap(([, b]) => b.routines.flatMap(r => r.ex))
    kg.forEach((e, i) => expect(lb[i].inc ?? null, e.id).toBe(e.inc ? e.inc * 2 : null))
  })

  it('keeps each day to a sane length', () => {
    bundles().forEach(([p, b]) => b.routines.forEach(r => {
      expect(r.ex.length, `${p.key} · ${r.name}`).toBeLessThanOrEqual(8)
      expect(r.ex.reduce((n, e) => n + e.sets, 0), `${p.key} · ${r.name}`).toBeLessThanOrEqual(30)
    }))
  })

  it('keeps per-side work on an even rep target', () => {
    // An odd total can't be split down the middle, so one side would be asked for a rep the
    // other never gets.
    bundles().forEach(([p, b]) => b.routines.flatMap(r => r.ex).filter(e => e.side)
      .forEach(e => expect(e.reps % 2, `${p.key} · ${e.id}`).toBe(0)))
  })

  it('imports into a plan through the same merge a shared file uses', () => {
    // The seam the whole library rests on: routine ids here are library keys, and mergePlan
    // has to swap them for fresh uids AND re-point the week at the new ones. A week left
    // holding the old keys would import every routine and schedule none of them.
    bundles().forEach(([p, b]) => {
      const s = { routines: [], week: {}, customEx: [] }
      mergePlan(s, b, { schedule: true })
      expect(s.routines.length, p.key).toBe(b.routineCount)
      expect(Object.keys(s.week).length, p.key).toBe(daysOf(p))
      const ids = s.routines.map(r => r.id)
      Object.entries(s.week).forEach(([day, id]) => {
        expect(ids, `${p.key} day ${day}`).toContain(id)
        expect(b.routines.map(r => r.id), `${p.key} day ${day} kept a library key`).not.toContain(id)
      })
      // The progression rule has to survive the trip; without it a Greyskull or double
      // progression routine arrives as a plain list of weights.
      s.routines.forEach((r, i) => expect(r.prog, `${p.key} · ${r.name}`).toBe(b.routines[i].prog))
    })
  })

  it('adds a program to a plan that already has routines without touching them', () => {
    const mine = { id: 'mine', name: 'My routine', ex: [{ id: '0025', sets: 3, reps: 10 }] }
    const s = { routines: [mine], week: { 1: 'mine' }, customEx: [] }
    const b = programBundle(PROGRAMS[1])
    mergePlan(s, b, { schedule: false })
    expect(s.routines[0]).toBe(mine)
    expect(s.week[1]).toBe('mine')      // schedule off leaves the week alone
    expect(s.routines.length).toBe(1 + b.routineCount)
  })
})
