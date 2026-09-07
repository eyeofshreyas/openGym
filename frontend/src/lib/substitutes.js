// Swapping one exercise for another mid-session: the rack is taken, the shoulder complains,
// someone is camped on the only cable tower.
//
// Ranked out of the library's own fields rather than a model. Every exercise already records
// what it trains (`tg` primary, `sm` secondary) and on what (`eq`), so the answer is instant,
// works offline on every platform, and can only ever name a lift the app actually has.
import { EXDB, EXIDX } from './exercises.js'

// Everything an exercise trains, primary and secondary in one bag — the overlap with this
// is what makes a swap a swap rather than a different workout.
const musclesOf = e => new Set([e.tg, ...(e.sm || [])].filter(Boolean))

// The dataset gives a chest stretch the same muscles as a bench press, so muscles alone put
// them level. The movement words in the name are what separate them: "bench press" shares two
// words with "dumbbell bench press" and none with "behind head chest stretch". Equipment words
// are dropped — matching on those would fight the whole point of looking for another implement.
const EQ_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'band', 'machine', 'leverage', 'lever', 'smith', 'sled',
  'kettlebell', 'ez', 'bar', 'weighted', 'assisted', 'body', 'weight', 'bodyweight', 'stability', 'ball', 'roller'])
const wordsOf = e => new Set(String(e.n || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !EQ_WORDS.has(w)))

// Stretches and warm-ups sit in the library under the same muscles as the lifts they precede.
// They are not substitutes for a working set, so they are only offered when you are swapping
// one of them. ponytail: a name match, because the dataset has no field that says so.
const SOFT = /stretch|warm ?up|mobility|foam roll/

// The library carries the same lift several times over, filmed from different angles —
// "barbell full squat (side pov)". Swapping to one of those is swapping to what you are
// already doing, so the parenthetical variants of the source drop out.
const baseName = n => String(n || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim()

// Same primary target is the signal; shared movement words and secondary muscles rank within
// it; the same body part breaks the remaining ties.
//
// A *different* implement is worth almost as much as a shared movement word, because the
// reason you are reading this list is usually that someone is on the machine. Four more
// variants of the press you cannot get to is not an answer. It is a preference, not a filter —
// the same machine's incline seat may well be free — so same-equipment options still rank,
// just below.
function score(src, srcMuscles, srcWords, e) {
  if (e.tg !== src.tg && e.bp !== src.bp) return 0      // a different lift entirely
  let n = e.tg === src.tg ? 4 : 0
  ;[...wordsOf(e)].forEach(w => { if (srcWords.has(w)) n += 3 })
  ;(e.sm || []).forEach(m => { if (srcMuscles.has(m)) n += 1 })
  if (e.bp === src.bp) n += 1
  if (e.eq !== src.eq) n += 2.5
  return n
}

/**
 * Exercises that train what this one trains, best match first.
 *
 * `exclude` is the rest of the session — offering a swap for something already on the list
 * is how you end up doing the same lift twice. `pool` takes allExercises(S) when custom
 * exercises should be in the running; it defaults to the shipped library.
 */
export function substitutesFor(idOrEx, { exclude = [], limit = 8, pool = EXDB } = {}) {
  const src = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!src || src.missing) return []
  const skip = new Set([src.id, ...exclude])
  const srcMuscles = musclesOf(src)
  const srcWords = wordsOf(src)
  // Cardio and lifting are not substitutes for each other in either direction; nor are a
  // stretch and a lift.
  const cardio = src.bp === 'cardio'
  const soft = SOFT.test(src.n || '')
  const base = baseName(src.n)
  return pool
    .filter(e => !skip.has(e.id) && (e.bp === 'cardio') === cardio && SOFT.test(e.n || '') === soft && baseName(e.n) !== base)
    .map(e => ({ e, s: score(src, srcMuscles, srcWords, e) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.e.n < b.e.n ? -1 : 1))
    .map(x => x.e)
    // Some exercises appear twice in the library under different ids; one row each.
    .filter((e, i, all) => all.findIndex(o => baseName(o.n) === baseName(e.n)) === i)
    .slice(0, limit)
}
