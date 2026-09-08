# Training-Max Cycles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an exercise be programmed as percentages of a training max over a repeating multi-week cycle, so 5/3/1 and its relatives work in openGym.

**Architecture:** A new `lib/cycles.js` holds the percentage tables and derives cycle position by counting past sessions that carried a cycle target — nothing is stored. `lib/progression.js` gains a `cycle` policy whose prescription is a *vector* of per-set rows rather than the scalar weight/reps every other policy returns; `applyPrescription` and `readSession` learn to handle that vector, additively, so no existing policy changes behaviour.

**Tech Stack:** React 19 + Vite, Zustand, Vitest. No new dependencies — openGym ships React, the router and Zustand and nothing else, and that is a hard constraint.

**Spec:** `docs/superpowers/specs/2026-09-08-training-max-cycles-design.md`

## Global Constraints

- **No new runtime dependencies.** Not for rounding, not for anything.
- **Pure logic lives in `frontend/src/lib/` with a `*.test.js` beside it.** Anything deciding what you lift next belongs there — this is a stated project rule in `CONTRIBUTING.md`.
- **Run tests with `npm test` from `frontend/`.** A single file: `npx vitest run src/lib/<file>.test.js`.
- **All 307 existing tests must keep passing, unchanged.** This is the check that the vector prescription was genuinely additive. If you find yourself editing an existing test to accommodate a change, stop — that means it was not additive.
- **Weights are stored and displayed to one decimal.** Never produce a weight with more precision than that; `snap()` in progression.js is the existing tool.
- **User-facing strings go through `t()`** from `lib/i18n.js`. English text is the key; missing translations fall back to it.
- **Comments explain why, not what.** Match the surrounding density.
- **Commit after every task.** Never add a Claude/Anthropic attribution trailer to a commit message.

---

### Task 1: The percentage tables

**Files:**
- Create: `frontend/src/lib/cycles.js`
- Test: `frontend/src/lib/cycles.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `CYCLES` (object keyed by table id), `CYCLE_KEYS: string[]`, `weeksOf(cyc): Row[][]`, `weekCount(cyc): number`, `rowsFor(cyc, week, tm, step): {w, r, amrap}[]`. A `Row` is the tuple `[pct, reps]` or `[pct, reps, 1]` where the third element marks an AMRAP set.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/cycles.test.js`:

```js
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
    expect(rows.map(r => r.w)).toEqual([92.5, 107.5, 122.5])
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/cycles.test.js`
Expected: FAIL — "Failed to resolve import './cycles.js'"

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/cycles.js`:

```js
// Percentage tables — what a training-max cycle actually prescribes.
//
// A table is weeks of rows, a row being [percent of training max, reps] with an optional
// third element marking the set taken as far as it goes. Data, not code: 5/3/1 is one entry
// here and nSuns or Madcow would be another, which is the whole reason this is a table
// rather than a policy per program.
//
// Nothing here knows about history or the store — see cyclePos for position, and
// progression.js for the training max, which needs readSession and would otherwise import
// in a circle.

export const CYCLES = {
  '531': {
    name: '5/3/1',
    desc: 'Four weeks of percentages off a training max, the last set of each taken as far as it goes.',
    weeks: [
      [[65, 5], [75, 5], [85, 5, 1]],
      [[70, 3], [80, 3], [90, 3, 1]],
      [[75, 5], [85, 3], [95, 1, 1]],
      [[40, 5], [50, 5], [60, 5]],
    ],
  },
  bbb: {
    name: 'Boring But Big',
    desc: 'Five sets of ten at a percentage that climbs across the cycle. Supplemental volume, not the main lift.',
    weeks: [
      [[50, 10], [50, 10], [50, 10], [50, 10], [50, 10]],
      [[60, 10], [60, 10], [60, 10], [60, 10], [60, 10]],
      [[70, 10], [70, 10], [70, 10], [70, 10], [70, 10]],
      [[50, 10], [50, 10], [50, 10], [50, 10], [50, 10]],
    ],
  },
}

export const CYCLE_KEYS = Object.keys(CYCLES)

const table = cyc => CYCLES[cyc] || CYCLES['531']
export const weeksOf = cyc => table(cyc).weeks
export const weekCount = cyc => table(cyc).weeks.length

// Snap to a multiple of the step the bar actually moves in. Rounding to one decimal on top
// because weights are stored and shown that way, and 1.25-kg steps otherwise read back as
// 92.3 when the plan said 92.25.
const snap = (v, step) => {
  const s = step > 0 ? step : 2.5
  return Math.max(s, Math.round(Math.round(v / s) * s * 10) / 10)
}

