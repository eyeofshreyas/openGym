# On-device Gemma plan builder — handoff

**Written:** 2026-09-05 · **Branch:** `develop` · **State:** code complete, **never executed**

Read this first when picking the work back up. The companion documents are
[the design](2026-09-05-on-device-gemma-plan-builder-design.md) *(in `../specs/`)*,
[the plan](2026-09-05-on-device-gemma-plan-builder.md), and
[the execution log](2026-09-05-on-device-gemma-plan-builder-execution-log.md).

## The one thing that matters

**No line of this feature has ever run.** Every task was verified by compiling
(`./gradlew assembleDebug`), by the 220-test suite, and by code review — never on a device.
Task 0, the spike that was supposed to prove MediaPipe can load a model beside the WebView
on an 8 GB phone, **has not been run**. It was skipped on the user's explicit instruction
after being flagged twice.

So the honest status is: *this compiles and has been reviewed hard, and it might not work at all.*

## What is built

| Task | Commit | What |
|---|---|---|
| 1 | `5dce992` | `lib/coach.js` — exercise shortlist + prompt building (9 tests) |
| 2 | `e570324` | `lib/coach.js` — model output → plan bundle (15 tests) |
| 3 | `1eb2951`, `7454f91` | `GemmaPlugin.java` — model file install/remove, double-tap guard |
| 4 | `8da8f9e`, `036a2c2` | MediaPipe inference, engine-race fix, `abiFilters`, APK 62 MB → 20 MB |
| 5 | `25f0202` | `lib/gemma.js` bridge + Settings model row |
| 6 | `dd64180`, `bcd8eac`, *(round 2 in flight)* | Brief sheet + Plan entry point, concurrent-generate guard |
| 0 | — | **NOT RUN** — the device spike |
| 7 | — | **NOT DONE** — MOBILE.md, README, CHANGELOG |

Supporting commits: `1a26f30` (execution log), `c5e0165` (`*.deb` ignored), `7a4156e`
(`*.task`, `*.litertlm`, `gemma-*/` ignored).

## The blocker that ended the session

Two things were needed to run Task 0, and neither landed:

**1. The right model file.** The design assumed an E2B-class Gemma ships as a MediaPipe
`.task` for Android. **It does not, any more:**

- `google/gemma-3n-E2B-it-litert-lm` → only `.litertlm`, no `.task`
- `litert-community/gemma-4-E2B-it-litert-lm` → one `.task`, and it is the **web/WASM** build
- Google's docs now call the MediaPipe LLM Inference API **"in maintenance mode"**; LiteRT-LM
  is the current path

What was downloaded is `gemma-4-E2B-it.litertlm` (2.59 GB), which **our plugin cannot load** —
wrong runtime. It sits outside git in `gemma-4-E2B/` and is ignored.

**The decision taken** was to spike with a small model that genuinely is a MediaPipe `.task`,
because it answers the real question cheaply and settles both options:

```bash
huggingface-cli download litert-community/Gemma3-1B-IT \
  gemma3-1b-it-int4.task --local-dir ~/gemma      # 555 MB
```

If 555 MB fails to load beside the WebView, 2.59 GB was never going to.

**2. ADB access to the Galaxy S24 FE.** The phone enumerates over USB, but exposes only
PTP (class `06`) and two CDC/ACM interfaces (`02`, `0a`). **The ADB interface — class `ff`,
subclass `42`, protocol `1` — never appears**, so `adb devices` stays empty. USB debugging was
reported on and the cable was replugged; it made no difference. Untried, in order of likelihood:

- **Samsung Auto Blocker** (Settings → Security and privacy → Auto Blocker) — on recent One UI
  this blocks USB commands outright while leaving file transfer working, which is exactly the
  observed symptom
- USB preference set to **File transfer / Android Auto** rather than images/PTP
- If ADB then appears but reports `no permissions`: `sudo apt install android-sdk-platform-tools-common`
  (this machine has no Android udev rules)

