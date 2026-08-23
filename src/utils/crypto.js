// 使用瀏覽器內建 Web Crypto API，不需額外依賴
export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPassword(password, hash) {
  const inputHash = await hashPassword(password)
  return inputHash === hash
}
