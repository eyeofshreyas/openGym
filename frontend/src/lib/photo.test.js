import { describe, it, expect } from 'vitest'
import { fitEdge, photoUrl } from './photo.js'

describe('fitEdge', () => {
  it('leaves an image already under the cap alone', () => {
    expect(fitEdge(800, 600, 1600)).toEqual({ w: 800, h: 600 })
  })

  it('scales the long side down to the cap, keeping aspect ratio', () => {
    expect(fitEdge(3200, 2400, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(fitEdge(2400, 3200, 1600)).toEqual({ w: 1200, h: 1600 })
  })

  it('never scales up', () => {
    expect(fitEdge(400, 300, 1600)).toEqual({ w: 400, h: 300 })
  })
})

describe('photoUrl', () => {
  it('cache-busts on the version so a replaced photo is refetched', () => {
    expect(photoUrl('w1', 123)).toBe('/api/photo?id=w1&v=123')
    expect(photoUrl('w1', 456)).not.toBe(photoUrl('w1', 123))
  })
})
