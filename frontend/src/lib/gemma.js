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

// ponytail: throwaway browser mock to click through the AI flow without an Android build —
// revert this block once you're done testing.
const MOCK = true
const MOCK_PLAN = JSON.stringify({ routines: [
  { name: 'Push', day: 1, exercises: ['Barbell Bench Press', 'Barbell Incline Bench Press', 'Dumbbell Standing Overhead Press', 'Dumbbell Lateral Raise', 'Cable Triceps Pushdown (V-Bar)', 'Chest Dip'] },
  { name: 'Legs', day: 5, exercises: ['Barbell Bench Press'] },
] })

export async function modelStatus() {
  if (MOCK && !MOBILE) return { installed: true, bytes: 555e6 }
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

// Only one generation can run on the native engine at a time — a second call while one is
// outstanding could have its result torn down by the first call's `finally { unload() }`.
// Guard here, not just in the sheet, so every caller (now and later) is covered.
let generating = false
export async function generate(prompt) {
  if (generating) throw new Error('a generation is already in progress')
  generating = true
  try {
    if (MOCK && !MOBILE) { await new Promise(r => setTimeout(r, 800)); return MOCK_PLAN }
    const p = await nativePlugin()
    if (!p) throw new Error('unavailable')
    const r = await p.generate({ prompt })
    return (r && r.text) || ''
  } finally {
    generating = false
  }
}

export async function unload() {
  if (MOCK && !MOBILE) return
  const p = await nativePlugin()
  if (p) await p.unload().catch(() => {})
}
