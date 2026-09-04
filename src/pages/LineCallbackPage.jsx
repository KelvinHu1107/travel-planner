import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  signInWithCustomToken,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth'
import { auth } from '../services/firebase'
import { createUserProfile } from '../services/firestore'
import { exchangeLineCode } from '../services/lineAuth'

export default function LineCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const lineError = params.get('error')

    if (lineError) {
      setError('已取消 LINE 登入')
      return
    }

    // Decode state — it's base64 JSON with { nonce, redirectUri }.
    // This avoids relying on localStorage, which is not shared between
    // LINE's in-app browser and Safari on iOS.
    let redirectUri = localStorage.getItem('line_oauth_redirect_uri')
    localStorage.removeItem('line_oauth_state')
    localStorage.removeItem('line_oauth_redirect_uri')

    if (!code || !state) {
      setError('授權參數無效，請重新登入')
      return
    }

    try {
      const decoded = JSON.parse(atob(state))
      if (!decoded.nonce || !decoded.redirectUri) throw new Error('bad state')
      redirectUri = decoded.redirectUri
    } catch {
      // state is not the encoded format — reject
      setError('授權參數無效，請重新登入')
      return
    }

    async function doAuth() {
      try {
        const { customToken, displayName, pictureUrl } = await exchangeLineCode(code, redirectUri)
        await setPersistence(auth, browserLocalPersistence)
        localStorage.setItem('tc_remember_me', 'true')
        const { user } = await signInWithCustomToken(auth, customToken)
        await createUserProfile({
          uid: user.uid,
          email: user.email ?? '',
          displayName: displayName || user.displayName || '',
          photoURL: pictureUrl || user.photoURL || '',
        })
        navigate('/', { replace: true })
      } catch (err) {
        console.error('[LINE 登入錯誤]', err)
        setError(err.message || 'LINE 登入失敗，請再試一次')
      }
    }

    doAuth()
  }, [navigate])

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <p style={{ fontSize: 15, fontWeight: 900, color: '#92400E', textAlign: 'center' }}>
          {error}
        </p>
        <button
          onClick={() => navigate('/auth', { replace: true })}
          style={{
            padding: '10px 24px', borderRadius: 10, background: '#7C3AED',
            color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          返回登入頁
        </button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
    }}>
      <img src="https://loosedrawing.com/assets/media/illustrations/png/933.png" alt="" style={{ width: 120, height: 120, objectFit: 'contain', opacity: 0.85 }} />
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>LINE 登入中…</p>
    </div>
  )
}
