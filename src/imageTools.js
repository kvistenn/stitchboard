// Billeder på lærredet (browser-delen – selve beregningerne ligger i colors.js)
import { averageBlocks } from './colors'

/** Indlæser en billedfil. Returnerer { img, url } – url frigives med URL.revokeObjectURL når billedet fjernes */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Billedet kunne ikke læses'))
    }
    img.src = url
  })
}

/**
 * Billedet skaleret til w×h felter: gennemsnitsfarven i hvert felt ({r,g,b}, eller null hvor billedet
 * er gennemsigtigt). Hvert felt måles på op til 8×8 pixels.
 */
export function sampleImage(img, w, h) {
  const k = Math.max(1, Math.min(8, Math.floor(Math.sqrt(1_500_000 / (w * h)))))
  const canvas = document.createElement('canvas')
  canvas.width = w * k
  canvas.height = h * k
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return averageBlocks(ctx.getImageData(0, 0, canvas.width, canvas.height).data, w, h, k)
}
