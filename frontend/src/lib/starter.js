// The Push/Pull/Legs starter plan. Shared by the "Load starter plan" action in Settings
// and by the demo build, which seeds a history on top of exactly these routines.
//
// The three days between them train every muscle the body map draws, so a week on this plan
// leaves no blank patch to explain. The big lifts carry the plan; the last one or two on each
// day are there for what pressing, pulling and squatting leave uncovered — the serratus,
// obliques, adductors, hip flexors, shins, traps and lower back that a compound-only split
// only ever works as an afterthought. starter.test.js adds the week up muscle by muscle, so
// an edit here that drops one fails the suite rather than quietly shipping a hole.
//
// The fourth number, where present, is the load step the progression engine adds when a
// session goes clean. Without it every lift takes its body part's default — 2.5 kg upper,
// 5 kg lower — which is right for a bench press and absurd for a 10 kg lateral raise, where
// it is a 25 % jump that stalls the lift on its second session. Small isolation work steps by
// 1 kg, rows and pulldowns by 2.5 rather than the 5 their body part implies, and the leg press
// by 10 because 5 kg on 120 is not a session's progress.
//
// 1 rather than the 1.25 of a microplate pair: weights are stored and shown to one decimal, so
// a 1.25 step reads back as 11.3 and then 12.5, drifting off the number it actually put on the
// bar. A whole kilo is just as loadable and says exactly what it did.
import { uid } from './format.js'

const SPEC = [
  ['Push Day', 'barbell', [
    ['0025', 4, 8],           // barbell bench press
    ['0047', 3, 10],          // barbell incline bench press
    ['0426', 3, 10, 1],    // dumbbell standing overhead press
    ['0334', 3, 12, 1],    // dumbbell lateral raise
    ['0241', 3, 12],          // cable triceps pushdown (v-bar)
    ['0251', 3, 10],          // chest dip
    ['0328', 3, 12, 1],    // dumbbell incline shoulder raise — serratus
    ['0687', 3, 15],          // russian twist — abs, obliques
  ]],
  ['Pull Day', 'pullup', [
    ['2330', 4, 10, 2.5],     // cable lat pulldown, full range of motion
    ['0027', 4, 8, 2.5],      // barbell bent over row
    ['1323', 3, 10, 2.5],     // cable rope seated row
    ['0095', 3, 12],          // barbell shrug — traps
    ['0031', 3, 10, 1],    // barbell curl
    ['0313', 3, 12, 1],    // dumbbell hammer curl
    ['0489', 3, 12],          // hyperextension — lower back
    ['0472', 3, 12],          // hanging leg raise — abs, hip flexors
  ]],
  ['Leg Day', 'legs', [
    ['0043', 4, 8],           // barbell full squat
    ['0085', 3, 10],          // barbell romanian deadlift
    ['0739', 3, 12, 10],      // sled 45° leg press
    ['0585', 3, 12, 2.5],     // lever leg extension
    ['0586', 3, 12, 2.5],     // lever lying leg curl
    ['0598', 3, 15, 2.5],     // lever seated hip adduction — adductors
    ['0605', 4, 15],          // lever standing calf raise
    ['1396', 3, 15, 2.5],     // smith toe raise — shins. ponytail: the library's only tibialis work
  ]]
]

// Fresh routine objects (new ids) — [push, pull, legs].
//
// The steps above are kilos; a profile in pounds doubles them, the same 2.5→5 / 5→10 the
// engine's own defaults use. A step is written only where it differs from the default, and
// never on bodyweight work, which progresses in reps and has no load to add.
export const starterRoutines = (unit = 'kg') =>
  SPEC.map(([name, emoji, list]) => ({
    id: uid(), name, emoji,
    ex: list.map(([id, sets, reps, inc]) => ({ id, sets, reps, weight: 0, ...(inc ? { inc: unit === 'lb' ? inc * 2 : inc } : {}) }))
  }))
