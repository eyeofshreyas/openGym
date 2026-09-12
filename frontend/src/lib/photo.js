// Workout cover photos. Resized/compressed here in the browser, then handed to the server as a
// plain PUT of JPEG bytes (see api/server.js's /api/photo routes) — the workout only carries a
// `photo` timestamp (it doubles as a cache-buster on replace); the bytes never touch synced state.

const MAX_EDGE = 1600
const QUALITY = 0.82

const photoBase = id => `/api/photo?id=${encodeURIComponent(id)}`
export const photoUrl = (id, v) => photoBase(id) + '&v=' + v

// Scales w×h down to fit within maxEdge on its longer side, never up — a 400px thumbnail
// shouldn't be blown up just because the cap is bigger than it.
export function fitEdge(w, h, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

// Downscales to at most MAX_EDGE on the long side and re-encodes as JPEG, so a multi-MB phone
// photo doesn't turn into a multi-MB upload.
function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { w, h } = fitEdge(img.width, img.height, MAX_EDGE)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('could not encode image')), 'image/jpeg', QUALITY)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('could not read image'))
    img.src = URL.createObjectURL(file)
  })
}

// Opens the native picker (camera or library) and resolves the chosen file, or null if the
// user backed out. A cancelled <input type=file> fires no `change` event in most browsers, so
// cancellation is inferred from the window regaining focus with nothing picked.
export function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'
    let done = false
    const finish = v => { if (done) return; done = true; window.removeEventListener('focus', onFocus); resolve(v) }
    const onFocus = () => setTimeout(() => finish(null), 300)
    input.onchange = () => finish(input.files[0] || null)
    window.addEventListener('focus', onFocus)
    input.click()
  })
}

export async function uploadPhoto(workoutId, file) {
  const blob = await compress(file)
  const r = await fetch(photoBase(workoutId), { method: 'POST', body: blob })
  if (!r.ok) throw new Error('upload failed')
  return Date.now()
}

export function deletePhoto(workoutId) {
  return fetch(photoBase(workoutId), { method: 'DELETE' }).catch(() => {})
}
