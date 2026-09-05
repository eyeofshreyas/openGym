// Building a week's plan with an on-device model.
//
// The model's job is deliberately small: pick exercises from a shortlist we hand it and
// arrange them across weekdays. Sets, reps, loads and progression come from
// defaultConfig() and the progression engine, exactly as they do for a hand-built
// routine — a 2B model asked for numbers produces plausible nonsense, and openGym
// already has the good answer.
import { EXDB } from './exercises.js'

// A routine longer than this is the model padding; a week with more than six training
// days is the model ignoring the brief. Both are clamped rather than argued with.
export const MAX_EX = 8
export const MAX_DAYS = 6
const CANDIDATE_LIMIT = 200

/**
 * Exercise names the model may choose from: the library filtered to the equipment the
 * user actually has, capped, and spread round-robin across body parts so a 200-name
 * shortlist still covers every muscle group instead of 200 ways to train arms.
 * An empty `equipment` means no filter.
 */
export function candidateExercises(equipment, limit = CANDIDATE_LIMIT) {
  const want = new Set(equipment || [])
  const byPart = new Map()
  EXDB.forEach(e => {
    if (e.bp === 'cardio') return          // the builder plans lifting; cardio is added by hand
    if (want.size && !want.has(e.eq)) return
    if (!byPart.has(e.bp)) byPart.set(e.bp, [])
    byPart.get(e.bp).push(e.n)
  })
  const lists = [...byPart.values()]
  const out = []
  for (let i = 0; out.length < limit; i++) {
    let added = false
    for (const l of lists) {
      if (i >= l.length) continue
      out.push(l[i]); added = true
      if (out.length >= limit) break
    }
    if (!added) break
  }
  return out
}

/** The whole prompt. Plain text — MediaPipe applies the model's own turn template. */
export function buildPrompt({ days = 3, equipment = [], goal = '', limits = '' }, candidates) {
  return [
    'You are planning a weekly strength training split.',
    `Training days per week: ${days}.`,
    goal ? `Goal: ${goal}.` : '',
    limits ? `Limitations to respect: ${limits}.` : '',
    equipment.length ? `Equipment available: ${equipment.join(', ')}.` : '',
    '',
    'Choose exercises ONLY from this list, copying each name exactly as written:',
    candidates.join('\n'),
    '',
    'Reply with JSON only, no prose, in exactly this shape:',
    '{"routines":[{"name":"Push","day":1,"exercises":["barbell bench press","dumbbell lateral raise"]}]}',
    `"day" is 0 for Sunday through 6 for Saturday. Give ${days} routines, 4 to ${MAX_EX} exercises each.`,
    'Do not include sets, reps or weights.',
  ].filter(Boolean).join('\n')
}
