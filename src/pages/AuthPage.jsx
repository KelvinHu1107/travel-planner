import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth, isLineInAppBrowser } from '../contexts/AuthContext'
import { redirectToLineLogin } from '../services/lineAuth'
import { useLanguage } from '../i18n/LanguageContext'

// ── 地圖導航背景動畫 ──────────────────────────
function MapBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')
    const TILE = 100   // grid tile size (block + road)
    const ROAD = 20    // road width
    const BLOCK = TILE - ROAD

    // Looping route in world space (last point = first for seamless loop)
    const RAW = [
      [0, 0], [400, 0], [400, -300], [200, -300],
      [200, -100], [600, -100], [600, 300], [300, 300],
      [300, 500], [-200, 500], [-200, 200], [0, 200], [0, 0],
    ]
    const waypoints = RAW.map(([x, y]) => ({ x, y }))

    const segments = []
    let totalLen = 0
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x
      const dy = waypoints[i].y - waypoints[i - 1].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segments.push({ dx, dy, len, angle: Math.atan2(dy, dx), start: waypoints[i - 1] })
      totalLen += len
    }

    const getPos = (d) => {
      let rem = ((d % totalLen) + totalLen) % totalLen
      for (const seg of segments) {
        if (rem <= seg.len) {
          const f = rem / seg.len
          return { x: seg.start.x + seg.dx * f, y: seg.start.y + seg.dy * f, angle: seg.angle }
        }
        rem -= seg.len
      }
      return { x: 0, y: 0, angle: 0 }
    }

    const blockColor = (wc, wr) => {
      const h = Math.abs(Math.sin(wc * 127.1 + wr * 311.7))
      if (h > 0.82) return 'rgba(130, 195, 100, 0.85)'   // park / green (more saturated)
      if (h > 0.55) return 'rgba(200, 188, 168, 0.95)'   // building A (darker)
      return 'rgba(180, 168, 148, 0.92)'                   // building B (darker)
    }

    let dist = 0
    let lastTs = null
    let raf

    const frame = (ts) => {
      if (!lastTs) lastTs = ts
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts
      dist += 75 * dt

      const pos = getPos(dist)
      const W = canvas.width
      const H = canvas.height
      const camX = pos.x - W / 2
      const camY = pos.y - H / 2

      ctx.clearRect(0, 0, W, H)

      // Road background (slightly darker for contrast)
      ctx.fillStyle = '#D8CEB8'
      ctx.fillRect(0, 0, W, H)

      // Tiled city blocks
      const startWC = Math.floor(camX / TILE) - 1
      const endWC   = Math.ceil((camX + W) / TILE) + 1
      const startWR = Math.floor(camY / TILE) - 1
      const endWR   = Math.ceil((camY + H) / TILE) + 1

      for (let wr = startWR; wr <= endWR; wr++) {
        for (let wc = startWC; wc <= endWC; wc++) {
          const sx = wc * TILE - camX + ROAD / 2
          const sy = wr * TILE - camY + ROAD / 2
          ctx.fillStyle = blockColor(wc, wr)
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(sx, sy, BLOCK, BLOCK, 6)
          else ctx.rect(sx, sy, BLOCK, BLOCK)
          ctx.fill()
        }
      }

      // Road center dashes (horizontal)
      ctx.strokeStyle = 'rgba(255,255,255,0.70)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([10, 14])
      for (let wr = startWR; wr <= endWR; wr++) {
        const sy = wr * TILE - camY + ROAD / 2
        ctx.beginPath()
        ctx.moveTo(0, sy)
        ctx.lineTo(W, sy)
        ctx.stroke()
      }
      // Road center dashes (vertical)
      for (let wc = startWC; wc <= endWC; wc++) {
        const sx = wc * TILE - camX + ROAD / 2
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, H)
        ctx.stroke()
      }
      ctx.setLineDash([])

      // World-space drawing (route + markers)
      ctx.save()
      ctx.translate(-camX, -camY)

      // Route path (dashed purple)
      ctx.strokeStyle = 'rgba(109, 40, 217, 0.80)'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash([14, 10])
      ctx.beginPath()
      ctx.moveTo(waypoints[0].x, waypoints[0].y)
      for (let i = 1; i < waypoints.length; i++) ctx.lineTo(waypoints[i].x, waypoints[i].y)
      ctx.stroke()
      ctx.setLineDash([])

      // Waypoint dots
      for (let i = 1; i < waypoints.length - 1; i++) {
        const wp = waypoints[i]
        ctx.fillStyle = 'rgba(124, 58, 237, 0.55)'
        ctx.beginPath()
        ctx.arc(wp.x, wp.y, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.beginPath()
        ctx.arc(wp.x, wp.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Destination pin (red circle at second-to-last waypoint)
      const dest = waypoints[waypoints.length - 2]
      ctx.fillStyle = 'rgba(220, 38, 38, 0.85)'
      ctx.beginPath()
      ctx.arc(dest.x, dest.y, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.arc(dest.x, dest.y, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      // Navigation arrow (always centered on screen)
      ctx.save()
      ctx.translate(W / 2, H / 2)
      ctx.rotate(pos.angle + Math.PI / 2)

      // Outer glow
      ctx.shadowColor = 'rgba(109, 40, 217, 0.80)'
      ctx.shadowBlur = 28

      // Arrow body (bigger, more visible)
      ctx.fillStyle = '#6D28D9'
      ctx.beginPath()
      ctx.moveTo(0, -20)
      ctx.lineTo(14, 16)
      ctx.lineTo(0, 8)
      ctx.lineTo(-14, 16)
      ctx.closePath()
      ctx.fill()

      // Border highlight
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, -20)
      ctx.lineTo(14, 16)
      ctx.lineTo(0, 8)
      ctx.lineTo(-14, 16)
      ctx.closePath()
      ctx.stroke()

      // Inner white dot
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.arc(0, 3, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        opacity: 0.45, pointerEvents: 'none',
      }}
    />
  )
}

// ── 錯誤資料庫：每個 code 對應 { title, desc, action } ──
const ERROR_MAP = {
  'auth/operation-not-allowed': {
    title: 'Google 登入尚未啟用',
    desc: 'Firebase 專案還沒有開啟 Google 登入方式。',
    action: '請到 Firebase Console → Authentication → Sign-in method → 點擊 Google → 啟用 → 填入支援 Email → 儲存',
  },
  'auth/popup-blocked': {
    title: '彈出視窗被瀏覽器封鎖',
    desc: '瀏覽器攔截了 Google 登入視窗。',
    action: '請在網址列右側點「允許彈出視窗」，或到瀏覽器設定 → 允許此網站顯示彈出視窗，再重新點擊登入',
  },
  'auth/popup-closed-by-user': {
    title: '登入視窗被關閉',
    desc: '你在完成授權前關閉了 Google 登入視窗。',
    action: '請重新點擊「使用 Google 帳號登入」按鈕，並在視窗中完成授權',
  },
  'auth/cancelled-popup-request': {
    title: '登入請求被取消',
    desc: '同時觸發了多個 Google 登入請求互相衝突。',
    action: '請稍等片刻後重新點擊「使用 Google 帳號登入」',
  },
  'auth/network-request-failed': {
    title: '網路連線失敗',
    desc: '無法連線到 Google 伺服器。',
    action: '請確認你的網路連線正常，或嘗試關閉 VPN / 代理後再試',
  },
  'auth/unauthorized-domain': {
    title: '此網域未獲授權',
    desc: '目前的網域不在 Firebase 的授權清單中。',
    action: '請到 Firebase Console → Authentication → Settings → Authorized domains → 新增目前的網域',
  },
  'auth/internal-error': {
    title: 'Firebase 設定錯誤',
    desc: '可能是 Firebase 設定或 Google 登入設定不完整。',
    action: '請確認 Firebase Console → Authentication → Google 已啟用並填入支援 Email，以及 .env.local 中的 VITE_FIREBASE_AUTH_DOMAIN 正確',
  },
  'auth/user-not-found': {
    title: '找不到這個帳號',
    desc: '這個 email 沒有對應的帳號。',
    action: '請確認 email 是否輸入正確，或切換到「建立帳號」tab 建立新帳號',
  },
  'auth/wrong-password': {
    title: '密碼錯誤',
    desc: '輸入的密碼與帳號不符。',
    action: '請再確認密碼，或點擊「忘記密碼？」透過 email 重設密碼',
  },
  'auth/invalid-credential': {
    title: 'Email 或密碼錯誤',
    desc: '帳號不存在或密碼不正確。',
    action: '請再確認 email 和密碼是否正確，或點「忘記密碼？」重設密碼',
  },
  'auth/email-already-in-use': {
    title: 'Email 已被使用',
    desc: '這個 email 已有帳號存在。',
    action: '請切換到「登入」tab 直接登入，或使用不同的 email 建立新帳號',
  },
  'auth/invalid-email': {
    title: 'Email 格式不正確',
    desc: '輸入的 email 格式有誤。',
    action: '請確認格式，例如：user@example.com',
  },
  'auth/weak-password': {
    title: '密碼強度不足',
    desc: '密碼至少需要 6 個字元。',
    action: '請設定至少 6 個字元的密碼，建議包含英文字母和數字',
  },
  'auth/too-many-requests': {
    title: '嘗試次數過多，帳號暫時鎖定',
    desc: '短時間內登入失敗太多次，Firebase 暫時封鎖了此帳號。',
    action: '請等待 5～10 分鐘後再試，或點「忘記密碼？」重設密碼來解鎖',
  },
  'auth/requires-recent-login': {
    title: '需要重新登入',
    desc: '這個操作需要最近的登入驗證。',
    action: '請登出後重新登入，再執行此操作',
  },
  'auth/google-user-not-found': {
    title: '這個 Google 帳號尚未註冊',
    desc: '你的 Google 帳號在 TripTogether 沒有對應帳號。',
    action: '請切換到「建立帳號」頁籤，用 Google 建立新帳號後再登入',
  },
}

function getErrInfo(code) {
  return ERROR_MAP[code] ?? {
    title: '發生未知錯誤',
    desc: `錯誤代碼：${code || '無'}`,
    action: '請重新整理頁面後再試。若問題持續，請聯絡管理員並提供上方錯誤代碼',
  }
}

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang, setLang } = useLanguage()
  const { currentUser, authLoading, redirectError, signInWithGoogle, signInWithEmail, signUpWithEmail, sendReset, signInWithLineToken } = useAuth()

  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/'

  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [errorCode, setErrorCode] = useState('')
  const [success, setSuccess]   = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem('tc_remember_me') !== 'false'
  )
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [springBtn, setSpringBtn] = useState(null)
  const [lineError, setLineError] = useState('')
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isIOSLineBrowser = isLineInAppBrowser && isIOS

  // liff.state=/auth?autoSignIn=1 brings us here after LIFF auth completes.
  // Call liff.init() to restore LIFF session, then exchange access token for Firebase custom token.
  const [isAutoSignIn] = useState(() =>
    new URLSearchParams(window.location.search).get('autoSignIn') === '1'
  )

  useEffect(() => {
    if (!authLoading && currentUser) navigate(redirectTo, { replace: true })
  }, [currentUser, authLoading, navigate])

  useEffect(() => {
    if (!isAutoSignIn || authLoading || currentUser) return
    window.history.replaceState({}, '', location.pathname)

    ;(async () => {
      try {
        const { default: liff } = await import('@line/liff')
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID })
        if (!liff.isLoggedIn()) throw new Error('未能取得 LINE 登入狀態，請重試')
        const accessToken = liff.getAccessToken()
        const res = await fetch('/api/lineAuthToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        })
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({}))
          throw new Error(error || 'LINE 驗證失敗')
        }
        const { customToken, displayName, pictureUrl } = await res.json()
        await signInWithLineToken(customToken, displayName, pictureUrl)
        navigate(redirectTo, { replace: true })
      } catch (err) {
        console.error('[LIFF 自動登入錯誤]', err)
        setLineError(err.message || 'LINE 登入失敗，請再試一次')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoSignIn, authLoading, currentUser])

  useEffect(() => {
    if (redirectError) setErrorCode(redirectError.code ?? 'unknown')
  }, [redirectError])

  const resetMode = (newMode) => {
    setMode(newMode)
    setErrorCode('')
    setSuccess('')
    if (newMode === 'forgot') setShowEmailForm(true)
  }

  const handleLine = () => {
    setLoading(true)
    setLineError('')
    redirectToLineLogin()
    // Page navigates away; if iOS LINE browser → opens Safari via openExternalBrowser=1
    // If anything synchronous fails, reset loading
  }

  const handleGoogle = () => {
    setErrorCode('')
    setLoading(true)
    signInWithGoogle(rememberMe)
      .then(() => navigate(redirectTo))
      .catch(err => {
        if (
          err.code === 'auth/popup-closed-by-user' ||
          err.code === 'auth/cancelled-popup-request'
        ) {
          setLoading(false)
          return
        }
        console.error('[Google 登入錯誤]', err)
        setErrorCode(err.code ?? 'unknown')
        setLoading(false)
      })
    // On mobile redirect flow, page navigates away — loading stays true intentionally.
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorCode('')
    setSuccess('')

    if (mode === 'register') {
      if (password !== confirm) { setErrorCode('passwords-mismatch'); return }
      if (password.length < 6)  { setErrorCode('auth/weak-password'); return }
    }

    setLoading(true)
    try {
      if (mode === 'forgot') {
        await sendReset(email)
        setSuccess('重設密碼連結已發送！請查看 email 信箱（記得看垃圾信件夾）')
        return
      }
      if (mode === 'register') {
        await signUpWithEmail(email, password, name)
      } else {
        await signInWithEmail(email, password, rememberMe)
      }
      navigate(redirectTo)
    } catch (err) {
      console.error('[Email 登入錯誤]', err.code, err.message)
      setErrorCode(err.code ?? 'unknown')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || (isAutoSignIn && !lineError)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 52 }}>✈️</div>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>{t('auth.loading.line')}</p>
    </div>
  )

  const isLogin    = mode === 'login'
  const isRegister = mode === 'register'
  const isForgot   = mode === 'forgot'

  const displayErrorCode = errorCode

  const getAuthError = (code) => {
    const keyMap = {
      'auth/user-not-found':        'auth.error.userNotFound',
      'auth/wrong-password':        'auth.error.wrongPassword',
      'auth/email-already-in-use':  'auth.error.emailInUse',
      'auth/weak-password':         'auth.error.weakPassword',
      'auth/invalid-email':         'auth.error.invalidEmail',
      'auth/too-many-requests':     'auth.error.tooManyRequests',
      'auth/network-request-failed':'auth.error.networkRequest',
      'auth/popup-closed-by-user':  'auth.error.popupClosed',
      'auth/operation-not-allowed': 'auth.error.operationNotAllowed',
    }
    return keyMap[code] ? t(keyMap[code]) : null
  }

  const getDisplayErrInfo = (code) => {
    if (code === 'passwords-mismatch') {
      return {
        title: t('auth.error.passwordMismatch.title'),
        desc: t('auth.error.passwordMismatch.desc'),
        action: t('auth.error.passwordMismatch.action'),
      }
    }
    const authMsg = getAuthError(code)
    if (authMsg) return { title: authMsg, desc: '', action: '' }
    return getErrInfo(code)
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ padding: '40px 24px' }}>

      {/* 地圖導航背景 */}
      <MapBackground />

      {/* Soft overlay glow */}
      <div className="glow-dot" style={{ width: 460, height: 460, background: 'rgba(215,160,70,0.16)', top: -120, left: -100 }} />
      <div className="glow-dot" style={{ width: 340, height: 340, background: 'rgba(180,120,50,0.10)', bottom: -60, right: -70 }} />

      {/* Logo */}
      <div className="relative z-10 text-center" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 18 }}>
          <img src="/favicon.svg" alt="TripTogether" style={{ width: 56, height: 56, flexShrink: 0 }} />
          <h1 style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1.15 }}>
            Trip<span style={{ color: '#7C3AED' }}>Together</span>
          </h1>
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: '#7C3AED',
            background: 'rgba(124,58,237,0.12)',
            border: '1px solid rgba(124,58,237,0.28)',
            borderRadius: 99,
            padding: '3px 9px',
            letterSpacing: '0.5px',
            alignSelf: 'center',
          }}>Beta</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginTop: 8 }}>
          {t('auth.subtitle')}
        </p>
        {/* Language toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          {['zh', 'en'].map(l => (
            <button key={l} onClick={() => setLang(l)} style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800,
              border: '1.5px solid rgba(124,58,237,0.30)',
              background: lang === l ? 'rgba(124,58,237,0.15)' : 'transparent',
              color: lang === l ? '#7C3AED' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {t(`common.lang.${l}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Auth 卡片 */}
      <div className="relative z-10 glass-card-glow" style={{ width: '100%', maxWidth: 420, padding: '30px 28px' }}>

        {/* 模式切換 tabs */}
        {!isForgot && (
          <div style={{ display: 'flex', marginBottom: 24, borderRadius: 14,
            background: 'rgba(165,125,65,0.10)', border: '1.5px solid rgba(165,125,65,0.18)', padding: 4 }}>
            {[['login', t('auth.tab.login')], ['register', t('auth.tab.register')]].map(([key, label]) => (
              <button key={key} onClick={() => resetMode(key)} style={{
                flex: 1, padding: '9px', borderRadius: 11, fontSize: 13, fontWeight: 900,
                background: mode === key ? 'rgba(255,252,243,0.98)' : 'transparent',
                color: mode === key ? 'var(--accent)' : 'var(--text-muted)',
                border: mode === key ? '1.5px solid rgba(180,83,9,0.22)' : '1.5px solid transparent',
                boxShadow: mode === key ? '0 2px 8px rgba(120,80,20,0.10)' : 'none',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        )}

        {/* 忘記密碼標頭 */}
        {isForgot && (
          <div style={{ marginBottom: 22 }}>
            <button onClick={() => resetMode('login')} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 900,
              color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>{t('auth.forgot.back')}</button>
            <h2 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', marginTop: 10 }}>{t('auth.forgot.title')}</h2>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('auth.forgot.desc')}
            </p>
          </div>
        )}

        {/* 登入方式按鈕群 */}
        {!isForgot && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* LINE 錯誤提示 */}
            {lineError && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 800,
                background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.28)',
                color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <span>⚠️ {lineError}</span>
                <button type="button" onClick={() => setLineError('')} style={{
                  background: 'none', border: 'none', color: '#DC2626', fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
                }}>✕</button>
              </div>
            )}

            {/* LINE 登入按鈕 */}
            {isIOSLineBrowser ? (
              // iOS LINE browser: <a> link so iOS can handle liff.line.me as a proper LIFF link.
              // window.location.href JS navigation bypasses Universal Link handling on iOS.
              <a
                href={`https://liff.line.me/${import.meta.env.VITE_LIFF_ID}?liff.state=${encodeURIComponent('/auth?autoSignIn=1')}`}
                style={{
                  width: '100%', padding: '13px', borderRadius: 14, fontSize: 14, fontWeight: 900,
                  background: '#06C755',
                  boxShadow: '0 4px 0 rgba(2,140,58,0.40), 0 6px 16px rgba(6,199,85,0.25)',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  textDecoration: 'none', boxSizing: 'border-box',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.630 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61V9.863h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.105.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.630 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                <span>{isLogin ? t('auth.line.login') : t('auth.line.register')}</span>
                <span style={{ fontSize: 10, fontWeight: 900, background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '2px 7px' }}>{t('auth.line.recommended')}</span>
              </a>
            ) : (
              <button
                onClick={handleLine}
                disabled={loading}
                className={springBtn === 'line' ? 'btn-press-spring' : undefined}
                style={{
                  width: '100%', padding: '13px', borderRadius: 14, fontSize: 14, fontWeight: 900,
                  background: loading ? 'rgba(6,199,85,0.5)' : '#06C755',
                  border: 'none',
                  boxShadow: '0 4px 0 rgba(2,140,58,0.40), 0 6px 16px rgba(6,199,85,0.25)',
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'transform 0.07s, box-shadow 0.07s',
                }}
                onMouseDown={e => { if (loading) return; e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(2,140,58,0.40), 0 2px 6px rgba(6,199,85,0.20)' }}
                onTouchStart={e => { if (loading) return; e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(2,140,58,0.40), 0 2px 6px rgba(6,199,85,0.20)' }}
                onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; if (!loading) setSpringBtn('line') }}
                onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; if (!loading) setSpringBtn('line') }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                onAnimationEnd={() => setSpringBtn(null)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.630 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61V9.863h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.105.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.630 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                <span>{loading ? t('auth.line.processing') : isLogin ? t('auth.line.login') : t('auth.line.register')}</span>
                {isLineInAppBrowser && !loading && (
                  <span style={{ fontSize: 10, fontWeight: 900, background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '2px 7px' }}>{t('auth.line.recommended')}</span>
                )}
              </button>
            )}

            {/* Google 登入按鈕 */}
            <button
              onClick={handleGoogle}
              disabled={loading || isLineInAppBrowser}
              className={springBtn === 'google' ? 'btn-press-spring' : undefined}
              style={{
                width: '100%', padding: '13px', borderRadius: 14, fontSize: 14, fontWeight: 900,
                background: 'linear-gradient(160deg,#ffffff 0%,#f0f0f0 100%)',
                border: '1.5px solid rgba(165,125,65,0.28)',
                boxShadow: isLineInAppBrowser
                  ? '0 2px 0 rgba(140,100,40,0.10), inset 0 1px 0 rgba(255,255,255,0.80)'
                  : '0 4px 0 rgba(140,100,40,0.18), 0 6px 16px rgba(120,80,20,0.09), inset 0 1.5px 0 rgba(255,255,255,0.95)',
                color: isLineInAppBrowser ? '#aaa' : '#3C3C3C',
                cursor: (loading || isLineInAppBrowser) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: (loading || isLineInAppBrowser) ? 0.50 : 1,
                transition: 'transform 0.07s, box-shadow 0.07s',
              }}
              onMouseDown={e => { if (loading || isLineInAppBrowser) return; e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(140,100,40,0.18), 0 2px 6px rgba(120,80,20,0.07), inset 0 1.5px 0 rgba(255,255,255,0.95)' }}
              onTouchStart={e => { if (loading || isLineInAppBrowser) return; e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(140,100,40,0.18), 0 2px 6px rgba(120,80,20,0.07), inset 0 1.5px 0 rgba(255,255,255,0.95)' }}
              onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; if (!loading && !isLineInAppBrowser) setSpringBtn('google') }}
              onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; if (!loading && !isLineInAppBrowser) setSpringBtn('google') }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
              onAnimationEnd={() => setSpringBtn(null)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? t('auth.line.processing')
                : isLineInAppBrowser ? t('auth.line.noSupport')
                : isLogin ? t('auth.google.login') : t('auth.google.register')}
            </button>

            {/* Email 按鈕（收合切換） */}
            <button
              type="button"
              onClick={() => setShowEmailForm(v => !v)}
              disabled={loading}
              className={springBtn === 'email' ? 'btn-press-spring' : undefined}
              style={{
                width: '100%', padding: '13px', borderRadius: 14, fontSize: 14, fontWeight: 900,
                background: showEmailForm
                  ? 'linear-gradient(160deg, #7C3AED 0%, #6D28D9 100%)'
                  : 'linear-gradient(160deg, #8B5CF6 0%, #7C3AED 100%)',
                border: 'none',
                boxShadow: showEmailForm
                  ? '0 1px 0 rgba(60,20,140,0.40), 0 2px 8px rgba(109,40,217,0.20), inset 0 1.5px 0 rgba(200,170,255,0.25)'
                  : '0 4px 0 rgba(60,20,140,0.35), 0 6px 16px rgba(109,40,217,0.22), inset 0 1.5px 0 rgba(200,170,255,0.30)',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'transform 0.07s, box-shadow 0.07s',
              }}
              onMouseDown={e => { if (loading) return; e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(60,20,140,0.40), 0 2px 6px rgba(109,40,217,0.18), inset 0 1.5px 0 rgba(200,170,255,0.20)' }}
              onTouchStart={e => { if (loading) return; e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(60,20,140,0.40), 0 2px 6px rgba(109,40,217,0.18), inset 0 1.5px 0 rgba(200,170,255,0.20)' }}
              onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; if (!loading) setSpringBtn('email') }}
              onTouchEnd={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; if (!loading) setSpringBtn('email') }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
              onAnimationEnd={() => setSpringBtn(null)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              {isLogin ? t('auth.email.login') : t('auth.email.register')}
            </button>
          </div>
        )}

        {/* Email 表單（可收合） */}
        {(showEmailForm || isForgot) && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: isForgot ? 0 : 16 }}>

            {/* 錯誤卡片 */}
            {errorCode && (
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1.5px solid rgba(220,38,38,0.30)' }}>
                <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.09)',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#DC2626', marginBottom: 3 }}>
                      ⚠️ {getDisplayErrInfo(displayErrorCode).title}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>
                      {getDisplayErrInfo(displayErrorCode).desc}
                    </div>
                  </div>
                  <button type="button" onClick={() => setErrorCode('')} style={{
                    flexShrink: 0, background: 'none', border: 'none',
                    color: '#DC2626', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ padding: '8px 14px', background: 'rgba(109,40,217,0.06)',
                  borderTop: '1px solid rgba(220,38,38,0.12)' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#6B21A8' }}>{t('auth.error.fix')}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#581C87' }}>
                    {' '}{getDisplayErrInfo(displayErrorCode).action}
                  </span>
                </div>
              </div>
            )}

            {/* 成功訊息 */}
            {success && (
              <div style={{ padding: '11px 14px', borderRadius: 12, fontSize: 12, fontWeight: 800,
                background: 'rgba(15,118,110,0.09)', border: '1.5px solid rgba(15,118,110,0.28)', color: '#0F766E' }}>
                ✅ {success}
              </div>
            )}

            {/* 顯示名稱（建立帳號） */}
            {isRegister && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  {t('auth.field.name')}
                </label>
                <input className="game-input" type="text" placeholder={t('auth.field.namePlaceholder')}
                  value={name} onChange={e => setName(e.target.value)} disabled={loading} style={{ fontSize: 14 }} />
              </div>
            )}

            {/* Email */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                {t('auth.field.email')}
              </label>
              <input className="game-input" type="email" placeholder="your@email.com"
                value={email} onChange={e => setEmail(e.target.value)} disabled={loading} required style={{ fontSize: 14 }} />
            </div>

            {/* 密碼 */}
            {!isForgot && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    {t('auth.field.password')}
                  </label>
                  {isLogin && (
                    <button type="button" onClick={() => resetMode('forgot')} style={{
                      fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}>{t('auth.forgot.link')}</button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <input className="game-input" type={showPassword ? 'text' : 'password'} placeholder={t('auth.field.passwordPlaceholder')}
                    value={password} onChange={e => setPassword(e.target.value)} disabled={loading} required
                    style={{ fontSize: 14, paddingRight: 48, width: '100%', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(165,125,65,0.10)', border: '1px solid rgba(165,125,65,0.20)',
                      borderRadius: 6, cursor: 'pointer', padding: 0, width: 28, height: 28, boxSizing: 'border-box', color: 'var(--accent)' }}>
                    <span style={{ display: 'block', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', lineHeight: 0 }}>
                      {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 確認密碼（建立帳號） */}
            {isRegister && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  {t('auth.field.confirmPassword')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input className="game-input" type={showConfirm ? 'text' : 'password'} placeholder={t('auth.field.confirmPlaceholder')}
                    value={confirm} onChange={e => setConfirm(e.target.value)} disabled={loading} required
                    style={{ fontSize: 14, paddingRight: 48, width: '100%', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(165,125,65,0.10)', border: '1px solid rgba(165,125,65,0.20)',
                      borderRadius: 6, cursor: 'pointer', padding: 0, width: 28, height: 28, boxSizing: 'border-box', color: 'var(--accent)' }}>
                    <span style={{ display: 'block', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', lineHeight: 0 }}>
                      {showConfirm ? <Eye size={15} /> : <EyeOff size={15} />}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 記住我（登入模式） */}
            {isLogin && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 2px', userSelect: 'none' }}>
                <div onClick={() => setRememberMe(v => !v)} style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${rememberMe ? '#7C3AED' : 'rgba(165,125,65,0.40)'}`,
                  background: rememberMe ? '#7C3AED' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                }}>
                  {rememberMe && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.2 7.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ display: 'none' }} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)' }}>{t('auth.rememberMe')}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 6 }}>
                    {rememberMe ? t('auth.rememberMe.on') : t('auth.rememberMe.off')}
                  </span>
                </div>
              </label>
            )}

            <button type="submit" className="btn-game btn-primary"
              style={{ marginTop: 2, padding: '14px', fontSize: 15 }} disabled={loading}>
              {loading ? t('common.processing')
                : isForgot ? t('auth.forgot.send')
                : isLogin  ? t('auth.submit.login')
                : t('auth.submit.register')}
            </button>
          </form>
        )}
      </div>

      <p className="relative z-10" style={{ marginTop: 28, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
        {t('auth.footer')}
      </p>
    </div>
  )
}
