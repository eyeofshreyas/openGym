// The Push/Pull/Legs starter plan. Shared by the "Load starter plan" action in Settings
// and by the demo build, which seeds a history on top of exactly these routines.
//
// The three days between them train every muscle the body map draws, so a week on this plan
// leaves no blank patch to explain. The big lifts carry the plan; the last one or two on each
// day are there for what pressing, pulling and squatting leave uncovered — the serratus,
// obliques, adductors, hip flexors, shins, traps and lower back that a compound-only split
// only ever works as an afterthought. Verified by substitutes-free arithmetic in
// starter.test.js, so an edit here that drops a muscle fails the suite rather than quietly
// shipping a hole.
import { uid } from './format.js'

const SPEC = [
  ['Push Day', 'barbell', [
    ['0025', 4, 8],    // barbell bench press
    ['0047', 3, 10],   // barbell incline bench press
    ['0426', 3, 10],   // dumbbell standing overhead press
    ['0334', 3, 12],   // dumbbell lateral raise
    ['0241', 3, 12],   // cable triceps pushdown (v-bar)
    ['0251', 3, 10],   // chest dip
    ['0328', 3, 12],   // dumbbell incline shoulder raise — serratus
    ['0687', 3, 15],   // russian twist — abs, obliques
  ]],
  ['Pull Day', 'pullup', [
    ['2330', 4, 10],   // cable lat pulldown, full range of motion
    ['0027', 4, 8],    // barbell bent over row
    ['1323', 3, 10],   // cable rope seated row
    ['0095', 3, 12],   // barbell shrug — traps
    ['0031', 3, 10],   // barbell curl
    ['0313', 3, 12],   // dumbbell hammer curl
    ['0489', 3, 12],   // hyperextension — lower back
    ['0472', 3, 12],   // hanging leg raise — abs, hip flexors
  ]],
  ['Leg Day', 'legs', [
    ['0043', 4, 8],    // barbell full squat
    ['0085', 3, 10],   // barbell romanian deadlift
    ['0739', 3, 12],   // sled 45° leg press
    ['0585', 3, 12],   // lever leg extension
    ['0586', 3, 12],   // lever lying leg curl
    ['0598', 3, 15],   // lever seated hip adduction — adductors
    ['0605', 4, 15],   // lever standing calf raise
    ['1396', 3, 15],   // smith toe raise — shins. ponytail: the library's only tibialis work
  ]]
]

// Fresh routine objects (new ids) — [push, pull, legs].
export const starterRoutines = () =>
  SPEC.map(([name, emoji, list]) => ({ id: uid(), name, emoji, ex: list.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })) }))