## When the device works — run this

```bash
cd frontend && npm run build:mobile
cd android && ANDROID_HOME=~/Android/Sdk JAVA_HOME=/opt/android-studio/jbr ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Then in the app: Settings → **AI plan builder** → *Choose a model file* → pick the `.task`.
Then Plan → **Build with AI**. Watch `adb logcat` and
`adb shell dumpsys meminfo ch.duartesantos.opengym` during generation.

Record what Task 0 was meant to record: **load time, generation time, peak PSS, whether the
app survived, and whether the GPU backend initialised or fell back to CPU.**

## Decision waiting for you

If the 1B model loads but its plans are poor, the options are:

- **Stay on MediaPipe + 1B.** No code change. But MediaPipe's LLM API is in maintenance mode,
  so this is building on something being wound down.
- **Migrate to LiteRT-LM + the E2B model already downloaded.** Google's current path, better
  model, keeps the 2.59 GB. Costs a rewrite of Task 4's inference half only —
  `com.google.ai.edge.litertlm:litertlm-android`, whose API is Kotlin-first (`Engine`,
  `engine.initialize()`, blocking `sendMessage()` is Java-callable) while this plugin is Java
  and the project has no Kotlin toolchain. **`coach.js`, `gemma.js` and the whole UI are
  unaffected either way** — only the plugin's inference half cares which runtime it talks to.

## What review caught that compiling never would

Worth knowing, because it is the argument for keeping the review loop on the remaining work:

- **Task 3** — `pickModel()` had no in-flight guard; a double-tap orphaned a `PluginCall` and hung
  its JS promise forever. Same bug family as `aecafd5` (passkey ceremonies).
- **Task 4** — `llm.close()` could run concurrently with an in-flight `generateResponse()` on the
  same native engine: a use-after-free, and the `catch (Throwable)` would not have caught it
  because it happens on another thread. Fixed by routing every unload through the single-thread
  pool rather than locking, which would have traded the crash for a 20–40 s main-thread ANR.
- **Task 6** — an unlocked sheet let a user dismiss mid-generation and start a *second*
  concurrent generation. Fixed at the root in `gemma.js` so every caller is covered. The first
  fix then introduced a worse regression — a permanently locked sheet with no idle exit — which
  the scoped re-review caught. Round 2 addresses it with a dynamic lock.

Three instances of the same bug family (unsettled promise / concurrent access) in one feature.
Whoever finishes this should assume there is a fourth.

## Known debt

- `coach.js` reaches React transitively via `exercises.js` → `i18n.js`, so it is not literally
  pure. Harmless today; matters only if generation ever moves to a worker.
- `coach.test.js` places its second `import` mid-file — legal ESM, would trip `import/first`.
- `GemmaPlugin`'s `ExecutorService` is never shut down, and `pool.execute()` is not itself
  wrapped. Unreachable today, but the two combine into a live bug if anyone adds a `shutdown()`.
- The APK is now `arm64-v8a` only, so it will not install on x86 emulators.
- Task 7's docs are unwritten: MOBILE.md, README and CHANGELOG say nothing about this feature.

## Unrelated, still uncommitted on `develop`

The user's own in-progress fixes, untouched by all of the above: passkey ceremony locks
(`lib/api.js`), the rest/work timer guard (`store/useUI.js`), admin poll deps (`Admin.jsx`),
Settings backup-import hardening (`Settings.jsx`), plus edits in `RoutineEdit.jsx` and
`Workout.jsx` and a `package-lock.json` version bump from installing the API's dependencies.

## Where the reasoning lives

Fourteen rulings — decisions taken without asking — are recorded in
[the execution log](2026-09-05-on-device-gemma-plan-builder-execution-log.md), each with what it
costs if wrong. The live ledger a resuming session reads is git-ignored scratch at
`.superpowers/sdd/2026-09-05-on-device-gemma-plan-builder/progress.md`, alongside every task
brief, implementer report and review package.
