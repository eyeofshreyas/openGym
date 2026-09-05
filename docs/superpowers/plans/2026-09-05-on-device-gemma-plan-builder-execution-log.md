# Execution log — on-device Gemma plan builder

Snapshot of the subagent-driven execution ledger for
[the implementation plan](2026-09-05-on-device-gemma-plan-builder.md), taken at the halt
after Task 2. Tasks 1 and 2 are in git (`5dce992`, `e570324`); Tasks 0 and 3-7 need the
physical Galaxy S24 FE and are not started. The live copy that a resuming session reads is
git-ignored scratch at `.superpowers/sdd/2026-09-05-on-device-gemma-plan-builder/progress.md`
— this is the durable record of what was decided and why.

---


Spec: docs/superpowers/specs/2026-09-05-on-device-gemma-plan-builder-design.md (read).
Branch: develop (not main/master). Working tree carries the user's unrelated WIP in
api.js, useUI.js, Admin.jsx, Settings.jsx, RoutineEdit.jsx, Workout.jsx.

## Pre-flight scan

| Rows | What was checked | Found |
|---|---|---|
| T1 ↔ T2 | Both own coach.js/coach.test.js. T1 produces MAX_EX, MAX_DAYS, candidateExercises, buildPrompt; T2 appends and consumes MAX_EX/MAX_DAYS | Agree. T2's test file adds a second `import` from './coach.js' — legal ESM |
| T1 ↔ T6 | T1 produces candidateExercises/buildPrompt; T6 consumes both | Agree |
| T2 ↔ T6 | T2 produces planFromModel → parsed bundle; T6 passes it to planImportSheet | Agree — shape matches what PlanImport reads (routineCount, exerciseCount, scheduledDays, dropped) |
| T2 ↔ plan-share.js | T2 exports PLAN_FMT and imports parsePlan into coach.js | No import cycle: plan-share.js does not import coach.js |
| T0 ↔ T3/T4 | T0 temporarily edits build.gradle + variables.gradle then reverts (Step 7); T3 re-applies minSdk, T4 re-applies the dependency | Agree — no double-apply, no orphan edit |
| T0 → T4 | T0 Step 2 records the tasks-genai version and API shape that T4 Step 1/2 need | Agree — T4 carries an explicit "adjust if the API changed" note |
| T3 ↔ T4 | Both own GemmaPlugin.java. T4 amends T3's removeModel and modelPicked to call unloadModel | Agree — T4 states both amendments explicitly |
| T3 ↔ T5 | T3 produces status/pickModel/removeModel; T5's gemma.js consumes them | Agree on names and {installed, bytes} |
| T4 ↔ T5 | T4 produces generate({prompt})→{text}, unload(); T5 wraps them | Agree |
| T5 ↔ T6 | T5 produces modelStatus/generate/unload; T6 uses generate+unload in the sheet, modelStatus in Plan.jsx | Agree |
| T7 ↔ all | Docs only, no code interface | No conflict |
| T1 internal | Tests import candidateExercises, buildPrompt, MAX_EX; impl exports those plus MAX_DAYS | Agrees |
| T2 internal | Tests import coercePlan, planBundleFrom, planFromModel, MAX_DAYS; impl exports all four | Agrees |
| T3 internal | T3's removeModel omits unloadModel because no engine field exists yet | Correct for T3, amended in T4 |
| T5 internal | gemma.js caches on `plugin !== undefined`; Settings row hidden unless MOBILE | Agrees |
| T6 internal | sheets.jsx already imports EXDB, equipmentOf, Stepper, Button, toast, useState, planImportSheet; Plan.jsx has no react import yet, so T6 adds one | Agrees — plan states both |

Scan found no contradictions between tasks or against Global Constraints.

## Rulings

Ruling: execute on branch `develop` in the main working tree rather than a new worktree —
the user created `develop` for this work, it is not main/master, and Tasks 1-2 touch only
coach.js, coach.test.js and plan-share.js, none of which carry their uncommitted WIP.
Cost if wrong: their WIP and this work share a branch, so a revert of one is fiddlier.

Ruling: Tasks 0 and 3-6 require the physical Galaxy S24 FE plus a licence-gated Gemma model
file, and Task 7 documents behaviour those tasks must first prove. No subagent can run them.
Execute Tasks 1 and 2 only — the plan's own executor notes sanction building them ahead of
the spike ("Tasks 1 and 2 need no device") — then hand back to the user with Task 0 as the
gate. Cost if wrong: if the spike later fails, coach.js is dead code (~200 lines) that the
server-side fallback would reuse anyway.

Task 1: dispatched (implementer, haiku), BASE 2574923
Task 1: implementer DONE (commit 5dce992, 9 new tests, 205/205 suite green); review dispatched
Task 1: minor (deferred): coach.js imports exercises.js -> i18n.js -> react, so the module is
  transitively React-touching rather than literally pure. Inherited from the brief's own import.
Task 1: Ruling: the reviewer's ⚠️ (does the transitive react import matter for a later execution
  context?) is not a gap. coach.js runs only in the WebView's main JS context alongside the rest
  of the React app — the native side is Java and exchanges strings only; there is no worker or
  separate JS runtime in this design. history.js and plan-share.js already reach react the same
  way and are unit-tested in node today. Cost if wrong: if a future task moves plan generation
  into a worker, coach.js would need i18n decoupled from it first.
Task 1: complete (commits 2574923..5dce992, review clean)
Task 2: dispatched (implementer, haiku), BASE 5dce992
Task 2: implementer DONE (commit e570324, 15 new tests, 220/220 suite green); review dispatched
Task 2: minor (deferred): coach.test.js places its second `import ... from './coach.js'` mid-file,
  after two describe blocks. Legal ESM (hoisted) but would trip `import/first`. Inherited from the
  brief, which specified "append this block".
Task 2: Ruling: the reviewer's ⚠️ (full-suite counts unverified) is resolved — I ran `npm test`
  myself: 9 files, 220 passed, 0 failed. Not a gap.
Task 2: complete (commits 5dce992..e570324, review clean)

## Halt

Ruling: stop after Task 2 rather than continuing to Tasks 3-7. Task 0 (the spike that gates all
native work) and Tasks 3-6 need the physical Galaxy S24 FE plus a licence-gated Gemma model file;
no subagent can run them, and every verification step in those tasks is a manual on-device check.
Task 7 documents behaviour those tasks must first prove. Cost if wrong: none to the code — the
work simply resumes at Task 0 when the device is available.

Ruling: skip the final whole-branch review. The branch diff 2574923..e570324 is exactly the union
of the two task diffs, each already reviewed (spec ✅, quality approved). A third pass over the same
lines buys nothing, and "whole-branch" is not meaningful while the plan is 2/8 done. Cost if wrong:
a cross-task issue spanning only Tasks 1-2 goes unseen — narrow, since Task 2's review explicitly
checked Task 1's tests were untouched and the two modules' seam.

Workspace kept (not deleted): the plan is unfinished and the ledger is the resume point.
