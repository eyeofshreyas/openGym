# On-device Gemma Plan Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the standalone Android app build a week of routines from a plain-language brief, using a Gemma model running on the phone, with no server and no network call.

**Architecture:** Gemma only *selects and arranges* exercises from a shortlist openGym hands it; sets, reps and progression stay with `defaultConfig()` and the existing progression engine. The model's JSON is coerced into a plan bundle, resolved through `matchExercise()`, and handed to the existing `parsePlan()` → `planImportSheet()` → `mergePlan()` path, so nothing reaches stored data unreviewed. A Capacitor plugin (Java) wraps MediaPipe's `LlmInference` and owns the model file.

**Tech Stack:** React 19 + Zustand + Vite + vitest (frontend), Capacitor 7 (Android shell), MediaPipe `tasks-genai` (inference), Java 17 (plugin).

**Spec:** `docs/superpowers/specs/2026-09-05-on-device-gemma-plan-builder-design.md`

## Global Constraints

- **Target device:** Samsung Galaxy S24 FE — Exynos 2400e, 8 GB RAM, Android 14+.
- **Model:** E2B-class on-device Gemma, int4 quantized, ~1.5–2 GB. **Not** a 4B variant — the app is a WebView and the two do not fit in 8 GB together.
- **The model is unloaded** after every generation and on app pause. It is never resident while the user is logging sets.
- **The model never produces numbers.** Sets, reps, weights, increments and progression rules come from `defaultConfig()` and the routine's progression policy. If a task has the model emitting a rep count, the task is wrong.
- **Android only.** The entry point does not exist on iOS or on web; `lib/gemma.js` is a no-op outside a Capacitor Android build.
- **No new npm dependency.** The file picker is native (`ACTION_OPEN_DOCUMENT`) because a ~2 GB file cannot cross the JS bridge.
- **No new merge logic.** Generated plans go through `parsePlan()` and `mergePlan()` exactly as an imported plan file does, and are added as new routines — never overwriting.
- **Existing patterns:** user-facing strings go through `t()` from `lib/i18n.js`; English is the source string, other locales are added later. Tests are vitest, colocated as `src/lib/<name>.test.js`.
- **minSdkVersion moves 23 → 24** (MediaPipe's floor). Android 7.0+.

### Correction to the spec

The spec says `@capacitor/filesystem` copies the chosen model file. **It cannot** — Filesystem takes base64 through the JS bridge and a 2 GB model would exhaust the WebView heap. The native plugin does the pick-and-copy with a streamed 1 MB buffer instead (Task 3). Nothing else in the spec changes.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/coach.js` (new) | Pure: candidate shortlist, prompt text, model-output coercion into a plan bundle. No Capacitor, no React. |
| `frontend/src/lib/coach.test.js` (new) | Unit tests for the above, using recorded model output as fixtures. |
| `frontend/src/lib/gemma.js` (new) | Thin bridge to the native plugin. No-op off Android. |
| `frontend/android/app/src/main/java/ch/duartesantos/opengym/GemmaPlugin.java` (new) | Model file lifecycle + MediaPipe inference. |
| `frontend/android/app/src/main/java/ch/duartesantos/opengym/MainActivity.java` (modify) | Register the plugin. |
| `frontend/android/app/build.gradle`, `frontend/android/variables.gradle` (modify) | MediaPipe dependency, minSdk bump. |
| `frontend/src/lib/plan-share.js` (modify) | Export `PLAN_FMT` so `coach.js` can stamp a bundle. |
| `frontend/src/sheets.jsx` (modify) | The brief sheet: constraints in, generation, hand off to `planImportSheet`. |
| `frontend/src/views/Settings.jsx` (modify) | Model file row: install, size, remove. |
| `frontend/src/views/Plan.jsx` (modify) | "Build with AI" entry point, shown only when a model is installed. |

---

### Task 0: Device spike — throwaway

**This task gates every other task.** Its output is an answer, not code you keep. The whole feature rests on MediaPipe loading a Gemma model on an Exynos 2400e beside a live WebView, which nobody has verified.

**Files:**
- Create (throwaway, do not commit): a scratch branch or local edit of `GemmaPlugin.java` and a button that calls it

- [ ] **Step 1: Confirm the model variant and get the file**

Open https://ai.google.dev/gemma/docs — identify the current on-device variant (Gemma 3n E2B or Gemma 4 E2B) and download the int4 MediaPipe `.task` / `.litertlm` build from Kaggle or Hugging Face. Record the exact filename and byte size; later tasks refer to it only as "the model file".

- [ ] **Step 2: Confirm the MediaPipe artifact version**

Check https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/android for the current `com.google.mediapipe:tasks-genai` version and whether the API is `LlmInference.generateResponse(prompt)` directly or requires an `LlmInferenceSession`. **Write the answer down — Task 4's code assumes the direct form and must be adjusted if it has changed.**

- [ ] **Step 3: Push the model to the device**

```bash
adb push <model-file> /data/local/tmp/gemma-model.task
```

- [ ] **Step 4: Minimal load-and-generate**

Add the dependency to `frontend/android/app/build.gradle`, bump `minSdkVersion` to 24 in `frontend/android/variables.gradle`, and in `MainActivity.onCreate` (temporarily) run:

```java
long t0 = System.currentTimeMillis();
LlmInference llm = LlmInference.createFromOptions(this,
    LlmInference.LlmInferenceOptions.builder()
        .setModelPath("/data/local/tmp/gemma-model.task")
        .setMaxTokens(1024)
        .build());
android.util.Log.i("GemmaSpike", "load ms=" + (System.currentTimeMillis() - t0));
t0 = System.currentTimeMillis();
String out = llm.generateResponse("Reply with JSON only: {\"routines\":[{\"name\":\"Push\",\"day\":1,\"exercises\":[\"barbell bench press\"]}]}");
android.util.Log.i("GemmaSpike", "gen ms=" + (System.currentTimeMillis() - t0) + " out=" + out);
llm.close();
```

- [ ] **Step 5: Run on the S24 FE and record the numbers**

```bash
cd frontend && npm run build:mobile && npx cap open android   # run on the device
adb logcat -s GemmaSpike
adb shell dumpsys meminfo ch.duartesantos.opengym   # during generation
```

Record: load time, generation time, peak PSS, whether the app survived, and whether the GPU backend initialised or fell back to CPU (visible in logcat).

- [ ] **Step 6: Decide**

- Loads and generates without an OOM kill, generation under ~60 s → **proceed to Task 1**.
- OOM or minutes-long generation → **stop**. Report the numbers. The fallback is the server-side path for the PWA flavour, which the spec already sketches and which reuses all of `coach.js`.

- [ ] **Step 7: Revert the spike**

```bash
git checkout -- frontend/android
```

Keep only the recorded numbers and the two version answers from Steps 1–2.

---

### Task 1: Candidate shortlist and prompt building

**Files:**
- Create: `frontend/src/lib/coach.js`
- Test: `frontend/src/lib/coach.test.js`

**Interfaces:**
- Consumes: `EXDB` from `lib/exercises.js`
- Produces: `MAX_EX = 8`, `MAX_DAYS = 6`, `candidateExercises(equipment, limit?) → string[]`, `buildPrompt({days, equipment, goal, limits}, candidates) → string`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/coach.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { candidateExercises, buildPrompt, MAX_EX } from './coach.js'
import { EXIDX } from './exercises.js'

describe('candidateExercises', () => {
  it('returns only exercises using the equipment asked for', () => {
    const names = candidateExercises(['barbell'])
    expect(names.length).toBeGreaterThan(10)
    const byName = new Map(Object.values(EXIDX).map(e => [e.n, e]))
    names.forEach(n => expect(byName.get(n).eq).toBe('barbell'))
  })

  it('never returns cardio — the builder plans lifting', () => {
    const byName = new Map(Object.values(EXIDX).map(e => [e.n, e]))
    candidateExercises([]).forEach(n => expect(byName.get(n).bp).not.toBe('cardio'))
  })

  it('honours the limit and stays well under the full library', () => {
    expect(candidateExercises([], 50)).toHaveLength(50)
    expect(candidateExercises([]).length).toBeLessThanOrEqual(200)
  })

  it('spreads across body parts rather than exhausting one', () => {
    const byName = new Map(Object.values(EXIDX).map(e => [e.n, e]))
    const parts = new Set(candidateExercises([], 40).map(n => byName.get(n).bp))
    expect(parts.size).toBeGreaterThan(4)
  })

  it('returns nothing for equipment no exercise uses', () => {
    expect(candidateExercises(['moon rocks'])).toEqual([])
  })
})

describe('buildPrompt', () => {
  const p = () => buildPrompt(
    { days: 4, equipment: ['barbell', 'dumbbell'], goal: 'strength', limits: 'bad left shoulder' },
    ['barbell bench press', 'dumbbell curl']
  )

  it('states the day count, goal and limitations', () => {
    expect(p()).toContain('4')
    expect(p()).toContain('strength')
    expect(p()).toContain('bad left shoulder')
  })

  it('lists every candidate and nothing else to choose from', () => {
    expect(p()).toContain('barbell bench press')
    expect(p()).toContain('dumbbell curl')
  })

  it('demands JSON and forbids numbers', () => {
    const s = p()
    expect(s).toContain('"routines"')
    expect(s.toLowerCase()).toContain('json')
    expect(s).toMatch(/do not include sets, reps or weights/i)
    expect(s).toContain(String(MAX_EX))
  })

  it('omits empty optional fields instead of writing blanks', () => {
    const s = buildPrompt({ days: 3, equipment: [], goal: '', limits: '' }, ['squat'])
    expect(s).not.toMatch(/Goal:/)
    expect(s).not.toMatch(/Limitations/)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/lib/coach.test.js
```

Expected: FAIL — `Failed to resolve import "./coach.js"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/coach.js`:

```js
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
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/lib/coach.test.js
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/coach.js frontend/src/lib/coach.test.js
git commit -m "Plan builder: exercise shortlist and prompt"
```

---

### Task 2: Coerce model output into a plan bundle

**Files:**
- Modify: `frontend/src/lib/coach.js`
- Modify: `frontend/src/lib/plan-share.js:16` (export `PLAN_FMT`)
- Test: `frontend/src/lib/coach.test.js`

**Interfaces:**
- Consumes: `MAX_EX`, `MAX_DAYS` from Task 1; `matchExercise` from `lib/import-csv.js`; `defaultConfig` from `lib/history.js`; `parsePlan`, `PLAN_FMT` from `lib/plan-share.js`; `uid`, `todayISO` from `lib/format.js`; `DEFAULT_GLYPH` from `lib/glyphs.js`
- Produces:
  - `coercePlan(text) → {routines: [{name: string, day: number|null, names: string[]}]} | null`
  - `planBundleFrom(coerced) → {bundle, unmatched: number}`
  - `planFromModel(text) → parsedBundle | null` — the parsed shape `planImportSheet()` takes, with `dropped` already including unmatched names

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/coach.test.js`:

```js
import { coercePlan, planBundleFrom, planFromModel, MAX_DAYS } from './coach.js'

const GOOD = JSON.stringify({
  routines: [
    { name: 'Push', day: 1, exercises: ['bench press', 'lateral raise'] },
    { name: 'Pull', day: 3, exercises: ['barbell row', 'lat pulldown'] },
  ],
})

describe('coercePlan', () => {
  it('reads a clean response', () => {
    const c = coercePlan(GOOD)
    expect(c.routines).toHaveLength(2)
    expect(c.routines[0]).toEqual({ name: 'Push', day: 1, names: ['bench press', 'lateral raise'] })
  })

  it('digs the JSON out of prose and code fences', () => {
    expect(coercePlan('Sure! Here you go:\n```json\n' + GOOD + '\n```\nHope that helps.').routines).toHaveLength(2)
  })

  it('returns null for junk rather than throwing', () => {
    expect(coercePlan('I cannot help with that.')).toBeNull()
    expect(coercePlan('{ broken json')).toBeNull()
    expect(coercePlan('')).toBeNull()
    expect(coercePlan(null)).toBeNull()
  })

  it('returns null when no routine has any exercise', () => {
    expect(coercePlan('{"routines":[{"name":"Push","day":1,"exercises":[]}]}')).toBeNull()
  })

  it('clamps a padded routine to MAX_EX and drops duplicates', () => {
    const many = Array.from({ length: 20 }, (_, i) => 'ex' + i).concat('ex0')
    const c = coercePlan(JSON.stringify({ routines: [{ name: 'A', day: 1, exercises: many }] }))
    expect(c.routines[0].names).toHaveLength(MAX_EX)
    expect(new Set(c.routines[0].names).size).toBe(MAX_EX)
  })

  it('caps the week at MAX_DAYS routines', () => {
    const rs = Array.from({ length: 9 }, (_, i) => ({ name: 'R' + i, day: i % 7, exercises: ['squat'] }))
    expect(coercePlan(JSON.stringify({ routines: rs })).routines).toHaveLength(MAX_DAYS)
  })

  it('nulls a day that is out of range, not an integer, or already taken', () => {
    const c = coercePlan(JSON.stringify({ routines: [
      { name: 'A', day: 9, exercises: ['squat'] },
      { name: 'B', day: 'monday', exercises: ['squat'] },
      { name: 'C', day: 1, exercises: ['squat'] },
      { name: 'D', day: 1, exercises: ['squat'] },
    ] }))
    expect(c.routines.map(r => r.day)).toEqual([null, null, 1, null])
  })

  it('names an unnamed routine instead of leaving it blank', () => {
    const c = coercePlan('{"routines":[{"day":1,"exercises":["squat"]}]}')
    expect(c.routines[0].name).toBe('Routine 1')
  })
})

describe('planBundleFrom', () => {
  it('resolves names to library ids and fills in sets and reps', () => {
    const { bundle, unmatched } = planBundleFrom(coercePlan(GOOD))
    expect(unmatched).toBe(0)
    expect(bundle.routines).toHaveLength(2)
    const ex = bundle.routines[0].ex[0]
    expect(ex.id).toBe('0025')            // the alias table maps "bench press" here
    expect(ex.sets).toBe(3)
    expect(ex.reps).toBe(10)
    expect(bundle.week).toEqual({ 1: bundle.routines[0].id, 3: bundle.routines[1].id })
  })

  it('counts names it cannot resolve and leaves them out', () => {
    const { bundle, unmatched } = planBundleFrom(coercePlan(
      '{"routines":[{"name":"A","day":1,"exercises":["bench press","hyperbolic quad blaster"]}]}'
    ))
    expect(unmatched).toBe(1)
    expect(bundle.routines[0].ex).toHaveLength(1)
  })

  it('drops a routine whose every exercise was unresolvable, and its weekday with it', () => {
    const { bundle } = planBundleFrom(coercePlan('{"routines":[{"name":"A","day":2,"exercises":["zzzz nonsense"]}]}'))
    expect(bundle.routines).toHaveLength(0)
    expect(bundle.week).toEqual({})
  })

  it('gives every routine a distinct id', () => {
    const { bundle } = planBundleFrom(coercePlan(GOOD))
    expect(bundle.routines[0].id).not.toBe(bundle.routines[1].id)
  })
})

describe('planFromModel', () => {
  it('produces a bundle parsePlan accepts, ready for the import sheet', () => {
    const p = planFromModel(GOOD)
    expect(p.routineCount).toBe(2)
    expect(p.exerciseCount).toBe(4)
    expect(p.scheduledDays).toBe(2)
  })

  it('reports unmatched names through the sheet’s dropped count', () => {
    const p = planFromModel('{"routines":[{"name":"A","day":1,"exercises":["bench press","zzzz nonsense"]}]}')
    expect(p.dropped).toBe(1)
  })

  it('returns null when nothing usable survives', () => {
    expect(planFromModel('nope')).toBeNull()
    expect(planFromModel('{"routines":[{"name":"A","exercises":["zzzz nonsense"]}]}')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/lib/coach.test.js
```

Expected: FAIL — `coercePlan is not a function`.

- [ ] **Step 3: Export `PLAN_FMT`**

In `frontend/src/lib/plan-share.js`, line 16:

```js
// was: const PLAN_FMT = 1
export const PLAN_FMT = 1
```

- [ ] **Step 4: Write the implementation**

Append to `frontend/src/lib/coach.js` (and add the imports at the top of the file):

```js
import { matchExercise } from './import-csv.js'
import { defaultConfig } from './history.js'
import { parsePlan, PLAN_FMT } from './plan-share.js'
import { uid, todayISO } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'
```

```js
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
```

- [ ] **Step 5: Run the whole suite**

```bash
cd frontend && npm test
```

Expected: PASS — 196 existing tests plus the new ones, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/coach.js frontend/src/lib/coach.test.js frontend/src/lib/plan-share.js
git commit -m "Plan builder: coerce model output into a plan bundle"
```

---

### Task 3: Native plugin — model file lifecycle

No inference yet. This task ends with a model file installable and removable from the phone, verified on device.

**Files:**
- Create: `frontend/android/app/src/main/java/ch/duartesantos/opengym/GemmaPlugin.java`
- Modify: `frontend/android/app/src/main/java/ch/duartesantos/opengym/MainActivity.java`
- Modify: `frontend/android/variables.gradle`

**Interfaces:**
- Produces (JS-visible plugin `Gemma`): `status() → {installed: boolean, bytes: number}`, `pickModel() → {installed, bytes}`, `removeModel() → {installed, bytes}`

- [ ] **Step 1: Raise the SDK floor**

In `frontend/android/variables.gradle`, line 2:

```gradle
minSdkVersion = 24
```

MediaPipe's tasks libraries do not build below 24. Android 7.0 (2016) is the new floor.

- [ ] **Step 2: Write the plugin**

Create `frontend/android/app/src/main/java/ch/duartesantos/opengym/GemmaPlugin.java`:

```java
package ch.duartesantos.opengym;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * On-device Gemma for the plan builder.
 *
 * The model file is picked and copied here rather than in JS: it is ~2 GB, and
 * @capacitor/filesystem moves file contents as base64 across the WebView bridge, which
 * would exhaust the heap long before the copy finished.
 */
@CapacitorPlugin(name = "Gemma")
public class GemmaPlugin extends Plugin {

    private static final String MODEL_NAME = "gemma-model.task";
    private final ExecutorService pool = Executors.newSingleThreadExecutor();

    private File modelFile() {
        return new File(getContext().getFilesDir(), MODEL_NAME);
    }

    private JSObject statusObject() {
        File f = modelFile();
        boolean ok = f.exists() && f.length() > 0;
        JSObject r = new JSObject();
        r.put("installed", ok);
        r.put("bytes", ok ? f.length() : 0);
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void pickModel(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "modelPicked");
    }

    @ActivityCallback
    private void modelPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.reject("cancelled");
            return;
        }
        // Streamed in 1 MB blocks on a background thread — a couple of gigabytes must
        // never touch the main thread or the bridge.
        pool.execute(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(modelFile())) {
                if (in == null) throw new IllegalStateException("cannot open file");
                byte[] buf = new byte[1 << 20];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                call.resolve(statusObject());
            } catch (Exception e) {
                modelFile().delete();   // a half-copied model is worse than none
                call.reject(e.getMessage() == null ? "copy failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void removeModel(PluginCall call) {
        modelFile().delete();
        call.resolve(statusObject());
    }
}
```

- [ ] **Step 3: Register the plugin**

Replace `frontend/android/app/src/main/java/ch/duartesantos/opengym/MainActivity.java` with:

```java
package ch.duartesantos.opengym;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GemmaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

- [ ] **Step 4: Verify it compiles and runs on the device**

```bash
cd frontend && npm run build:mobile && npx cap open android
```

Build and run on the S24 FE. In Android Studio's Logcat, confirm the app launches with no plugin registration error.

- [ ] **Step 5: Verify the file lifecycle by hand**

In Chrome, open `chrome://inspect`, attach to the app's WebView, and in its console:

```js
const { registerPlugin } = window.Capacitor
const G = registerPlugin('Gemma')
await G.status()                       // { installed: false, bytes: 0 }
await G.pickModel()                    // pick the model file — expect { installed: true, bytes: ~1.5e9 }
await G.status()                       // still installed after the picker closed
await G.removeModel()                  // { installed: false, bytes: 0 }
```

Confirm `pickModel` on a cancelled picker rejects with `cancelled` and leaves `installed: false`.

- [ ] **Step 6: Commit**

```bash
git add frontend/android
git commit -m "Plan builder: native model file install and removal"
```

---

### Task 4: Native plugin — inference

**Files:**
- Modify: `frontend/android/app/src/main/java/ch/duartesantos/opengym/GemmaPlugin.java`
- Modify: `frontend/android/app/build.gradle`

**Interfaces:**
- Consumes: the model file installed by Task 3
- Produces: `generate({prompt: string}) → {text: string}`, `unload() → void`

> **From Task 0, Step 2:** if the current MediaPipe release requires an `LlmInferenceSession` rather than `LlmInference.generateResponse(prompt)`, adjust `generate()` accordingly — build the session, `addQueryChunk(prompt)`, then `generateResponse()`. Everything else in this task is unchanged.

- [ ] **Step 1: Add the dependency**

In `frontend/android/app/build.gradle`, inside `dependencies { … }`, using the version recorded in Task 0:

```gradle
    implementation 'com.google.mediapipe:tasks-genai:<version-from-task-0>'
```

- [ ] **Step 2: Add inference to the plugin**

In `GemmaPlugin.java`, add the import and the fields/methods below (keeping everything from Task 3):

```java
import com.google.mediapipe.tasks.genai.llminference.LlmInference;
```

```java
    private LlmInference llm;

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt");
        if (prompt == null || prompt.isEmpty()) { call.reject("no prompt"); return; }
        if (!modelFile().exists()) { call.reject("no model"); return; }
        pool.execute(() -> {
            try {
                if (llm == null) {
                    llm = LlmInference.createFromOptions(
                        getContext(),
                        LlmInference.LlmInferenceOptions.builder()
                            .setModelPath(modelFile().getAbsolutePath())
                            .setMaxTokens(1024)
                            .build());
                }
                String text = llm.generateResponse(prompt);
                JSObject r = new JSObject();
                r.put("text", text == null ? "" : text);
                call.resolve(r);
            } catch (Throwable e) {
                // An OOM here is a Throwable, not an Exception, and the engine must go
                // with it — a half-initialised LlmInference will fail every later call.
                unloadModel();
                call.reject(e.getMessage() == null ? "generation failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        unloadModel();
        call.resolve();
    }

    /** The app is a WebView; the model does not stay resident behind it. */
    @Override
    protected void handleOnPause() {
        unloadModel();
    }

    private synchronized void unloadModel() {
        if (llm != null) {
            try { llm.close(); } catch (Throwable ignored) { }
            llm = null;
        }
    }
```

Also update `removeModel` so a removal cannot leave the engine holding a deleted file:

```java
    @PluginMethod
    public void removeModel(PluginCall call) {
        unloadModel();
        modelFile().delete();
        call.resolve(statusObject());
    }
```

And in `modelPicked`, add `unloadModel();` as the first line inside the `pool.execute` lambda, so replacing a model doesn't leave the old one loaded.

- [ ] **Step 3: Verify on the device**

Rebuild, run, attach to the WebView, and in its console:

```js
const G = window.Capacitor.registerPlugin('Gemma')
await G.pickModel()
const t0 = Date.now()
const r = await G.generate({ prompt: 'Reply with JSON only: {"routines":[{"name":"Push","day":1,"exercises":["barbell bench press"]}]}' })
console.log(Date.now() - t0, r.text)
await G.unload()
```

Expected: JSON-ish text back within the time Task 0 measured, and no crash. Then background the app mid-generation and confirm it does not crash on return.

- [ ] **Step 4: Commit**

```bash
git add frontend/android
git commit -m "Plan builder: on-device generation through MediaPipe"
```

---

### Task 5: JS bridge and the Settings row

**Files:**
- Create: `frontend/src/lib/gemma.js`
- Modify: `frontend/src/views/Settings.jsx`

**Interfaces:**
- Consumes: the `Gemma` plugin from Tasks 3–4; `MOBILE` from `lib/mobile.js`
- Produces: `modelStatus() → Promise<{installed, bytes}>`, `pickModel()`, `removeModel()`, `generate(prompt) → Promise<string>`, `unload()`

- [ ] **Step 1: Write the bridge**

Create `frontend/src/lib/gemma.js`:

```js
// Bridge to the native Gemma plugin (Android, standalone app only).
//
// Every export resolves to a harmless value off Android, so callers never have to ask
// which platform they are on — the plan builder simply reports no model installed and
// its entry point stays hidden.
import { MOBILE } from './mobile.js'

const NONE = { installed: false, bytes: 0 }
let plugin

async function nativePlugin() {
  if (!MOBILE) return null
  if (plugin !== undefined) return plugin
  try {
    const { registerPlugin, Capacitor } = await import('@capacitor/core')
    plugin = Capacitor.getPlatform() === 'android' ? registerPlugin('Gemma') : null
  } catch (e) { plugin = null }
  return plugin
}

export async function modelStatus() {
  const p = await nativePlugin()
  if (!p) return NONE
  try { return await p.status() } catch (e) { return NONE }
}

export async function pickModel() {
  const p = await nativePlugin()
  if (!p) return NONE
  return p.pickModel()          // rejects with "cancelled" — the caller decides what that means
}

export async function removeModel() {
  const p = await nativePlugin()
  if (!p) return NONE
  try { return await p.removeModel() } catch (e) { return NONE }
}

export async function generate(prompt) {
  const p = await nativePlugin()
  if (!p) throw new Error('unavailable')
  const r = await p.generate({ prompt })
  return (r && r.text) || ''
}

export async function unload() {
  const p = await nativePlugin()
  if (p) await p.unload().catch(() => {})
}
```

- [ ] **Step 2: Add the Settings row**

In `frontend/src/views/Settings.jsx`, add the imports:

```js
import { modelStatus, pickModel, removeModel } from '../lib/gemma.js'
import { MOBILE } from '../lib/mobile.js'
```

`useEffect`, `useState`, `Row`, `confirmSheet` and `t` are already imported in this file.

Add this component above the default export:

```jsx
// The model file is user-supplied: Gemma's weights are licence-gated, and an app with no
// accounts and no server has nothing to authenticate a download with.
function ModelRow() {
  const [st, setSt] = useState(null)
  useEffect(() => { modelStatus().then(setSt) }, [])
  if (!MOBILE || !st) return null
  const gb = st.bytes ? (st.bytes / 1e9).toFixed(1) + ' GB' : ''
  const install = () => pickModel().then(setSt).catch(() => {})
  return <>
    <h4 className="sec">{t('AI plan builder')}</h4>
    <div className="sect-b">
      {st.installed
        ? <Row icon="sparkles" iconTint="var(--acc)" title={t('Model installed')} subtitle={gb} />
        : <Row icon="sparkles" iconTint="var(--grey)" title={t('Choose a model file')}
            subtitle={t('A Gemma .task file on this phone. Plans are then built offline, on the device.')}
            accessory="chevron" onClick={install} />}
      {st.installed && <Row icon="trash" iconTint="var(--red)" title={t('Remove model')} danger
        onClick={() => confirmSheet({
          title: t('Remove the model?'), message: t('The file is deleted from this phone. The plan builder stops working until you choose another.'),
          confirmText: t('Remove'), danger: true,
          onConfirm: () => removeModel().then(setSt),
        })} />}
    </div>
  </>
}
```

Render `<ModelRow />` inside the Settings page, directly after the profile/account section.

- [ ] **Step 3: Verify on web (the feature must be invisible)**

```bash
cd frontend && npm run dev
```

Open Settings in the browser: **no** "AI plan builder" section appears. Confirm no console errors.

- [ ] **Step 4: Verify on the device**

```bash
cd frontend && npm run build:mobile && npx cap open android
```

In Settings on the S24 FE: choose a model file, see the size, remove it, see the row return to "Choose a model file".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/gemma.js frontend/src/views/Settings.jsx
git commit -m "Plan builder: model file management in Settings"
```

---

### Task 6: The brief sheet and the Plan entry point

**Files:**
- Modify: `frontend/src/sheets.jsx`
- Modify: `frontend/src/views/Plan.jsx`

**Interfaces:**
- Consumes: `candidateExercises`, `buildPrompt`, `planFromModel` (Tasks 1–2); `generate`, `unload`, `modelStatus` (Task 5); `planImportSheet` (existing)
- Produces: `aiPlanSheet()` — opens the brief sheet

- [ ] **Step 1: Write the sheet**

In `frontend/src/sheets.jsx`, add the imports:

```js
import { candidateExercises, buildPrompt, planFromModel } from './lib/coach.js'
import { generate, unload } from './lib/gemma.js'
```

`EXDB`, `equipmentOf`, `Stepper`, `Button`, `toast`, `useState` and `planImportSheet` are
already in scope in this file — do not re-import them.

Add near the other plan sheets:

```jsx
export const aiPlanSheet = () => ui().openSheet(close => <AiPlan close={close} />)

function AiPlan({ close }) {
  const st = useStore(s => s.S)
  const [days, setDays] = useState(3)
  const [equip, setEquip] = useState([])
  const [goal, setGoal] = useState('')
  const [limits, setLimits] = useState('')
  const [busy, setBusy] = useState(false)
  const allEquip = equipmentOf(EXDB).slice(0, 12)

  const build = async () => {
    setBusy(true)
    try {
      const text = await generate(buildPrompt({ days, equipment: equip, goal, limits }, candidateExercises(equip)))
      const parsed = planFromModel(text)
      if (!parsed) { toast(t('Couldn’t build a plan from that — try again, or add more detail.')); return }
      close()
      planImportSheet(parsed)
    } catch (e) {
      toast(t('Plan builder failed: {0}', e.message || 'error'))
    } finally {
      setBusy(false)
      unload()          // the model does not stay resident behind the WebView
    }
  }

  return <>
    <h3>{t('Build a plan')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('Runs on this phone — nothing is sent anywhere. You review everything before it’s added.')}
    </div>
    <div className="row cfgrow" style={{ marginBottom: 16 }}>
      <Stepper label={t('Days per week')} value={days} step={1} decimal={false}
        onChange={v => setDays(Math.min(6, Math.max(1, Math.round(v) || 1)))} />
    </div>
    <h4 className="sec">{t('Equipment you have')}</h4>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {allEquip.map(eq => <button key={eq} className={'tag' + (equip.includes(eq) ? ' acc' : '')}
        onClick={() => setEquip(x => x.includes(eq) ? x.filter(y => y !== eq) : [...x, eq])}>{t(eq)}</button>)}
    </div>
    <div className="dim small" style={{ marginBottom: 16 }}>{t('Pick none to allow anything.')}</div>
    <input className="input" placeholder={t('Goal — strength, muscle, general fitness…')}
      value={goal} maxLength={80} onChange={e => setGoal(e.target.value)} />
    <div style={{ height: 8 }} />
    <textarea className="input" rows={2} maxLength={200} placeholder={t('Anything to work around? Injuries, time per session…')}
      value={limits} onChange={e => setLimits(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="sparkles" disabled={busy} onClick={build}>
      {busy ? t('Building… this takes a moment') : t('Build my week')}
    </Button>
    {busy && <><div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button></>}
  </>
}
```

- [ ] **Step 2: Add the Plan screen entry point**

In `frontend/src/views/Plan.jsx`, add the imports:

```js
import { useEffect, useState } from 'react'
import { aiPlanSheet } from '../sheets.jsx'          // extend the existing sheets import
import { modelStatus } from '../lib/gemma.js'
```

Inside `Plan()`, above the return:

```jsx
  // Only offered when a model file is actually installed — a disabled button that never
  // explains itself is worse than no button.
  const [hasModel, setHasModel] = useState(false)
  useEffect(() => { modelStatus().then(s => setHasModel(s.installed)) }, [])
```

And next to the existing "New" button:

```jsx
        {hasModel && <Button size="sm" variant="tinted" icon="sparkles" onClick={aiPlanSheet}>{t('Build with AI')}</Button>}
```

- [ ] **Step 3: Verify the feature is absent on web**

```bash
cd frontend && npm run dev
```

The Plan screen shows only "New" — no "Build with AI". Run `npm test`: still green.

- [ ] **Step 4: Verify end to end on the device**

Rebuild, install the model in Settings, then on the Plan screen: **Build with AI** → 4 days, barbell + dumbbell, goal "strength" → **Build my week**. Expect the import preview sheet with routines and a day count, then Add, then routines on the Plan screen with sets and reps filled in. Open one in the routine editor and confirm the progression rule is the routine default.

Also confirm: cancelling mid-generation closes the sheet; a second generation works after the first (the model reloads); backgrounding during generation doesn't crash the app.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sheets.jsx frontend/src/views/Plan.jsx
git commit -m "Plan builder: the brief sheet and the Plan entry point"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/MOBILE.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document it in MOBILE.md**

Add a section after the flavour comparison table:

```markdown
## AI plan builder (Android)

The standalone Android app can build a week of routines from a plain-language brief,
using a Gemma model that runs on the phone. Nothing is sent anywhere — there is no
server in this flavour and the builder adds no network call.

The model file is not shipped with the app: Gemma's weights are licence-gated, and
openGym has no account to authenticate a download with. Download an **int4 E2B-class
Gemma `.task` build** (~1.5–2 GB) from Kaggle or Hugging Face onto the phone, then
Settings → **AI plan builder** → *Choose a model file*.

Larger variants are not recommended on an 8 GB phone: the app is a WebView, and a 4B
model resident beside it invites the OS to kill the app mid-generation.

The model only chooses and arranges exercises. Sets, reps, loads and progression come
from openGym's own defaults and progression rules, and every generated plan goes through
the same review sheet as an imported plan file before anything is added.
```

- [ ] **Step 2: Add it to the README feature list**

After the "Share a plan" bullet:

```markdown
- 🤖 **Build a week with on-device AI** (Android app) — describe your days, equipment and
  goal and a Gemma model *running on the phone* drafts the split. No account, no API key,
  no network call. It only picks and arranges the exercises: sets, reps and progression
  stay with openGym's own rules, and you review the whole plan before it's added
```

- [ ] **Step 3: Add a CHANGELOG entry**

At the top of `CHANGELOG.md`, following the existing style:

```markdown
## Unreleased

### Build a week with on-device AI (Android)

The Android app can draft a weekly split from a plain-language brief, using a Gemma model
you install on the phone. It runs entirely on the device — no account, no API key, no
network call.

- 🤖 **The model picks and arranges; openGym keeps the numbers.** Sets, reps, loads and
  progression come from the same defaults and rules a hand-built routine uses, so a plan
  drafted this way behaves exactly like one you wrote yourself.
- **Reviewed before it lands.** Generated plans go through the same preview as an imported
  plan file, are added as new routines, and never overwrite what you have.
- **Bring your own model.** Gemma's weights are licence-gated, so you download the file and
  point Settings at it. An int4 E2B-class build (~1.5–2 GB) is the right size for a phone.
```

- [ ] **Step 4: Commit**

```bash
git add docs/MOBILE.md README.md CHANGELOG.md
git commit -m "Document the on-device plan builder"
```

---

## Notes for the executor

- **Task 0 is a gate, not a formality.** If the spike fails, stop and report — the fallback
  (server-side generation for the self-hosted flavour) reuses all of `coach.js` and none of
  Tasks 3–5, so nothing after Task 2 should be built on a failed spike.
- **Tasks 1 and 2 need no device.** They are pure functions with real tests and can be done
  and reviewed while the model file downloads.
- **Tasks 3–6 cannot be verified without the S24 FE.** There is no Android test harness in
  this repo and this plan does not add one; every native step ends in a manual check on the
  device, spelled out in the step.
- **This branch is `develop`,** which carries unrelated uncommitted work in `api.js`,
  `useUI.js`, `Admin.jsx`, `Settings.jsx` and `Workout.jsx`. Stage only the files each task
  names.