/** One week of a table as sets, against a training max. `week` wraps. */
export function rowsFor(cyc, week, tm, step) {
  const weeks = weeksOf(cyc)
  const wk = weeks[((week % weeks.length) + weeks.length) % weeks.length]
  return wk.map(([pct, r, amrap]) => ({ w: snap((tm || 0) * pct / 100, step), r, amrap: !!amrap }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/cycles.test.js`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cycles.js frontend/src/lib/cycles.test.js
git commit -m "Percentage tables, as data rather than a policy per program"
```

---

### Task 2: Where you are in the cycle

**Files:**
- Modify: `frontend/src/lib/cycles.js` (append)
- Modify: `frontend/src/lib/cycles.test.js` (append)

**Interfaces:**
- Consumes: `weekCount(cyc)` from Task 1.
- Produces: `cycleSessions(S, exId): {d, entry}[]` — past sessions of this exercise that were logged against a cycle target, oldest first. `cyclePos(S, exId, cyc): {n, cycle, week}` — `n` the count, `cycle` and `week` both zero-based.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/cycles.test.js`:

```js
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
    expect(cyclePos(S, '0025', '531').week).toBe(2)
    S.workouts = S.workouts.filter(w => w.d !== '2026-01-15')
    expect(cyclePos(S, '0025', '531').week).toBe(1)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/cycles.test.js`
Expected: FAIL — `cycleSessions is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `frontend/src/lib/cycles.js`:

```js
/**
 * Past sessions of one exercise that were logged against a cycle target, oldest first.
 *
 * `target.cyc` is the marker, which makes this self-anchoring: everything you lifted before
 * switching the exercise onto a cycle carries no such target and does not count, so there is
 * no "cycle start date" to store, migrate or get wrong.
 */
export function cycleSessions(S, exId) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (entry && entry.target && entry.target.cyc && (entry.sets || []).some(s => s.done)) {
      out.push({ d: w.d, entry })
    }
  })
  return out
}

/**
 * Which week of which cycle the next session of this exercise is, both zero-based.
 *
 * Derived rather than stored, like every other decision the engine makes. Delete a mislogged
 * workout and the position steps back on its own; two lifts drift apart only if you genuinely
 * trained one more often than the other, which is the right answer rather than a bug.
 */
export function cyclePos(S, exId, cyc) {
  const n = cycleSessions(S, exId).length
  const len = weekCount(cyc)
  return { n, cycle: Math.floor(n / len), week: n % len }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/cycles.test.js`
Expected: PASS, 18 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cycles.js frontend/src/lib/cycles.test.js
git commit -m "Derive cycle position from history, so there is nothing to repair"
```

---

### Task 3: A prescription that can differ per set

**Files:**
- Modify: `frontend/src/lib/progression.js:253-270` (`applyPrescription`)
- Test: `frontend/src/lib/progression.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `applyPrescription(sets, p)` additionally honours `p.rows: {w, r, amrap}[]`. Existing callers passing scalar prescriptions are unaffected.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/progression.test.js`:

```js
describe('applyPrescription with per-set rows', () => {
  const rows = [{ w: 65, r: 5, amrap: false }, { w: 75, r: 5, amrap: false }, { w: 85, r: 5, amrap: true }]

  it('gives each set its own weight instead of broadcasting one', () => {
    const sets = [{ w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }]
    const out = applyPrescription(sets, { kind: 'cycle', rows })
    expect(out.map(s => [s.w, s.r])).toEqual([[65, 5], [75, 5], [85, 5]])
  })

  it('grows the list to fit the week', () => {
    const out = applyPrescription([{ w: 0, r: 10, done: false }], { kind: 'cycle', rows })
    expect(out).toHaveLength(3)
    expect(out[2].w).toBe(85)
  })

  it('never touches a set already logged', () => {
    const sets = [{ w: 60, r: 6, done: true }, { w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }]
    const out = applyPrescription(sets, { kind: 'cycle', rows })
    expect(out[0]).toEqual({ w: 60, r: 6, done: true })
    expect(out[1].w).toBe(75)
  })

  it('never drops a set that has been logged, even past the end of the week', () => {
    // A shorter week must not take away work you already did.
    const sets = [
      { w: 65, r: 5, done: true }, { w: 75, r: 5, done: true },
      { w: 85, r: 8, done: true }, { w: 85, r: 6, done: true },
    ]
    const out = applyPrescription(sets, { kind: 'cycle', rows })
    expect(out).toHaveLength(4)
    expect(out[3]).toEqual({ w: 85, r: 6, done: true })
  })

  it('leaves the scalar policies exactly as they were', () => {
    const sets = [{ w: 0, r: 0, done: false }, { w: 0, r: 0, done: false }]
    const out = applyPrescription(sets, { kind: 'up', weight: 100, reps: 5 })
    expect(out).toEqual([{ w: 100, r: 5, done: false }, { w: 100, r: 5, done: false }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/progression.test.js`
Expected: FAIL — the first case returns `[[0,10],[0,10],[0,10]]`, because `p.weight` and `p.reps` are undefined and `rows` is ignored.

Note: `applyPrescription` is already imported at the top of `progression.test.js`. If it is not, add it to the existing import rather than writing a second import statement.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/lib/progression.js`, replace the body of `applyPrescription` (currently at line 253) with:

```js
export function applyPrescription(sets, p) {
  if (!p || p.kind === 'off' || p.kind === 'first') return sets
  // A cycle prescribes a different weight and rep target for each set — 65 × 5, 75 × 5,
  // 85 × 5+ — so it arrives as rows rather than as the one weight every other policy decides.
  if (p.rows) {
    const out = sets.map((s, i) => {
      const row = p.rows[i]
      if (s.done || !row) return s
      return { ...s, w: row.w, r: row.r }
    })
    // Only ever grows. A week shorter than what is already logged must not take away work
    // that was done, which is the same rule the set-count branch below follows.
    for (let i = out.length; i < p.rows.length; i++) {
      out.push({ w: p.rows[i].w, r: p.rows[i].r, done: false })
    }
    return out
  }
  const out = sets.map(s => {
    if (s.done) return s
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })
  // A policy that decided on a set count gets to grow the list — bodyweight progression adds
  // a set where a barbell would have added a plate. Only ever upwards, and only by copying a
  // row that is already there: a session in progress must not lose a set it has logged.
  if (p.sets > out.length) {
    const seed = out[out.length - 1]
    while (out.length < p.sets) out.push({ ...seed, done: false })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS. All previously existing tests still pass — this is the check that the change was additive.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/progression.js frontend/src/lib/progression.test.js
git commit -m "A prescription that can differ per set"
```

---

### Task 4: Judging a session against per-set targets

**Files:**
- Modify: `frontend/src/lib/progression.js:101-130` (`readSession`)
- Test: `frontend/src/lib/progression.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `readSession(entry, fallback)` additionally honours `entry.target.rows`. Return shape is unchanged: `{mode, goal, reps, weight, count, low, amrap, ok}`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/progression.test.js`:

```js
describe('readSession against per-set targets', () => {
  const target = {
    id: '0025', cyc: '531',
    rows: [{ w: 65, r: 5, amrap: false }, { w: 75, r: 5, amrap: false }, { w: 85, r: 5, amrap: true }],
  }
  const entry = reps => ({ id: '0025', target, sets: reps.map((r, i) => ({ w: target.rows[i].w, r, done: true })) })

  it('passes when every set met its own target', () => {
    expect(readSession(entry([5, 5, 5])).ok).toBe(true)
  })

  it('passes when the last set went past its target, which is the point of it', () => {
    const r = readSession(entry([5, 5, 9]))
    expect(r.ok).toBe(true)
    expect(r.amrap).toBe(9)
  })

  it('fails when the AMRAP set fell short of its minimum', () => {
    expect(readSession(entry([5, 5, 3])).ok).toBe(false)
  })

  it('fails when an ordinary set fell short, however good the last one was', () => {
    // A missed 75 × 5 is a missed session even if the top set flew — the load was wrong.
    expect(readSession(entry([5, 3, 9])).ok).toBe(false)
  })

  it('fails when the session was cut short of the sets it asked for', () => {
    const e = { id: '0025', target, sets: [{ w: 65, r: 5, done: true }, { w: 75, r: 5, done: true }] }
    expect(readSession(e).ok).toBe(false)
  })

  it('reports the heaviest weight and the lowest rep count, as it always did', () => {
    const r = readSession(entry([5, 4, 6]))
    expect(r.weight).toBe(85)
    expect(r.low).toBe(4)
    expect(r.count).toBe(3)
  })

  it('still ignores a warm-up', () => {
    const e = {
      id: '0025', target,
      sets: [{ w: 40, r: 5, done: true, wu: true },
        ...[5, 5, 5].map((r, i) => ({ w: target.rows[i].w, r, done: true }))],
    }
    expect(readSession(e).ok).toBe(true)
  })

  it('leaves a session with no rows judged exactly as before', () => {
    const e = { id: '0025', target: { id: '0025', sets: 3, reps: 5 }, sets: [
      { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }
    expect(readSession(e).ok).toBe(true)
    expect(readSession(e).goal).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/progression.test.js`
Expected: FAIL — "passes when every set met its own target" gets `ok: false`, because `target.reps` is undefined so `goal` is 0 and `ok` requires `goal > 0`.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/lib/progression.js`, inside `readSession`, immediately after the existing warm-up filter line (`const sets = ((entry && entry.sets) || []).filter(...)`) and **before** `const planned = target.sets || sets.length`, insert:

```js
  // A cycle prescribes each set separately, so the session is judged set by set: every
  // ordinary set has to meet its own target, and the last one only has to reach its minimum
  // — going past it is what that set is for.
  if (target.rows) {
    const rows = target.rows
    const reps = sets.map(s => (s.done ? (s.r || 0) : 0))
    const met = rows.every((row, i) => reps[i] >= row.r)
    return {
      mode, goal: rows[rows.length - 1].r, reps,
      weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
      count: reps.length,
      low: reps.length ? Math.min(...reps) : 0,
      amrap: reps.length ? reps[reps.length - 1] : 0,
      ok: reps.length >= rows.length && met,
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS. All previously existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/progression.js frontend/src/lib/progression.test.js
git commit -m "Judge a cycle session set by set"
```

---

### Task 5: The training max, derived

**Files:**
- Modify: `frontend/src/lib/progression.js` (append `tmFor`; add the `cycles.js` import)
- Test: `frontend/src/lib/progression.test.js` (append)

**Interfaces:**
- Consumes: `cycleSessions`, `weekCount` from Task 1/2; `readSession` from Task 4; the module-private `snap(v, step)` already in progression.js.
- Produces: `tmFor(S, cfg): number` — the training max for the cycle the exercise is about to start.

`tmFor` lives in progression.js rather than cycles.js on purpose: it needs `readSession`, and cycles.js importing progression.js would be a circular import.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/progression.test.js`:

```js
describe('the training max', () => {
  const rows = [{ w: 65, r: 5, amrap: false }, { w: 75, r: 5, amrap: false }, { w: 85, r: 5, amrap: true }]
  const cfg = { id: '0025', prog: 'cycle', cyc: '531', tm: 100, tmStep: 2.5 }
  // One finished cycle session. `hit` false makes the top set fall short of its minimum.
  const s = (d, hit = true) => ({
    d,
    entries: [{ id: '0025', target: { id: '0025', cyc: '531', rows },
      sets: [{ w: 65, r: 5, done: true }, { w: 75, r: 5, done: true }, { w: 85, r: hit ? 5 : 2, done: true }] }],
  })
  const S = (...ws) => ({ unit: 'kg', workouts: ws })

  it('starts at the base you set', () => {
    expect(tmFor(S(), cfg)).toBe(100)
  })

  it('does not move part way through a cycle', () => {
    expect(tmFor(S(s('1'), s('2'), s('3')), cfg)).toBe(100)
  })

  it('goes up one step for a cycle you completed', () => {
    expect(tmFor(S(s('1'), s('2'), s('3'), s('4')), cfg)).toBe(102.5)
  })

  it('keeps going up, cycle after cycle', () => {
    const eight = ['1', '2', '3', '4', '5', '6', '7', '8'].map(d => s(d))
    expect(tmFor(S(...eight), cfg)).toBe(105)
  })

  it('drops to 90 % after a cycle whose top set fell short', () => {
    // What 5/3/1 says to do, and it is what the engine already does on a stall elsewhere.
    expect(tmFor(S(s('1'), s('2'), s('3', false), s('4')), cfg)).toBe(90)
  })

  it('snaps the reset to something loadable rather than to a fraction', () => {
    expect(tmFor(S(s('1'), s('2'), s('3', false), s('4')), { ...cfg, tm: 142.5 })).toBe(127.5)
  })

  it('recovers upward from a reset once a cycle goes clean', () => {
    const eight = ['1', '2', '3', '4', '5', '6', '7', '8'].map((d, i) => s(d, i !== 2))
    expect(tmFor(S(...eight), cfg)).toBe(92.5)
  })

  it('never goes below a single step', () => {
    expect(tmFor(S(s('1'), s('2'), s('3', false), s('4')), { ...cfg, tm: 2.5 })).toBe(2.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/progression.test.js`
Expected: FAIL — `tmFor is not defined`. Add `tmFor` to the existing import from `./progression.js` at the top of the test file.

- [ ] **Step 3: Write minimal implementation**

At the top of `frontend/src/lib/progression.js`, extend the imports:

```js
import { cycleSessions, weekCount, rowsFor, CYCLES } from './cycles.js'
```

Append to `frontend/src/lib/progression.js`:

```js
/**
 * The training max for the cycle this exercise is about to start.
 *
 * Derived like everything else: the base you set, then one step for every cycle you finished
 * clean. A cycle whose sets fell short does not advance it — it resets to 90 %, which is what
 * 5/3/1 says to do and the same back-off the linear policies take on a stall.
 *
 * Only whole cycles count. Part way through, the training max is whatever it was when the
 * cycle started, so the percentages you are working to do not move under you mid-cycle.
 */
export function tmFor(S, cfg) {
  const step = cfg.tmStep > 0 ? cfg.tmStep : defaultIncrement(cfg.id, (S && S.unit) || 'kg')
  const len = weekCount(cfg.cyc)
  const sessions = cycleSessions(S, cfg.id)
  let tm = cfg.tm > 0 ? cfg.tm : 0
  for (let i = 0; i + len <= sessions.length; i += len) {
    const clean = sessions.slice(i, i + len).every(x => readSession(x.entry, cfg).ok)
    tm = clean ? snap(tm + step, step) : Math.max(step, snap(tm * DELOAD_FACTOR, step))
  }
  return tm
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/progression.js frontend/src/lib/progression.test.js
git commit -m "Derive the training max from the cycles you finished"
```

---

### Task 6: The cycle policy

**Files:**
- Modify: `frontend/src/lib/progression.js:25-45` (`POLICIES_FOR`, `POLICY_NAME`, `POLICY_DESC`, `DELOAD_AFTER`)
- Modify: `frontend/src/lib/progression.js:158+` (`nextPrescription`)
- Test: `frontend/src/lib/progression.test.js` (append)

**Interfaces:**
- Consumes: `cyclePos`, `rowsFor`, `CYCLES` from Task 1/2; `tmFor` from Task 5.
- Produces: `nextPrescription` returns `{policy: 'cycle', kind: 'cycle', rows, tm, cycle, week, why}` when the policy is `cycle`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/progression.test.js`:

```js
describe('the cycle policy', () => {
  const cfg = { id: '0025', sets: 3, reps: 5, weight: 0, prog: 'cycle', cyc: '531', tm: 100, tmStep: 2.5 }

  it('is offered for rep work and nothing else', () => {
    expect(POLICIES_FOR.reps).toContain('cycle')
    expect(POLICIES_FOR.time).not.toContain('cycle')
    expect(POLICIES_FOR.cardio).not.toContain('cycle')
    expect(POLICY_NAME.cycle).toBeTruthy()
    expect(POLICY_DESC.cycle).toBeTruthy()
  })

  it('prescribes week one on the very first session, rather than calling it a baseline', () => {
    // Every other policy has nothing to say until you have lifted once. A cycle knows exactly
    // what week one is before you start, and refusing to say so would be the wrong answer.
    const p = nextPrescription({ unit: 'kg', workouts: [] }, { ...cfg }, null)
    expect(p.kind).toBe('cycle')
    expect(p.week).toBe(0)
    expect(p.cycle).toBe(0)
    expect(p.tm).toBe(100)
    expect(p.rows.map(r => [r.w, r.r])).toEqual([[65, 5], [75, 5], [85, 5]])
    expect(p.rows[2].amrap).toBe(true)
  })

  it('moves to the next week once a session is logged against it', () => {
    const S = { unit: 'kg', workouts: [{
      d: '2026-01-01',
      entries: [{ id: '0025', target: { id: '0025', cyc: '531', rows: [{ w: 85, r: 5, amrap: true }] },
        sets: [{ w: 85, r: 6, done: true }] }],
    }] }
    const p = nextPrescription(S, { ...cfg }, null)
    expect(p.week).toBe(1)
    expect(p.rows.map(r => r.r)).toEqual([3, 3, 3])
  })

  it('says which cycle and week it is, so the number can be explained', () => {
    const p = nextPrescription({ unit: 'kg', workouts: [] }, { ...cfg }, null)
    expect(Array.isArray(p.why)).toBe(true)
    expect(p.why.join(' ')).toContain('{0}')
  })

  it('is not offered a policy the mode cannot take', () => {
    expect(policyFor({ id: '0025', prog: 'cycle', mode: 'time' }, null, 'time')).toBe('off')
  })

  it('leaves the other policies alone', () => {
    const S = { unit: 'kg', workouts: [{
      d: '2026-01-01',
      entries: [{ id: '0025', target: { id: '0025', sets: 3, reps: 5 },
        sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }],
    }] }
    const p = nextPrescription(S, { id: '0025', sets: 3, reps: 5, weight: 100, prog: 'linear' }, null)
    expect(p.kind).toBe('up')
    expect(p.rows).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/progression.test.js`
Expected: FAIL — `POLICIES_FOR.reps` does not contain `cycle`. Add `POLICIES_FOR`, `POLICY_NAME`, `POLICY_DESC`, `policyFor` and `nextPrescription` to the existing import in the test file if any are missing.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/lib/progression.js`:

Add `'cycle'` to the reps list and to `POLICIES`:

```js
export const POLICIES = ['off', 'linear', 'greyskull', 'double', 'cycle', 'time']

export const POLICIES_FOR = {
  reps: ['off', 'linear', 'greyskull', 'double', 'cycle'],
  time: ['off', 'time'],
  cardio: ['off']
}
```

Add the two strings:

```js
// in POLICY_NAME
  cycle: 'Training-max cycle',
// in POLICY_DESC
  cycle: 'Percentages of a training max over a repeating four-week cycle, the last set of each taken as far as it goes. Finish a cycle clean and the training max goes up; fall short and it resets 10 %.',
```

Add a deload threshold so the map stays complete (the cycle handles its own back-off in `tmFor`, so this is only there to keep `DELOAD_AFTER[policy]` from falling through to its default):

```js
export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 3, cycle: 1, time: 3 }
```

In `nextPrescription`, insert this **immediately after** the existing `if (policy === 'off') return { policy, kind: 'off' }` line and **before** the `const sessions = ...` / `if (!last)` lines:

```js
  // Ahead of the "nothing logged yet" branch on purpose: a cycle knows what week one is
  // before you have lifted anything, and answering "this session sets the baseline" would be
  // both unhelpful and untrue.
  if (policy === 'cycle') {
    const { cycle, week } = cyclePos(S, cfg.id, cfg.cyc)
    const tm = tmFor(S, cfg)
    const rows = rowsFor(cfg.cyc, week, tm, inc)
    const name = (CYCLES[cfg.cyc] || CYCLES['531']).name
    return {
      policy, kind: 'cycle', rows, tm, cycle, week,
      why: ['{0} · cycle {1}, week {2} — {3} % to {4} % of a {5} {6} training max',
        name, cycle + 1, week + 1, rows[0].w > 0 ? Math.round(rows[0].w / tm * 100) : 0,
        Math.round(rows[rows.length - 1].w / tm * 100), fmtTm(tm), unit],
    }
  }
```

Add the small helper next to `snap` (the `why` args must be plain values the translator can interpolate):

```js
const fmtTm = v => Math.round(v * 10) / 10
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS. All previously existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/progression.js frontend/src/lib/progression.test.js
git commit -m "The cycle policy: percentages off a training max"
```

---

### Task 7: Record what was prescribed

**Files:**
- Modify: `frontend/src/sheets.jsx:1082` (the entry builder)
- Modify: `frontend/src/views/Workout.jsx:248` and `:357` (swap and add-exercise builders)
- Test: `frontend/src/lib/progression.test.js` (append)

**Interfaces:**
- Consumes: `nextPrescription` from Task 6.
- Produces: a finished entry whose `target` carries `rows` and `cyc`, which is what `cycleSessions` counts and what `readSession` judges against.

This is the task that closes the loop: without it the rows are prescribed but never recorded, so position never advances and every session reads as week one.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/progression.test.js`:

```js
describe('a prescribed cycle session, recorded and read back', () => {
  const cfg = { id: '0025', sets: 3, reps: 5, weight: 0, prog: 'cycle', cyc: '531', tm: 100, tmStep: 2.5 }

  // What the entry builders in sheets.jsx and Workout.jsx must produce. Kept here as a test
  // so the shape is pinned by something that runs, not only by the two call sites.
  const buildEntry = (S, c) => {
    const plan = nextPrescription(S, c, null)
    return {
      id: c.id,
      target: { ...c, ...(plan.rows ? { rows: plan.rows } : {}) },
      plan,
      sets: applyPrescription([{ w: 0, r: 0, done: false }], plan),
    }
  }

  it('records the rows it was given, so the session can be judged against them', () => {
    const e = buildEntry({ unit: 'kg', workouts: [] }, cfg)
    expect(e.target.cyc).toBe('531')
    expect(e.target.rows).toHaveLength(3)
    expect(e.sets.map(s => s.w)).toEqual([65, 75, 85])
  })

  it('counts toward the position once it is logged, and only then', () => {
    const S = { unit: 'kg', workouts: [] }
    const e = buildEntry(S, cfg)
    expect(cyclePos(S, '0025', '531').week).toBe(0)
    e.sets = e.sets.map((s, i) => ({ ...s, r: e.target.rows[i].r, done: true }))
    S.workouts.push({ d: '2026-01-01', entries: [e] })
    expect(cyclePos(S, '0025', '531').week).toBe(1)
  })

  it('reads back as the session it actually was', () => {
    const S = { unit: 'kg', workouts: [] }
    const e = buildEntry(S, cfg)
    e.sets = e.sets.map((s, i) => ({ ...s, r: e.target.rows[i].r, done: true }))
    expect(readSession(e, cfg).ok).toBe(true)
  })

  it('adds nothing to the target for a policy that has no rows', () => {
    const e = buildEntry({ unit: 'kg', workouts: [] }, { id: '0025', sets: 3, reps: 5, weight: 60, prog: 'linear' })
    expect(e.target.rows).toBeUndefined()
  })
})
```

Add `cyclePos` to the test file's imports from `./cycles.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/progression.test.js`
Expected: PASS for this block — it tests a local helper. Its purpose is to pin the shape the two call sites must produce. Now make the app match it.

- [ ] **Step 3: Update the three entry builders**

In `frontend/src/sheets.jsx`, find the entry builder around line 1082:

```js
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets: applyPrescription(buildSets(st, cfg), plan) }
```

Replace with:

```js
    // The rows travel into the target because they are what the session was asked to do:
    // cycle position counts targets carrying `cyc`, and readSession judges each set against
    // its own row. Prescribed but not recorded would mean every session read as week one.
    return {
      id: cfg.id, sg: cfg.sg,
      target: { ...cfg, ...(plan.rows ? { rows: plan.rows } : {}) },
      plan, sets: applyPrescription(buildSets(st, cfg), plan),
    }
```

In `frontend/src/views/Workout.jsx` line 248:

```js
      s.active.entries[idx] = { id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan), ...(old.sg ? { sg: old.sg } : {}) }
```

Replace `target: { ...cfg }` with `target: { ...cfg, ...(plan.rows ? { rows: plan.rows } : {}) }`.

In `frontend/src/views/Workout.jsx` line 357:

```js
      s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan) })
```

Replace `target: { ...cfg }` with `target: { ...cfg, ...(plan.rows ? { rows: plan.rows } : {}) }`.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test && npx vite build`
Expected: tests PASS, build succeeds.

Then check by hand that no builder was missed:

```bash
grep -rn "target: { \.\.\.cfg" frontend/src/
```

Expected: every hit also carries the `plan.rows` spread.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sheets.jsx frontend/src/views/Workout.jsx frontend/src/lib/progression.test.js
git commit -m "Record the rows a cycle session was prescribed"
```

---

### Task 8: Configuring it, and reading it in the gym

**Files:**
- Modify: `frontend/src/sheets.jsx:612-633` (`ProgressionFields`)
- Modify: `frontend/src/views/Workout.jsx` (the rep column header / AMRAP marker)

**Interfaces:**
- Consumes: `CYCLES`, `CYCLE_KEYS` from Task 1; `best1RM` from `lib/onerm.js`; `tmFor` from Task 5.
- Produces: nothing other tasks depend on. This is the last task.

- [ ] **Step 1: Add the cycle fields to the exercise config**

In `frontend/src/sheets.jsx`, add to the imports:

```js
import { CYCLES, CYCLE_KEYS } from './lib/cycles.js'
```

`best1RM` is already imported from `./lib/onerm.js`; if not, add it to that existing import.

In `ProgressionFields`, replace the block that currently renders the step stepper:

```js
    {active !== 'off' && <div className="row cfgrow" style={{ marginBottom: 18 }}>
      <Stepper label={mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit)} value={inc}
        step={mode === 'time' ? 5 : 1.25} decimal={mode !== 'time'} onChange={v => setC(x => ({ ...x, inc: v }))} />
      {active === 'double' && <Stepper label={t('Reps from')} value={c.repsMin || Math.max(1, (c.reps || 10) - 2)}
        step={1} decimal={false} onChange={v => setC(x => ({ ...x, repsMin: v }))} />}
    </div>}
```

with:

```js
    {active !== 'off' && <div className="row cfgrow" style={{ marginBottom: active === 'cycle' ? 8 : 18 }}>
      <Stepper label={mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit)} value={inc}
        step={mode === 'time' ? 5 : 1.25} decimal={mode !== 'time'} onChange={v => setC(x => ({ ...x, inc: v }))} />
      {active === 'double' && <Stepper label={t('Reps from')} value={c.repsMin || Math.max(1, (c.reps || 10) - 2)}
        step={1} decimal={false} onChange={v => setC(x => ({ ...x, repsMin: v }))} />}
    </div>}
    {active === 'cycle' && <>
      <div className="sect-b" style={{ marginBottom: 8 }}>
        <SelectRow title={t('Cycle')} sheetTitle={t('Cycle')} value={c.cyc || '531'}
          onChange={v => setC(x => ({ ...x, cyc: v }))}
          options={CYCLE_KEYS.map(k => ({ value: k, label: CYCLES[k].name }))} />
      </div>
      <div className="small dim" style={{ marginBottom: 10 }}>{t(CYCLES[c.cyc || '531'].desc)}</div>
      <div className="row cfgrow" style={{ marginBottom: 8 }}>
        {/* Prefilled at 90 % of the best estimate the history holds, because that is where
            5/3/1 says to start — and left editable, because the number people actually run
            it on is a judgement rather than a measurement. */}
        <Stepper label={t('Training max ({0})', unit)} value={c.tm || tmSuggestion}
          step={2.5} onChange={v => setC(x => ({ ...x, tm: v }))} />
        <Stepper label={t('Cycle step ({0})', unit)} value={c.tmStep || defaultIncrement(ex.id, unit)}
          step={1.25} onChange={v => setC(x => ({ ...x, tmStep: v }))} />
      </div>
      <div className="small dim" style={{ marginBottom: 18 }}>
        {t('The training max goes up by the cycle step each time you finish a cycle clean.')}
      </div>
    </>}
```

Add the suggestion above the `return` in `ProgressionFields`:

```js
  // 90 % of the best estimate the history holds — 5/3/1's own starting point. Snapped to the
  // step so the first suggestion is already a loadable number.
  const best = best1RM(S(), ex.id)
  const tmSuggestion = best && best.est > 0
    ? Math.max(inc, Math.round(best.est * 0.9 / inc) * inc)
    : Math.max(inc, (c.weight || 0))
```

`best1RM` returns `{ est, w, r, d, t }` or `null` — the estimate is `est` (see `onerm.js:71`).

- [ ] **Step 2: Verify the config sheet by hand**

```bash
cd /run/media/shreyas/A68A74338A7401DB/CODEING/PROJECTS/openGym && DEV_WEB_PORT=5199 VITE_DEMO=1 ./start.sh
```

Open `http://localhost:5199`, go to Plan → a routine → an exercise → Progression → pick "Training-max cycle". Confirm the cycle picker, the training-max stepper (prefilled, not zero) and the step stepper all appear, and that switching back to another rule hides them.

- [ ] **Step 3: Mark the AMRAP set in the workout**

In `frontend/src/views/Workout.jsx`, the reps column is built as:

```js
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps') }
```

The set-number badge added for warm-ups is already the row's label, so the marker goes there
rather than into a new element fighting the row layout. Find the `setNums` computation:

```js
  // Warm-ups are lettered, working sets numbered from one.
  let n = 0
  const setNums = entry.sets.map(s => (s.wu ? 'W' : String(++n)))
```

and replace it with:

```js
  // Warm-ups are lettered, working sets numbered from one. A cycle's last set is taken as far
  // as it goes, and the plus is the whole instruction — without it the row reads as a cap.
  const rows = (entry.target && entry.target.rows) || null
  let n = 0
  const setNums = entry.sets.map((s, i) => {
    if (s.wu) return 'W'
    const num = String(++n)
    return rows && rows[i] && rows[i].amrap ? num + '+' : num
  })
```

The badge is 24 px wide with a 12 px font, so "3+" fits without changing the CSS.

- [ ] **Step 4: Verify the whole flow by hand**

With the dev server still running:
1. Put an exercise on the cycle with a training max of 100.
2. Start the workout. Confirm three sets at 65 / 75 / 85 with reps 5 / 5 / 5, and the plan line reading "5/3/1 · cycle 1, week 1 — …".
3. Log all three and finish.
4. Start it again. Confirm week 2: 70 / 80 / 90 at 3 / 3 / 3.
5. Open Stats → the workout in Recent workouts. Confirm the three different weights are listed.

- [ ] **Step 5: Run the whole suite and build**

Run: `cd frontend && npm test && npx vite build`
Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/sheets.jsx frontend/src/views/Workout.jsx
git commit -m "Configure a cycle, and read it at the rack"
```

---

## Done when

- An exercise can be put on `531` or `bbb` with a training max, from the exercise config sheet.
- Starting that workout prescribes the right week's percentages, on the first session and every session after.
- Logging it advances the position; deleting the workout puts it back.
- Finishing four weeks clean raises the training max by the step; falling short resets it to 90 %.
- All 307 pre-existing tests still pass, unedited.

## Deliberately not in this plan

Custom table authoring, Jokers and First Set Last, per-week accessory prescriptions, and adding cycle-based programs to `lib/programs.js`. Those come once this is proven on one lift.
