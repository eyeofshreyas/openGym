# Percentage / training-max cycles

Phase 5 of `docs/ROADMAP-features.md`. Unblocks 5/3/1, nSuns, Madcow and the four programs
deliberately left out of `lib/programs.js`.

## Why this is not another entry in POLICIES_FOR

`applyPrescription` (progression.js:253) writes `p.weight` and `p.reps` to *every* unlogged set.
Every policy the engine has decides one weight and one rep target for the whole exercise.

A 5/3/1 session is 65 % × 5, 75 % × 5, 85 % × 5+ — three weights, three rep targets, one of
them an AMRAP. The prescription has to become a vector, and that pulls on `readSession` (it
judges every set against a single `target.reps`), on `entry.target` (which is what history is
read back through), and on `buildSets`.

That is the whole of the difficulty. The percentages themselves are arithmetic.

## Decisions taken

**A percentage table is the primitive; 5/3/1 is a preset.** An exercise carries a training max;
a table says what each week's sets are as a percentage of it. nSuns and Madcow then become data
rather than code.

**Cycle position is derived, never stored.** The engine stores nothing today — every policy
reads history back and decides from it — and that property is worth keeping. Position is the
count of this exercise's past sessions whose recorded target carried a cycle week:

    n = sessions logged against a cycle target
    week  = n mod weeks.length
    cycle = n div weeks.length

It is self-anchoring: history from before you switched to 5/3/1 has no cycle target, so it does
not count. It self-heals: delete a mislogged workout and the position steps back on its own.
Two lifts drift apart only if you genuinely trained one more often than the other, which is the
right answer rather than a bug.

**Per lift, not per routine.** `policyFor` already resolves exercise-over-routine, and a 5/3/1
day is one main lift on the cycle plus accessories on double progression.

**The training max is derived too.** Base TM plus one step per *successfully completed* cycle,
where success is the week-3 top set meeting its prescribed reps. A cycle whose top set missed
does not advance the TM, and the cycle after a miss runs at 90 % of the TM that failed — which
is what 5/3/1 says to do, and mirrors the deload the engine already performs.

**Built-in tables only in v1.** `531` and `bbb`. Authoring your own table is a later phase; it
needs an editor and a validation story that this does not.

## Data

Exercise config, alongside the existing `prog`/`inc`/`repsMin`/`repsMax`:

```js
{ id, sets, reps, weight, prog: 'cycle', cyc: '531', tm: 140, tmStep: 5 }
```

`tm` is the base training max — prefilled at 90 % of `best1RM` (onerm.js already computes it)
and editable, because the number people run 5/3/1 on is a judgement, not a measurement.
`tmStep` defaults to `defaultIncrement`, which already knows upper from lower.

New module `lib/cycles.js`:

```js
export const CYCLES = {
  '531': { name: '5/3/1', weeks: [
    [[65,5],[75,5],[85,5,'amrap']],
    [[70,3],[80,3],[90,3,'amrap']],
    [[75,5],[85,3],[95,1,'amrap']],
    [[40,5],[50,5],[60,5]],            // deload
  ]},
  'bbb': { name: 'Boring But Big', weeks: [ /* 5x10 at 50/60/70/50 % */ ] },
}
```

## The prescription becomes a vector

`nextPrescription` gains an optional `rows: [{ w, r, amrap }]`. Existing policies never set it,
so their return shape, their call sites and their tests are untouched — this is additive.

`applyPrescription`: when `rows` is present, apply row *i* to set *i* rather than broadcasting
scalars. It must never overwrite a set already logged, and never shrink the list below what has
been logged — the same rule it follows today for `p.sets`.

`entry.target` gains the same `rows`, so a finished session is read back as it was prescribed.
This is what makes the position count work at all: `target.cyc` is the marker that says "this
was a cycle session".

`readSession`: when `target.rows` is present, judge each set against its own row. `ok` is every
non-AMRAP set meeting its row's reps and the AMRAP set meeting its minimum. `amrap` stays what
it already is — the reps on the last set — which Greyskull also reads.

## UI

- **Exercise config** (`ProgressionFields` in sheets.jsx): `cycle` joins the policy list for
  reps mode. Choosing it reveals a table picker, a TM stepper prefilled from `best1RM × 0.9`,
  and the TM step.
- **Workout**: the rows arrive with different weights, which the set rows already render — each
  set carries its own `w`. The AMRAP set shows `5+` rather than `5`. The existing plan line
  carries the why: "5/3/1 · cycle 2, week 3 — top set 95 % × 1+".
- **Nothing new on Plan or Stats.**

## Tests

- Tables are well formed: percentages in range, every week non-empty, exactly one AMRAP per week
  where the table declares one.
- Position: pre-cycle history does not count; position after *n* sessions; deleting a session
  steps it back.
- TM: advances one step per successful cycle; a missed top set holds it; the cycle after a miss
  runs at 90 %.
- `applyPrescription` with rows: applies per set, never overwrites a logged set, never shrinks
  below what is logged.
- `readSession` with rows: `ok` only when every set meets its own target; a missed AMRAP fails
  the session; a missed non-AMRAP set fails it too.
- Every existing progression test still passes unchanged — that is the check that says this
  really was additive.

## Files

New `lib/cycles.js`, `lib/cycles.test.js`. Changed: `lib/progression.js` (policy, prescription,
readSession), `sheets.jsx` (config fields), `views/Workout.jsx` (AMRAP marker).

## Not in this phase

Custom table authoring, per-week accessory prescriptions, Jokers and First Set Last, and
programs in `lib/programs.js` that use a cycle — those come once this is proven on one lift.
