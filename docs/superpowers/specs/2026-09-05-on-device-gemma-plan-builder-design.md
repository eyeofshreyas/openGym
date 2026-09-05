# On-device Gemma plan builder — design

**Date:** 2026-09-05
**Status:** design approved, not yet planned or built
**Target device:** Samsung Galaxy S24 FE (Exynos 2400e, 8 GB RAM) — standalone Android APK

## Context

openGym's one real gap against Hevy is program *generation* (see the Hevy gap analysis:
openGym already beats free Hevy on progression, effort scales, muscle mapping and
language coverage, but it has no answer to "build me a plan" — its answer today is "you
bring the plan").

The goal is to close that gap with Google's Gemma running **on the phone**, in the
standalone APK, with no server and no network call. That constraint is not incidental:
`docs/MOBILE.md` states the mobile flavour never talks to a backend — no sign-in, no
sync, no telemetry — and a plan builder that phoned home would be the first thing in the
app to break that promise.

Rejected alternatives, and why:

- **Google's hosted Gemini/Gemma API** — sends training data to Google, contradicts the
  README's entire pitch.
- **Server-side Gemma behind the self-hosted API** — smaller build, better model, but the
  APK has no backend to call. Viable later for the PWA flavour; out of scope here.
- **Bundled Ollama in docker-compose** — irrelevant to a phone-only feature, and several
  GB of image on a project that runs on a NAS.

## Decisions

### Model: the E2B-class on-device Gemma, int4 (~1.5–2 GB)

Not the 4B variant. openGym on Android is a Capacitor **WebView** app: Chrome WebView,
the 1,324-exercise dataset and GIF decoding already hold several hundred MB. On 8 GB with
One UI underneath, a ~2.9 GB 4B model resident beside that WebView invites the OS to kill
the app mid-generation. E2B leaves headroom, and the model is unloaded the moment
generation finishes. Moving to E4B later is a config change, not a redesign.

**To confirm at build time** (both post-date the design and neither changes anything
below): the current on-device variant name — Gemma 3n E2B vs Gemma 4 E2B — and that a
MediaPipe-ready `.task` / `.litertlm` build exists for it.

### Division of labour: Gemma selects and arranges; openGym keeps the numbers

A 2B-class model writing a periodized program from scratch produces plausible-sounding
mediocrity. openGym already owns the parts a small model is worst at: `defaultConfig()`
knows sensible sets and reps per exercise, and the progression engine (linear, Greyskull
LP, double progression) already decides loads and explains each one.

So the model's job is narrowed to what a small model is actually decent at:

| | |
|---|---|
| **In** | Days per week, available equipment, injuries/limitations, goal — plus a **shortlisted candidate list** of exercise names from the library, filtered by the equipment the user selected. A few hundred names, never all 1,324. |
| **Out** | A split: routine names, which candidate exercises go in each, which weekday each lands on. |
| **Never out** | Sets, reps, weights, increments, progression rules. Those come from `defaultConfig()` and the routine's progression policy, exactly as they do for a hand-built routine. |

This collapses the JSON the model must produce to:

```json
{"routines": [{"name": "Push", "day": 1, "exercises": ["Barbell Bench Press", "..."]}]}
```

which an E2B model in constrained-decoding mode can hit reliably.

## Architecture

```
Plan screen ─ "Build with AI" (shown only when a model file is installed)
        │
        ▼
  prompt sheet — days/week, equipment, goal, free-text limitations
        │
        ▼
  lib/coach.js  buildPrompt(constraints, candidates)
        │             candidates = library filtered by equipmentOf() — reuses the
        │             existing equipment filter, never the whole dataset
        ▼
  lib/gemma.js ─▶ GemmaPlugin (Kotlin) ─▶ MediaPipe LlmInference
        │             load → generate → unload
        ▼
  lib/coach.js  coercePlan(text)
        │             JSON.parse → matchExercise() per name (reused from the CSV
        │             importer) → drop unresolvable → clamp → weekday keys
        ▼
  parsePlan()  ─▶  existing PlanImport preview sheet  ─▶  mergePlan()
                    adds routines with fresh ids, never overwrites
```

Everything from `parsePlan()` onward already ships and is already exercised by the plan
import/export path. The feature adds no new merge logic and cannot overwrite existing
routines.

### Reused, not rebuilt

