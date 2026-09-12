// The program library — the plans you can start from instead of building a week by hand.
//
// Every program here is expressible in openGym's plan model as it stands: one routine per
// weekday, each exercise carrying its own progression rule. That is a deliberate limit, and
// it is why some famous names are absent:
//
//  - A/B alternating (StrongLifts 5×5, Starting Strength, Greyskull LP) needs week 1 to run
//    A-B-A and week 2 to run B-A-B. `S.week` is a fixed Mon–Sun map, so it cannot alternate.
//  - Percentage waves (5/3/1, Madcow) need a training max and a four-week cycle. That is the
//    roadmap's "percentage / training-max programming", and it isn't built yet.
//  - Stage programs (GZCLP) switch 5×3 → 6×2 → 10×1 on a failure. The engine deloads on a
//    stall; it does not change the scheme.
//
// Shipping those pinned to weekdays would put a plan on screen under a name it doesn't
// actually follow, so they wait for the model rather than arriving wrong.
//
// A program is turned into exactly the object `parsePlan` returns, so the existing import
// sheet previews it and `mergePlan` applies it — new routines with fresh ids, nothing the
// user already has overwritten.

import { starterRoutines } from './starter.js'

/**
 * One exercise line: [id, sets, reps, inc] — or [id, sets, reps, { ... }] when it needs more
 * than a load step. `reps` is the target; under double progression it is the TOP of the range
 * and `repsMin` the bottom, which is how nextPrescription reads them.
 *
 * The step is written only where the body-part default (2.5 kg upper, 5 kg lower) would be
 * wrong — the same reasoning as starter.js: 2.5 kg on a 10 kg lateral raise is a 25 % jump
 * that stalls the lift on its second session. Bodyweight work gets no step at all; it has no
 * load to add and progresses in reps.
 */
function buildEx([id, sets, reps, opt], unit) {
  const o = typeof opt === 'number' ? { inc: opt } : { ...(opt || {}) }
  if (o.inc && unit === 'lb') o.inc *= 2      // same 2.5→5 / 5→10 doubling the engine defaults use
  return { id, sets, reps, weight: 0, ...o }
}

