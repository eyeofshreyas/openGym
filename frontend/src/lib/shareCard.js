// Turns a workout's cover photo into a Strava-style shareable image: the photo itself, a dark
// gradient at the bottom for legibility, the workout name and its stats line, and a small
// openGym wordmark in the corner — composited on a <canvas>, never touching the server.
// Untested (canvas/Image/Blob work has no pure logic to extract, and the test setup here has
// no DOM/canvas environment) — verified by hand in the browser instead.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not load photo'))
    img.src = src
  })
}

export async function buildShareCard(photoSrc, title, statsLine) {
  const img = await loadImage(photoSrc)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  const gradTop = canvas.height * 0.55
  const grad = ctx.createLinearGradient(0, gradTop, 0, canvas.height)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,.75)')
  ctx.fillStyle = grad
  ctx.fillRect(0, gradTop, canvas.width, canvas.height - gradTop)

  const pad = canvas.width * 0.06
  const titleSize = Math.round(canvas.height * 0.062)
  const statsSize = Math.round(canvas.height * 0.026)
  const markSize = Math.round(canvas.height * 0.03)
  // Canvas text silently falls back to a system font until the face is actually loaded —
  // waiting here is the difference between a branded card and one that looks generic.
  await Promise.all([
    document.fonts.load(`${titleSize}px "Bebas Neue"`),
    document.fonts.load(`${statsSize}px "IBM Plex Mono"`),
    document.fonts.load(`${markSize}px "Bebas Neue"`)
  ])

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#eef0e6'
  ctx.font = `${titleSize}px "Bebas Neue"`
  ctx.fillText(title.toUpperCase(), pad, canvas.height - canvas.height * 0.1)

  ctx.fillStyle = 'rgba(238,240,230,.85)'
  ctx.font = `${statsSize}px "IBM Plex Mono"`
  ctx.fillText(statsLine, pad, canvas.height - canvas.height * 0.05)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(238,240,230,.92)'
  ctx.font = `${markSize}px "Bebas Neue"`
  ctx.fillText('OPENGYM', canvas.width - pad, pad + markSize)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('could not render image')), 'image/jpeg', 0.92))
}

// The share sheet on a phone, a plain download everywhere else (desktop browsers, or a phone
// browser that doesn't implement the Web Share File API yet).
export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: 'image/jpeg' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return }
    catch (e) { if (e.name === 'AbortError') return }   // user backed out of the share sheet
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
