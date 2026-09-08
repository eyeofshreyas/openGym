// What to actually put on the bar.
//
// Everything here works in hundredths as integers. 2.5 and 1.25 are exactly the values that
// make a naive subtracting loop leave 0.30000000000000004 on the bar and then ask for a plate
// nobody makes, and this is a calculator whose only job is to be right about small numbers.

// The commercial-gym set, used when a profile hasn't said otherwise.
export const BAR = { kg: 20, lb: 45 }
export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

const unitOf = S => (S && S.unit === 'lb' ? 'lb' : 'kg')

/** The bar this profile loads, falling back to the standard one for its unit. */
export const barOf = S => (S && S.bar > 0 ? S.bar : BAR[unitOf(S)])

/** The plates this profile owns, heaviest first. An explicit empty list is a real answer. */
export const platesOf = S => {
  const p = S && S.plates
  return (Array.isArray(p) ? [...p] : [...PLATES[unitOf(S)]]).sort((a, b) => b - a)
}

const H = v => Math.round(Number(v) * 100)

/**
 * How to load `target` on a `bar` from `plates`, per side.
 *
 * Greedy from the heaviest plate, which is exact for every standard set. Where the target
 * cannot be made it loads as close as it can from below and says how far short that is —
 * a calculator that silently rounded 102.5 down to 100 would have you log a lift you did
 * not do, which is worse than admitting the gap.
 *
 * ponytail: plates are unlimited. Modelling "I own exactly two 20s" needs a count per plate
 * in the setting and a different search — worth doing if home-gym users ask for it.
 */
export function platesFor(target, bar, plates) {
  const t = H(target), b = H(bar)
  // The bar alone is already past the target: there is nothing to add, and half of a
  // negative remainder would otherwise come back as a plate order.
  if (!(t > b)) return { perSide: [], achieved: bar, short: 0, underBar: t < b }

  let rem = (t - b) / 2
  const perSide = []
  ;(plates || []).map(H).filter(p => p > 0).sort((a, b2) => b2 - a).forEach(p => {
    const n = Math.floor(rem / p)
    if (n > 0) { perSide.push({ w: p / 100, n }); rem -= n * p }
  })
  const achieved = (b + (t - b) - rem * 2) / 100
  return { perSide, achieved, short: Math.round((target - achieved) * 100) / 100, underBar: false }
}
