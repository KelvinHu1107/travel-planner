const MAX_PX = 1500

export const IMAGE_LIMIT_MB = 5
export const BG_LIMIT_MB    = 10
export const TRIP_LIMIT_MB  = 100

function blobFromCanvas(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

// Try to decode an image file into a drawable object.
// Uses createImageBitmap first (wider format support), then falls back to HTMLImageElement.
// Returns null if the file can't be decoded within 8 seconds.
async function decodeImage(file) {
  try {
    return await Promise.race([
      createImageBitmap(file),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ])
  } catch (_) { /* fall through to HTMLImageElement */ }

  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    const timer = setTimeout(() => { URL.revokeObjectURL(url); resolve(null) }, 8000)
    img.onload  = () => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

export async function compressImage(file, maxMB = IMAGE_LIMIT_MB) {
  const maxBytes = maxMB * 1024 * 1024

  const decoded = await decodeImage(file)

  if (!decoded) {
    // Can't decode (e.g. HEIC on Chrome) — upload original if within limit
    if (file.size <= maxBytes) return file
    throw new Error(`無法解析此圖片格式（${file.type || file.name.split('.').pop()}），且超過 ${maxMB}MB 限制`)
  }

  let { width, height } = decoded
  const scale = Math.min(MAX_PX / width, MAX_PX / height, 1)
  width  = Math.round(width  * scale)
  height = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  canvas.getContext('2d').drawImage(decoded, 0, 0, width, height)
  decoded.close?.() // free ImageBitmap memory

  const baseName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  let quality = 0.72
  while (quality >= 0.20) {
    const blob = await blobFromCanvas(canvas, 'image/jpeg', quality)
    if (!blob) break
    if (blob.size <= maxBytes) return new File([blob], baseName, { type: 'image/jpeg' })
    quality -= 0.10
  }

  const blob = await blobFromCanvas(canvas, 'image/jpeg', 0.20)
  if (blob) return new File([blob], baseName, { type: 'image/jpeg' })

  return file // final fallback: return original
}

export function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1)
}
