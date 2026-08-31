const LINE_CHANNEL_ID = import.meta.env.VITE_LINE_CHANNEL_ID

function makeNonce() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// Standard OAuth redirect — for Android LINE browser and regular browsers.
// iOS LINE browser uses the LIFF <a> link in AuthPage instead.
export function redirectToLineLogin() {
  const nonce = makeNonce()
  const redirectUri = `${window.location.origin}/auth/line/callback`

  // Encode redirectUri into state so LineCallbackPage doesn't need localStorage
  // (important for cross-browser flows like iOS LINE→Safari).
  const state = btoa(JSON.stringify({ nonce, redirectUri }))
  localStorage.setItem('line_oauth_state', state)
  localStorage.setItem('line_oauth_redirect_uri', redirectUri)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID,
    redirect_uri: redirectUri,
    state,
    scope: 'profile openid',
  })

  window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`
}

export async function exchangeLineCode(code, redirectUri) {
  const res = await fetch('/api/lineAuth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'LINE 驗證失敗')
  }
  return res.json()
}
