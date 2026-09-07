# Feature roadmap — closing the gap on the paid trackers

Written 2026-09-07, after auditing Hevy, Strong, Jefit, Fitbod, Alpha Progression,
Boostcamp, Liftosaur, wger and FitTrackee against what openGym already does.

Program library — done (`lib/programs.js`).

Each phase below is its own brainstorm → design → implement cycle. Sizes are rough and
assume no surprises; the "settle first" line is the question that decides the design, and
is the thing worth answering before any code.

---

## Phase 1 — Set types (warm-up first)

**Why first.** This is the only item that changes the shape of a logged set, and five
things already read that shape: `history.js` (`setsDone`, `workoutVolume`, `lastEntryFor`),
`progression.js` (`readSession` judges a session by whether every set hit its target),
`onerm.js` (picks a best eligible set), `muscles.js` (`loadOfWorkouts` counts sets per
muscle), and Stats. Adding warm-ups later means revisiting every feature built in between —
Phase 2 in particular would compute weekly volume that silently includes warm-up sets.

**Scope.** A per-set `warmup` flag. A warm-up counts toward nothing: not volume, not the
muscle map, not a PR, not 1RM, and `readSession` must not judge progression by it.
Drop sets and failure sets are a separate decision — see below.

**Settle first.** Does a warm-up carry a target the progression engine prescribes (a real
warm-up ramp: 40/60/80 %), or is it just an untracked row you type into? The first is a
genuinely better product and roughly triples the work. Recommend: plain flag now, ramp
later, because the ramp wants the training-max maths from Phase 5 anyway.

**Data migration.** None needed — a set with no `warmup` key is a working set, which is
every set in every existing history.

**Proves it works.** A workout with warm-ups logged, asserting: volume and set count
unchanged vs. the same workout without them; `nextPrescription` gives the same answer;
`best1RM` ignores a heavy warm-up single; `loadOfWorkouts` doesn't count them.

**Size.** Medium. One flag, but seven files and the existing tests for each.

---

## Phase 2 — Sets per muscle, per week

**Why here.** Cheap the moment Phase 1 is right, and wrong if Phase 1 hasn't happened.

**Scope.** `loadOf` already returns effective sets per muscle. Show it as a number next to
the muscle map with a target band (the usual 10–20 sets/muscle/week), and say which muscles
are under, in, and over it. No new computation.

**Settle first.** Is the band fixed, or per-muscle, or user-editable? Recommend fixed and
uneditable to start — a knob nobody knows how to set is worse than a sane default.

**Proves it works.** A week of known workouts asserting the per-muscle set counts, and that
a warm-up set doesn't move them.

**Size.** Small.

---

## Phase 3 — Body measurements

**Why here.** Independent of everything above; the biggest single feature Hevy puts behind
Pro. Self-contained, so it's a good one to do while Phase 5 is still being thought about.

**Scope.** Waist, chest, arms, thighs, hips, neck — a value plus a date, exactly like body
weight. Reuse the body-weight chart and its goal line. Include them in JSON export/import
and in sync.

**Settle first.** Fixed list of measurements or user-defined ones? Recommend fixed —
custom fields mean a management UI for something most people fill in twice.

**Progress photos are a separate decision.** They are the strongest privacy argument
openGym has (photos that never leave your box), and also the first feature that puts
non-trivial binary data in `./data`. Storage, thumbnails, sync and export all change. Treat
as its own phase if wanted, not a sub-task of this one.

**Proves it works.** Round-trip through export/import; the chart renders a series with one
entry and with none.

**Size.** Medium.

---

## Phase 4 — Plate calculator + CSV export

Two unrelated small things, batched because each is an afternoon. Movable anywhere in this
list; do them when you want a short session.

- **Plate calculator.** Pure function: target weight, bar weight, available plates → what
  to load per side, and the closest achievable weight when it doesn't divide. Shown from the
  weight stepper during a workout. Needs a per-profile setting for bar weight and plate
  inventory, which is also what makes the progression engine's steps loadable.
- **CSV export.** JSON backup already exists (`Settings.jsx:212`); this is the same data as
  one row per set, for people who want a spreadsheet. Import already parses CSV
  (`lib/import-csv.js`), so match that dialect and openGym round-trips its own export.

**Proves it works.** Plate calculator: a table of awkward targets and the expected loads,
including the "you cannot make this weight" case. CSV: export then re-import, assert the
history matches.

**Size.** Small each.

---

## Phase 5 — Percentage / training-max programming

**Why here.** The largest piece, and the one that unlocks the most. 5/3/1, Madcow and
nSuns are all waiting on it, as are the four programs deliberately left out of the library
(see the comment at the top of `lib/programs.js`). Warm-up ramps from Phase 1 want the same
maths.

**Scope.** A training max per exercise, sets prescribed as a percentage of it, and a cycle
that advances week to week rather than session to session. This is a real extension of the
progression engine, not another entry in `POLICIES_FOR` — the current engine answers "given
the last session, what's next"; this one answers "given where you are in a four-week cycle,
what's today".

**Settle first, and this is the hard one.** Where does cycle position live? A week index on
the routine, a date the cycle started, or derived from workout history? Each breaks
differently when someone misses a week, and openGym already lets you reschedule any day.
This question deserves its own brainstorm before anything else in the phase.

**Also unblocked.** A/B alternating weeks (StrongLifts, Starting Strength, Greyskull LP)
need the same "the week is not always the same week" concept. Consider designing both at
once even if only one ships.

**Proves it works.** A full 5/3/1 cycle simulated session by session, asserting the
prescribed weight for every set of every week, including the deload week and what happens
when a session is skipped.

**Size.** Large. Worth its own spec document.

---

## Phase 6 — Read-only REST API

**Why last.** The API describes the data model, so it should be written once the model has
stopped moving — measurements (Phase 3) and set types (Phase 1) both change what it would
return. Shipping it earlier means versioning an API that immediately changes.

**Scope.** A per-profile token, and read-only endpoints for workouts, body weight,
measurements and PRs. `api/server.js` is a flat `'METHOD /path'` route table (line 256
onward) with cookie-session auth, so this is a token check plus a handful of handlers.

**Why it's worth doing at all.** No competitor in this audit serves self-hosters. Grafana
dashboards, Home Assistant, and "my own script" are what this crowd actually wants, and it
is the one feature on this list that is a differentiator rather than catching up.

**Settle first.** Token per profile or per instance? Read-only forever, or is write a
planned follow-up? Recommend read-only and per-profile — writes need a much more careful
think about conflict with sync.

**Proves it works.** Endpoint tests with a valid token, a wrong token, and no token.

**Size.** Small–medium.

---

## Deliberately not doing

- **Social feed, leaderboards, following.** Hevy's third pillar. Contradicts "no account on
  someone else's server" and is most of what makes their backend expensive.
- **Nutrition and calorie tracking.** wger and Fitbod both do it. It is a second product.
- **Coach / client management.** Hevy Coach, Jefit Coach. A different customer.
- **Ads, or gating any of the above behind a paid tier.**