// The routines programs are built from. Keyed, because a program references them by name and
// the week map points at the same keys — Arnold's week runs each of its three twice.
const R = {
  /* ---- push / pull / legs, six days ---- */
  pushA: { name: 'Push A', glyph: 'barbell', prog: 'linear', ex: [
    ['0025', 4, 6],                     // barbell bench press
    ['0047', 3, 8],                     // barbell incline bench press
    ['0091', 3, 8],                     // barbell seated overhead press
    ['0334', 3, 12, 1],                 // dumbbell lateral raise
    ['0060', 3, 10, 1],                 // barbell lying triceps extension (skull crusher)
    ['0241', 3, 12, 1],                 // cable triceps pushdown (v-bar)
  ]},
  pullA: { name: 'Pull A', glyph: 'pullup', prog: 'linear', ex: [
    ['0032', 3, 5],                     // barbell deadlift
    ['0027', 4, 6, 2.5],                // barbell bent over row
    ['0652', 3, 8],                     // pull-up — bodyweight, progresses in reps
    ['0095', 3, 12],                    // barbell shrug — traps
    ['0031', 3, 10, 1],                 // barbell curl
    ['0489', 3, 12],                    // hyperextension — lower back
  ]},
  legsA: { name: 'Legs A', glyph: 'legs', prog: 'linear', ex: [
    ['0043', 4, 6],                     // barbell full squat
    ['0085', 3, 8],                     // barbell romanian deadlift
    ['0739', 3, 10, 10],                // sled 45° leg press
    ['0586', 3, 12, 2.5],               // lever lying leg curl
    ['0605', 4, 15],                    // lever standing calf raise
    ['0472', 3, 12],                    // hanging leg raise — abs, hip flexors
  ]},
  pushB: { name: 'Push B', glyph: 'dumbbell', prog: 'double', ex: [
    ['0314', 4, 12, { inc: 1, repsMin: 8 }],    // dumbbell incline bench press
    ['0577', 3, 12, { repsMin: 8 }],            // lever chest press
    ['0308', 3, 15, { inc: 1, repsMin: 10 }],   // dumbbell fly
    ['2137', 3, 12, { inc: 1, repsMin: 8 }],    // dumbbell arnold press
    ['0378', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell rear fly
    ['0194', 3, 12, { inc: 1, repsMin: 10 }],   // cable overhead triceps extension (rope)
  ]},
  pullB: { name: 'Pull B', glyph: 'machine', prog: 'double', ex: [
    ['2330', 4, 12, { inc: 2.5, repsMin: 8 }],  // cable lat pulldown, full range of motion
    ['0861', 3, 12, { inc: 2.5, repsMin: 8 }],  // cable seated row
    ['0293', 3, 12, { inc: 2.5, repsMin: 8 }],  // dumbbell bent over row
    ['0318', 3, 12, { inc: 1, repsMin: 10 }],   // dumbbell incline curl
    ['0313', 3, 12, { inc: 1, repsMin: 10 }],   // dumbbell hammer curl
    ['0328', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell incline shoulder raise — serratus
  ]},
  legsB: { name: 'Legs B', glyph: 'figureStrength', prog: 'double', ex: [
    ['0042', 4, 10, { repsMin: 8 }],            // barbell front squat
    ['1460', 3, 20, { side: true }],             // walking lunge — bodyweight, 10 per side
    ['0585', 3, 15, { inc: 2.5, repsMin: 12 }], // lever leg extension
    ['0598', 3, 15, { inc: 2.5, repsMin: 12 }], // lever seated hip adduction — adductors
    ['0594', 4, 15, { inc: 2.5, repsMin: 12 }], // lever seated calf raise
    ['1396', 3, 15, { inc: 2.5, repsMin: 12 }], // smith toe raise — shins
    ['0687', 3, 20],                             // russian twist — obliques
  ]},

  /* ---- upper / lower, four days ---- */
  upperA: { name: 'Upper A', glyph: 'barbell', prog: 'linear', ex: [
    ['0025', 4, 6],                     // barbell bench press
    ['0027', 4, 6, 2.5],                // barbell bent over row
    ['0091', 3, 8],                     // barbell seated overhead press
    ['0652', 3, 8],                     // pull-up
    ['0095', 3, 12],                    // barbell shrug — traps
    ['0031', 3, 10, 1],                 // barbell curl
    ['0030', 3, 10],                    // barbell close-grip bench press
  ]},
  lowerA: { name: 'Lower A', glyph: 'legs', prog: 'linear', ex: [
    ['0043', 4, 6],                     // barbell full squat
    ['0085', 3, 8],                     // barbell romanian deadlift
    ['0739', 3, 10, 10],                // sled 45° leg press
    ['0489', 3, 12],                    // hyperextension — lower back
    ['0605', 4, 15],                    // lever standing calf raise
    ['0472', 3, 12],                    // hanging leg raise — abs, hip flexors
  ]},
  upperB: { name: 'Upper B', glyph: 'dumbbell', prog: 'double', ex: [
    ['0314', 4, 12, { inc: 1, repsMin: 8 }],    // dumbbell incline bench press
    ['2330', 4, 12, { inc: 2.5, repsMin: 8 }],  // cable lat pulldown
    ['0334', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell lateral raise
    ['0861', 3, 12, { inc: 2.5, repsMin: 8 }],  // cable seated row
    ['0313', 3, 12, { inc: 1, repsMin: 10 }],   // dumbbell hammer curl
    ['0241', 3, 12, { inc: 1, repsMin: 10 }],   // cable triceps pushdown
    ['0328', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell incline shoulder raise — serratus
  ]},
  lowerB: { name: 'Lower B', glyph: 'figureStrength', prog: 'double', ex: [
    ['0042', 3, 10, { repsMin: 8 }],            // barbell front squat
    ['0586', 3, 12, { inc: 2.5, repsMin: 10 }], // lever lying leg curl
    ['0585', 3, 15, { inc: 2.5, repsMin: 12 }], // lever leg extension
    ['0598', 3, 15, { inc: 2.5, repsMin: 12 }], // lever seated hip adduction — adductors
    ['0594', 4, 15, { inc: 2.5, repsMin: 12 }], // lever seated calf raise
    ['1396', 3, 15, { inc: 2.5, repsMin: 12 }], // smith toe raise — shins
    ['0687', 3, 20],                             // russian twist — obliques
  ]},

  /* ---- full body, three days ---- */
  fullA: { name: 'Full Body A', glyph: 'figureStrength', prog: 'linear', ex: [
    ['0043', 3, 5],                     // barbell full squat
    ['0025', 3, 5],                     // barbell bench press
    ['0027', 3, 8, 2.5],                // barbell bent over row
    ['0091', 3, 8],                     // barbell seated overhead press
    ['0605', 3, 15],                    // lever standing calf raise
    ['0472', 3, 12],                    // hanging leg raise — abs, hip flexors
  ]},
  fullB: { name: 'Full Body B', glyph: 'barbell', prog: 'linear', ex: [
    ['0032', 3, 5],                     // barbell deadlift
    ['0047', 3, 8],                     // barbell incline bench press
    ['2330', 3, 10, 2.5],               // cable lat pulldown
    ['0334', 3, 12, 1],                 // dumbbell lateral raise
    ['0095', 3, 12],                    // barbell shrug — traps
    ['0031', 3, 10, 1],                 // barbell curl
    ['0489', 3, 12],                    // hyperextension — lower back
  ]},
  fullC: { name: 'Full Body C', glyph: 'dumbbell', prog: 'linear', ex: [
    ['0042', 3, 8],                     // barbell front squat
    ['0289', 3, 10, 1],                 // dumbbell bench press
    ['0861', 3, 10, 2.5],               // cable seated row
    ['0085', 3, 8],                     // barbell romanian deadlift
    ['0241', 3, 12, 1],                 // cable triceps pushdown
    ['0598', 3, 15, 2.5],               // lever seated hip adduction — adductors
    ['0687', 3, 20],                    // russian twist — obliques
  ]},

  /* ---- PHUL: two power days, two hypertrophy days ---- */
  phulUpperP: { name: 'Upper Power', glyph: 'barbell', prog: 'linear', ex: [
    ['0025', 4, 5],                     // barbell bench press
    ['0027', 4, 5, 2.5],                // barbell bent over row
    ['0314', 3, 8, 1],                  // dumbbell incline bench press
    ['2330', 3, 8, 2.5],                // cable lat pulldown
    ['0091', 3, 8],                     // barbell seated overhead press
    ['0031', 3, 8, 1],                  // barbell curl
    ['0030', 3, 8],                     // barbell close-grip bench press
  ]},
  phulLowerP: { name: 'Lower Power', glyph: 'legs', prog: 'linear', ex: [
    ['0043', 4, 5],                     // barbell full squat
    ['0032', 3, 5],                     // barbell deadlift
    ['0739', 3, 10, 10],                // sled 45° leg press
    ['0586', 3, 10, 2.5],               // lever lying leg curl
    ['0605', 4, 12],                    // lever standing calf raise
    ['0489', 3, 12],                    // hyperextension — lower back
  ]},
  phulUpperH: { name: 'Upper Hypertrophy', glyph: 'dumbbell', prog: 'double', ex: [
    ['0047', 3, 12, { repsMin: 8 }],            // barbell incline bench press
    ['0308', 3, 15, { inc: 1, repsMin: 10 }],   // dumbbell fly
    ['0861', 3, 12, { inc: 2.5, repsMin: 8 }],  // cable seated row
    ['0293', 3, 12, { inc: 2.5, repsMin: 8 }],  // dumbbell bent over row
    ['0334', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell lateral raise
    ['0318', 3, 12, { inc: 1, repsMin: 10 }],   // dumbbell incline curl
    ['0241', 3, 12, { inc: 1, repsMin: 10 }],   // cable triceps pushdown
  ]},
  phulLowerH: { name: 'Lower Hypertrophy', glyph: 'figureStrength', prog: 'double', ex: [
    ['0042', 3, 12, { repsMin: 8 }],            // barbell front squat
    ['1460', 3, 20, { side: true }],             // walking lunge — bodyweight, 10 per side
    ['0585', 3, 15, { inc: 2.5, repsMin: 12 }], // lever leg extension
    ['0085', 3, 12, { repsMin: 8 }],            // barbell romanian deadlift
    ['0594', 4, 15, { inc: 2.5, repsMin: 12 }], // lever seated calf raise
    ['1396', 3, 15, { inc: 2.5, repsMin: 12 }], // smith toe raise — shins
    ['0472', 3, 12],                             // hanging leg raise — abs, hip flexors
  ]},

  /* ---- PHAT: power twice, hypertrophy three times ---- */
  phatUpperP: { name: 'Upper Power', glyph: 'barbell', prog: 'linear', ex: [
    ['0027', 4, 5, 2.5],                // barbell bent over row
    ['0652', 3, 8],                     // pull-up
    ['0025', 4, 5],                     // barbell bench press
    ['0091', 3, 8],                     // barbell seated overhead press
    ['0030', 3, 8],                     // barbell close-grip bench press
    ['0031', 3, 8, 1],                  // barbell curl
  ]},
  phatLowerP: { name: 'Lower Power', glyph: 'legs', prog: 'linear', ex: [
    ['0043', 4, 5],                     // barbell full squat
    ['0032', 3, 5],                     // barbell deadlift
    ['0739', 3, 10, 10],                // sled 45° leg press
    ['0586', 3, 10, 2.5],               // lever lying leg curl
    ['0605', 4, 12],                    // lever standing calf raise
    ['0489', 3, 12],                    // hyperextension — lower back
  ]},
  phatBackShoulders: { name: 'Back & Shoulders', glyph: 'pullup', prog: 'double', ex: [
    ['2330', 4, 12, { inc: 2.5, repsMin: 8 }],  // cable lat pulldown
    ['0861', 3, 12, { inc: 2.5, repsMin: 8 }],  // cable seated row
    ['0293', 3, 12, { inc: 2.5, repsMin: 8 }],  // dumbbell bent over row
    ['0095', 3, 15, { repsMin: 12 }],           // barbell shrug — traps
    ['0334', 4, 15, { inc: 1, repsMin: 12 }],   // dumbbell lateral raise
    ['0378', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell rear fly
  ]},
  phatLowerH: { name: 'Lower Hypertrophy', glyph: 'figureStrength', prog: 'double', ex: [
    ['0042', 3, 12, { repsMin: 8 }],            // barbell front squat
    ['0585', 4, 15, { inc: 2.5, repsMin: 12 }], // lever leg extension
    ['0085', 3, 12, { repsMin: 8 }],            // barbell romanian deadlift
    ['0598', 3, 15, { inc: 2.5, repsMin: 12 }], // lever seated hip adduction — adductors
    ['0594', 4, 15, { inc: 2.5, repsMin: 12 }], // lever seated calf raise
    ['1396', 3, 15, { inc: 2.5, repsMin: 12 }], // smith toe raise — shins
    ['0472', 3, 12],                             // hanging leg raise — abs, hip flexors
  ]},
  phatChestArms: { name: 'Chest & Arms', glyph: 'arm', prog: 'double', ex: [
    ['0047', 4, 12, { repsMin: 8 }],            // barbell incline bench press
    ['0308', 3, 15, { inc: 1, repsMin: 10 }],   // dumbbell fly
    ['0251', 3, 12],                             // chest dip — bodyweight
    ['0318', 3, 12, { inc: 1, repsMin: 10 }],   // dumbbell incline curl
    ['0313', 3, 12, { inc: 1, repsMin: 10 }],   // dumbbell hammer curl
    ['0194', 3, 12, { inc: 1, repsMin: 10 }],   // cable overhead triceps extension
    ['0687', 3, 20],                             // russian twist — obliques
  ]},

  /* ---- Arnold split: each day twice a week ---- */
  arnChestBack: { name: 'Chest & Back', glyph: 'barbell', prog: 'double', ex: [
    ['0025', 4, 10, { repsMin: 8 }],            // barbell bench press
    ['0314', 3, 12, { inc: 1, repsMin: 8 }],    // dumbbell incline bench press
    ['0308', 3, 15, { inc: 1, repsMin: 10 }],   // dumbbell fly
    ['0027', 4, 10, { inc: 2.5, repsMin: 8 }],  // barbell bent over row
    ['2330', 3, 12, { inc: 2.5, repsMin: 8 }],  // cable lat pulldown
    ['0652', 3, 8],                              // pull-up
    ['0328', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell incline shoulder raise — serratus
  ]},
  arnShouldersArms: { name: 'Shoulders & Arms', glyph: 'arm', prog: 'double', ex: [
    ['0091', 4, 10, { repsMin: 8 }],            // barbell seated overhead press
    ['0334', 4, 15, { inc: 1, repsMin: 12 }],   // dumbbell lateral raise
    ['0378', 3, 15, { inc: 1, repsMin: 12 }],   // dumbbell rear fly
    ['0095', 3, 15, { repsMin: 12 }],           // barbell shrug — traps
    ['0031', 3, 12, { inc: 1, repsMin: 8 }],    // barbell curl
    ['0060', 3, 12, { inc: 1, repsMin: 10 }],   // barbell lying triceps extension
    ['0241', 3, 12, { inc: 1, repsMin: 10 }],   // cable triceps pushdown
  ]},
  arnLegsAbs: { name: 'Legs & Abs', glyph: 'legs', prog: 'double', ex: [
    ['0043', 4, 10, { repsMin: 8 }],            // barbell full squat
    ['0739', 3, 12, { inc: 10, repsMin: 10 }],  // sled 45° leg press
    ['0586', 3, 12, { inc: 2.5, repsMin: 10 }], // lever lying leg curl
    ['0085', 3, 12, { repsMin: 8 }],            // barbell romanian deadlift
    ['0598', 3, 15, { inc: 2.5, repsMin: 12 }], // lever seated hip adduction — adductors
    ['0605', 4, 15, { repsMin: 12 }],           // lever standing calf raise
    ['0472', 3, 15],                             // hanging leg raise — abs, hip flexors
  ]},

  /* ---- calisthenics: no load to add, so repsMax caps the rep climb and hands progress
     to a new set instead (the engine's existing bodyweight rule, issue #33) ---- */
  calFound: { name: 'Calisthenics', glyph: 'figureStrength', prog: 'double', ex: [
    ['0493', 3, 8, { repsMax: 15 }],                    // incline push-up
    ['0688', 3, 8, { repsMax: 15 }],                    // scapular pull-up
    ['2368', 3, 8, { side: true, repsMax: 15 }],        // split squats
    ['0489', 3, 12, { repsMax: 20 }],                   // hyperextension — lower back
    ['3419', 3, 8, { mode: 'time', sec: 8, prog: 'time' }], // l-sit on floor — hold
  ]},
  calPush: { name: 'Calisthenics Push', glyph: 'figureStrength', prog: 'double', ex: [
    ['0662', 4, 10, { repsMax: 20 }],                   // push-up
    ['0251', 3, 8, { repsMax: 15 }],                    // chest dip
    ['0725', 3, 5, { repsMax: 10 }],                    // single arm push-up
  ]},
  calPull: { name: 'Calisthenics Pull', glyph: 'pullup', prog: 'double', ex: [
    ['0652', 4, 8, { repsMax: 15 }],                    // pull-up
    ['0688', 3, 8, { repsMax: 15 }],                    // scapular pull-up — traps
    ['0472', 3, 10, { repsMax: 20 }],                   // hanging leg raise
  ]},
  calLegs: { name: 'Calisthenics Legs', glyph: 'legs', prog: 'double', ex: [
    ['2368', 4, 10, { side: true, repsMax: 20 }],       // split squats
    ['1460', 3, 12, { side: true, repsMax: 20 }],       // walking lunge
    ['0489', 3, 15, { repsMax: 20 }],                   // hyperextension — lower back
    ['3419', 3, 15, { mode: 'time', sec: 15, prog: 'time' }], // l-sit on floor — hold
  ]},
  calSkillPush: { name: 'Push Skills', glyph: 'bolt', prog: 'double', ex: [
    ['3294', 4, 6, { repsMax: 12 }],                    // archer push-up
    ['3327', 3, 5, { repsMax: 10 }],                    // full planche push-up
    ['0471', 3, 5, { repsMax: 10 }],                    // handstand push-up
    ['3298', 3, 10, { mode: 'time', sec: 10, prog: 'time' }], // straddle planche — hold
  ]},
  calSkillPull: { name: 'Pull Skills', glyph: 'pullup', prog: 'double', ex: [
    ['0631', 3, 3, { repsMax: 6 }],                     // muscle up
    ['3293', 3, 5, { repsMax: 10 }],                    // archer pull-up
    ['0688', 3, 8, { repsMax: 15 }],                    // scapular pull-up — traps
    ['0677', 3, 8, { repsMax: 15 }],                    // ring dips
    ['3296', 3, 10, { mode: 'time', sec: 10, prog: 'time' }], // front lever — hold
  ]},
  calSkillLegs: { name: 'Legs & Core Skills', glyph: 'legs', prog: 'double', ex: [
    ['1759', 3, 6, { side: true, repsMax: 10 }],        // single leg squat (pistol)
    ['2368', 3, 10, { side: true, repsMax: 20 }],       // split squats
    ['0489', 3, 15, { repsMax: 20 }],                   // hyperextension — lower back
    ['0472', 3, 12, { repsMax: 20 }],                   // hanging leg raise
    ['3419', 3, 20, { mode: 'time', sec: 20, prog: 'time' }], // l-sit on floor — hold
  ]},
}

// The starter plan's three routines keep stable keys so ppl3's week can point at them without
// starter.js having to know the library exists.
const STARTER_KEYS = ['push', 'pull', 'legs']

/**
 * The library, easiest week first. `week` maps weekday (0 = Sunday, matching S.week) to a
 * routine key; its size is the program's days per week, so the two can never disagree.
 */
export const PROGRAMS = [
  {
    key: 'ppl3', glyph: 'figureStrength', name: 'Push / Pull / Legs', level: 'Beginner', starter: true,
    blurb: 'Three days, every muscle the body map draws. The openGym starter.',
    week: { 1: 'push', 3: 'pull', 5: 'legs' },
  },
  {
    key: 'fb3', glyph: 'barbell', name: 'Full Body', level: 'Beginner',
    blurb: 'Three days, the big lifts every session. The most training from the fewest visits.',
    routines: ['fullA', 'fullB', 'fullC'],
    week: { 1: 'fullA', 3: 'fullB', 5: 'fullC' },
  },
  {
    key: 'ul4', glyph: 'dumbbell', name: 'Upper / Lower', level: 'Intermediate',
    blurb: 'Four days: each half of the body heavy once and for volume once.',
    routines: ['upperA', 'lowerA', 'upperB', 'lowerB'],
    week: { 1: 'upperA', 2: 'lowerA', 4: 'upperB', 5: 'lowerB' },
  },
  {
    key: 'phul', glyph: 'plate', name: 'PHUL', level: 'Intermediate',
    blurb: 'Power Hypertrophy Upper Lower — two heavy days for strength, two lighter for size.',
    routines: ['phulUpperP', 'phulLowerP', 'phulUpperH', 'phulLowerH'],
    week: { 1: 'phulUpperP', 2: 'phulLowerP', 4: 'phulUpperH', 5: 'phulLowerH' },
  },
  {
    key: 'ppl6', glyph: 'flame', name: 'Push / Pull / Legs ×2', level: 'Intermediate',
    blurb: 'Six days: the same three days twice, heavy first time round and for volume the second.',
    routines: ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'],
    week: { 1: 'pushA', 2: 'pullA', 3: 'legsA', 4: 'pushB', 5: 'pullB', 6: 'legsB' },
  },
  {
    key: 'phat', glyph: 'bolt', name: 'PHAT', level: 'Advanced',
    blurb: 'Power Hypertrophy Adaptive Training — two power days, then three days of volume.',
    routines: ['phatUpperP', 'phatLowerP', 'phatBackShoulders', 'phatLowerH', 'phatChestArms'],
    week: { 1: 'phatUpperP', 2: 'phatLowerP', 4: 'phatBackShoulders', 5: 'phatLowerH', 6: 'phatChestArms' },
  },
  {
    key: 'arnold', glyph: 'arm', name: 'Arnold Split', level: 'Advanced',
    blurb: 'Six days over three sessions, each hit twice a week. High volume, no easy weeks.',
    routines: ['arnChestBack', 'arnShouldersArms', 'arnLegsAbs'],
    week: { 1: 'arnChestBack', 2: 'arnShouldersArms', 3: 'arnLegsAbs', 4: 'arnChestBack', 5: 'arnShouldersArms', 6: 'arnLegsAbs' },
  },

  /* ---- calisthenics: no equipment beyond a bar, load added by rep count and set count ---- */
  {
    key: 'calFound3', glyph: 'figureStrength', name: 'Calisthenics Foundations', level: 'Beginner',
    blurb: 'Three days, one full-body session — push-up, pull-up, squat and a hold, every time.',
    routines: ['calFound'],
    week: { 1: 'calFound', 3: 'calFound', 5: 'calFound' },
  },
  {
    key: 'calBuild3', glyph: 'pullup', name: 'Calisthenics Builder', level: 'Intermediate',
    blurb: 'Push / pull / legs with just body weight — the step up once push-ups and pull-ups stop being hard.',
    routines: ['calPush', 'calPull', 'calLegs'],
    week: { 1: 'calPush', 3: 'calPull', 5: 'calLegs' },
  },
  {
    key: 'calSkill3', glyph: 'bolt', name: 'Calisthenics Skills', level: 'Advanced',
    blurb: 'Muscle-ups, levers and planches — skill work for a body that has outgrown the basics.',
    routines: ['calSkillPush', 'calSkillPull', 'calSkillLegs'],
    week: { 1: 'calSkillPush', 3: 'calSkillPull', 5: 'calSkillLegs' },
  },
]

/** Days per week — the week map is the only place that number lives. */
export const daysOf = p => Object.keys(p.week).length

/**
 * Turn a program into the shape `parsePlan` hands back, so `planImportSheet` can preview it
 * and `mergePlan` can apply it with no code of its own. Routine ids here are the library's
 * keys; mergePlan swaps them for fresh uids and re-points the week through its own map.
 */
export function programBundle(p, unit = 'kg') {
  const routines = p.starter
    ? starterRoutines(unit).map((r, i) => ({ ...r, id: STARTER_KEYS[i] }))
    : p.routines.map(k => ({
        id: k, name: R[k].name, emoji: R[k].glyph,
        ...(R[k].prog ? { prog: R[k].prog } : {}),
        ex: R[k].ex.map(s => buildEx(s, unit)),
      }))
  return {
    name: p.name,
    routines,
    week: { ...p.week },
    customEx: [],
    dropped: 0,
    routineCount: routines.length,
    exerciseCount: routines.reduce((n, r) => n + r.ex.length, 0),
    scheduledDays: daysOf(p),
  }
}