| Existing | Used for |
|---|---|
| `lib/import-csv.js` → `matchExercise(name)` | Resolving model-written exercise names to library ids (curated aliases → word-bag → containment) |
| `lib/plan-share.js` → `parsePlan()`, `mergePlan()` | Validating the bundle and merging as new routines |
| `sheets.jsx` → `PlanImport` | The review-before-merge preview |
| `lib/exercises.js` → `equipmentOf()`, `EXIDX` | Building the candidate shortlist |
| `lib/history.js` → `defaultConfig()` | Sets/reps for every generated exercise |
| `@capacitor/filesystem` (already a dependency) | Copying the chosen model file into app storage |

### New code

| File | Purpose |
|---|---|
| `android/.../GemmaPlugin.kt` | Capacitor plugin: `available()`, `load()`, `generate(prompt)`, `unload()` |
| `frontend/src/lib/coach.js` | Prompt building, candidate shortlist, JSON coercion — pure functions |
| `frontend/src/lib/gemma.js` | Bridge to the plugin; a no-op on web so the feature is absent in a browser |
| `frontend/src/lib/coach.test.js` | Unit tests over recorded model outputs |
| `sheets.jsx`, `views/Settings.jsx` | Prompt sheet; model-file row |
| `frontend/android` Gradle | MediaPipe `tasks-genai` dependency |

### No token streaming

The output is JSON, not prose — there is nothing readable to stream. A spinner with a
working cancel is the honest UI for a 20–40 s generation.

## Model file lifecycle: bring your own

Gemma weights are licence-gated on Kaggle and Hugging Face. An app with no accounts, no
store presence and no server cannot fetch them silently, and openGym should not pretend
otherwise.

Settings gains an **AI plan builder** row:

- **Choose model file** — system file picker, copies the `.task` into app-private storage
- Shows the installed file's name and size, with **Remove**
- No model installed → the Plan screen's "Build with AI" entry point does not exist

This mirrors the existing backup-import flow, avoids a 2 GB APK, and dodges the auth
problem entirely.

## Failure modes

| Condition | Behaviour |
|---|---|
| No model file installed | Feature hidden entirely — not a disabled button |
| Model fails to load / OOM | Toast, unload, feature stays available for a retry |
| Non-JSON or junk output | Coerce; if fewer than one valid routine survives, say so and offer one retry. Never a partial merge |
| Unmatched exercise names | Dropped, counted, surfaced in the preview ("3 exercises couldn't be matched") |
| Absurd output | Clamped: ≤ 8 exercises per routine, ≤ 6 training days, deduped within a routine |
| User cancels | Generation aborted, model unloaded |
| App backgrounded mid-generation | Unload on pause — Android will otherwise reclaim the process |

Every path ends either in the review sheet or in a toast. Nothing reaches stored data
without the user seeing it first.

## Testing

**`coach.test.js`** — pure unit tests, no model, runs in CI beside the existing vitest
suite:

- `buildPrompt()` includes only equipment-matching candidates, and never the full library
- `coercePlan()` against recorded fixtures: valid output, junk text, JSON with unknown
  exercise names, a 20-exercise day, missing/duplicate weekdays, empty routines
- Coerced output survives `parsePlan()` — the contract between the two modules

**On-device, manual** — the parts no unit test can reach: first-load wall-clock, resident
memory beside the WebView, whether the Exynos GPU backend initialises or falls back to
CPU, generation time for a full week.

## Build order — spike first

The feature is gated on an unproven assumption: that MediaPipe has a Gemma build which
loads on an Exynos 2400e *alongside* a live WebView, within the memory an 8 GB phone
leaves free.

**Step 0 is a throwaway spike**: the Kotlin plugin, a model load, one hardcoded
generation, printing memory and wall-clock on the actual S24 FE. No UI, no prompt design,
no `coach.js`. If it OOMs or the load takes minutes, the design changes (smaller model,
or the server-side path for the PWA flavour instead) and nothing built so far is wasted.

Only if the spike holds do the remaining steps run: `coach.js` + tests (pure, no device),
then the plugin proper, then the Settings row, then the prompt sheet and Plan entry point.

## Out of scope

- iOS. MediaPipe has an iOS LLM path, but the target is an S24 FE; the entry point stays
  hidden on iOS until someone wants it.
- The PWA / self-hosted flavour. The server-proxy design (`POST /api/coach/plan` to a
  configured Ollama) is a clean later addition behind the same UI, and the whole of
  `coach.js` is reusable for it — only `gemma.js` swaps out.
- Anything the model writes beyond selection and arrangement: loads, progression,
  deloads, exercise substitution mid-session, coaching chat.
