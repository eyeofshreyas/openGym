// Building a week's plan with an on-device model.
//
// The model's job is deliberately small: pick exercises from a shortlist we hand it and
// arrange them across weekdays. Sets, reps, loads and progression come from
// defaultConfig() and the progression engine, exactly as they do for a hand-built
// routine — a 2B model asked for numbers produces plausible nonsense, and openGym
// already has the good answer.
import { EXDB } from './exercises.js'
import { matchExercise } from './import-csv.js'
import { defaultConfig } from './history.js'
import { parsePlan, PLAN_FMT } from './plan-share.js'
import { uid, todayISO } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'

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

/**
 * Read whatever the model said into the shape we asked for, or null.
 *
 * Small models wrap JSON in prose and code fences, invent day numbers, and pad a routine
 * to twenty exercises when asked for eight. All of that is corrected here rather than
 * rejected — the only failure is having nothing usable left.
 */
export function coercePlan(text) {
  const s = String(text || '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  let data
  try { data = JSON.parse(s.slice(a, b + 1)) } catch { return null }
  const src = Array.isArray(data && data.routines) ? data.routines : []
  const takenDays = new Set()
  const routines = []
  for (const r of src) {
    if (routines.length >= MAX_DAYS) break
    const raw = Array.isArray(r && r.exercises) ? r.exercises : []
    const names = [...new Set(raw.filter(n => typeof n === 'string' && n.trim()))].slice(0, MAX_EX)
    if (!names.length) continue
    // A day is kept only if it is a real weekday nobody else claimed — two routines on
    // Monday would silently lose one when the week is written.
    const d = r && Number.isInteger(r.day) && r.day >= 0 && r.day <= 6 && !takenDays.has(r.day) ? r.day : null
    if (d !== null) takenDays.add(d)
    const name = String((r && r.name) || '').trim().slice(0, 40)
    routines.push({ name: name || `Routine ${routines.length + 1}`, day: d, names })
  }
  return routines.length ? { routines } : null
}

/**
 * Turn coerced names into a plan bundle: library ids via the importer's matcher, and
 * sets/reps from defaultConfig — the same config a hand-added exercise gets.
 * `unmatched` is how many names the library had no answer for.
 */
export function planBundleFrom(coerced) {
  let unmatched = 0
  const week = {}
  const routines = []
  for (const r of coerced.routines) {
    const ids = []
    for (const n of r.names) {
      const id = matchExercise(n)
      if (!id) { unmatched++; continue }
      if (!ids.includes(id)) ids.push(id)     // two names, one exercise
    }
    if (!ids.length) continue                 // nothing resolved — the day goes with it
    const rid = uid()
    routines.push({ id: rid, name: r.name, emoji: DEFAULT_GLYPH, ex: ids.map(id => ({ id, ...defaultConfig(id) })) })
    if (r.day !== null) week[r.day] = rid
  }
  return { unmatched, bundle: { opengym_plan: PLAN_FMT, exported: todayISO(), name: '', week, routines, customEx: [] } }
}

/**
 * Model text in, the parsed bundle planImportSheet() takes out — or null if nothing
 * usable survived. Unmatched names are folded into `dropped`, which is the count the
 * sheet already shows for exercises a file couldn't bring with it.
 */
export function planFromModel(text) {
  const coerced = coercePlan(text)
  if (!coerced) return null
  const { bundle, unmatched } = planBundleFrom(coerced)
  if (!bundle.routines.length) return null
  const parsed = parsePlan(bundle)
  parsed.dropped += unmatched
  return parsed
}
