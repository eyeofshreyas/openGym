import { describe, it, expect } from 'vitest'
import { buildPlanBundle, parsePlan, mergePlan, planPrintHTML } from './plan-share.js'

// A routine whose exercise carries a cue. '0001' is a built-in id, so nothing is dropped
// as unresolvable on the way back in.
const state = () => ({
  unit: 'kg', week: { 1: 'r1' }, routines: [
    { id: 'r1', name: 'Push', emoji: null, ex: [{ id: '0001', sets: 3, mode: 'reps', reps: 10, weight: 40, note: 'seat at 4, elbows tucked' }] }
  ], customEx: []
})

describe('exercise notes travel with a shared plan', () => {
  it('survives export → parse → merge', () => {
    const bundle = parsePlan(JSON.stringify(buildPlanBundle(state(), 'me')))
    const draft = { routines: [], customEx: [], week: {} }
    mergePlan(draft, bundle)
    expect(draft.routines[0].ex[0].note).toBe('seat at 4, elbows tucked')
  })

  it('is trimmed to a sane length on the way out', () => {
    const s = state()
    s.routines[0].ex[0].note = 'x'.repeat(900)
    const out = buildPlanBundle(s, 'me')
    expect(out.routines[0].ex[0].note).toHaveLength(500)
  })

  it('is left out entirely when there is no note', () => {
    const s = state()
    delete s.routines[0].ex[0].note
    expect(buildPlanBundle(s, 'me').routines[0].ex[0]).not.toHaveProperty('note')
  })

  it('prints escaped, so a note can never inject markup into the PDF', () => {
    const s = state()
    s.routines[0].ex[0].note = '<script>x</script>'
    const html = planPrintHTML(s, 'me')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>x</script>')
  })
})
