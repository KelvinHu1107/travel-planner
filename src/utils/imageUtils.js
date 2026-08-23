// Canvas-based image compression before Firebase Storage upload
const MAX_PX = 1000 // resize longer edge to ≤ 1000px

export const IMAGE_LIMIT_MB  = 5
export const BG_LIMIT_MB     = 10
export const TRIP_LIMIT_MB   = 100

// Compress an image File to JPEG ≤ maxMB using Canvas
export function compressImage(file, maxMB = IMAGE_LIMIT_MB) {
  const maxBytes = maxMB * 1024 * 1024

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      const scale = Math.min(MAX_PX / width, MAX_PX / height, 1)
      width  = Math.round(width  * scale)
      height = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      let quality = 0.65 // start with strong compression
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('圖片壓縮失敗')); return }
          if (blob.size <= maxBytes || quality <= 0.20) {
            const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
            resolve(new File([blob], name, { type: 'image/jpeg' }))
          } else {
            quality -= 0.10
            tryCompress()
          }
        }, 'image/jpeg', quality)
      }
      tryCompress()
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('無法讀取圖片'))
    }
    img.src = objectUrl
  })
}

export function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1)
}
