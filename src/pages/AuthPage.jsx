import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const FLOATING_ICONS = [
  { icon: '✈️', style: { top: '7%',  left: '6%',  fontSize: 34, animationDelay: '0s' } },
  { icon: '🗺️', style: { top: '13%', right: '8%', fontSize: 28, animationDelay: '0.8s' } },
  { icon: '🏖️', style: { bottom: '22%', left: '5%', fontSize: 26, animationDelay: '1.4s' } },
  { icon: '⭐', style: { top: '40%', right: '5%', fontSize: 22, animationDelay: '0.4s' } },
  { icon: '🎒', style: { bottom: '14%', right: '9%', fontSize: 30, animationDelay: '1.8s' } },
  { icon: '🌸', style: { top: '60%', left: '7%', fontSize: 24, animationDelay: '1.1s' } },
  { icon: '📷', style: { top: '27%', left: '3%', fontSize: 20, animationDelay: '2.1s' } },
]

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
}

function getErrInfo(code) {
  return ERROR_MAP[code] ?? {
    title: '發生未知錯誤',
    desc: `錯誤代碼：${code || '無'}`,
    action: '請重新整理頁面後再試。若問題持續，請聯絡管理員並提供上方錯誤代碼',
  }
}

// ── 錯誤卡片元件 ──────────────────────────────
function ErrorCard({ code, onDismiss }) {
  if (!code) return null
  const { title, desc, action } = getErrInfo(code)
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden',
      border: '1.5px solid rgba(220,38,38,0.30)',
      boxShadow: '0 2px 12px rgba(220,38,38,0.08)' }}>
      <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.10)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#DC2626', marginBottom: 3 }}>
            ⚠️ {title}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B' }}>{desc}</div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{ flexShrink: 0, background: 'none', border: 'none',
            color: '#DC2626', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>✕</button>
        )}
      </div>
      <div style={{ padding: '9px 14px', background: 'rgba(109,40,217,0.06)',
        borderTop: '1px solid rgba(220,38,38,0.12)' }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#6B21A8' }}>💡 解決方式：</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#581C87', marginLeft: 4 }}>{action}</span>
      </div>
    </div>
  )
}

// ── 成功卡片 ──────────────────────────────────
function SuccessCard({ message }) {
  if (!message) return null
  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, fontSize: 13,
      background: 'rgba(15,118,110,0.09)', border: '1.5px solid rgba(15,118,110,0.28)',
      color: '#0F766E', fontWeight: 800 }}>
      ✅ {message}
    </div>
  )
}

export default function AuthPage() {
  const navigate = useNavigate()
  const { currentUser, authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, sendReset } = useAuth()

  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [errorCode, setErrorCode] = useState('')
  const [success, setSuccess]   = useState('')

  useEffect(() => {
    if (!authLoading && currentUser) navigate('/', { replace: true })
  }, [currentUser, authLoading, navigate])

  const resetMode = (newMode) => {
    setMode(newMode)
    setErrorCode('')
    setSuccess('')
  }

  // Google 登入：不做任何 async 操作，直接呼叫 signInWithPopup
  const handleGoogle = async () => {
    setErrorCode('')
    setLoading(true)
    try {
      await signInWithGoogle()
      navigate('/')
    } catch (err) {
      console.error('[Google 登入錯誤]', err)
      setErrorCode(err.code ?? 'unknown')
    } finally {
      setLoading(false)
    }
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
        await signInWithEmail(email, password)
      }
      navigate('/')
    } catch (err) {
      console.error('[Email 登入錯誤]', err)
      setErrorCode(err.code ?? 'unknown')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 52 }}>✈️</div>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>載入中…</p>
    </div>
  )

  const isLogin    = mode === 'login'
  const isRegister = mode === 'register'
  const isForgot   = mode === 'forgot'

  // 特殊錯誤 code（非 Firebase）
  const customErrors = {
    'passwords-mismatch': {
      title: '兩次密碼不一致',
      desc: '「密碼」和「確認密碼」的內容不相同。',
      action: '請重新輸入，確保兩個密碼欄位完全一致',
    },
  }
  const displayErrorCode = errorCode && customErrors[errorCode]
    ? errorCode
    : errorCode

  const getDisplayErrInfo = (code) => customErrors[code] ?? getErrInfo(code)

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ padding: '40px 24px' }}>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(-4deg); }
          50%       { transform: translateY(-14px) rotate(4deg); }
        }
      `}</style>

      <div className="glow-dot" style={{ width: 460, height: 460, background: 'rgba(215,160,70,0.20)', top: -120, left: -100 }} />
      <div className="glow-dot" style={{ width: 340, height: 340, background: 'rgba(180,120,50,0.13)', bottom: -60, right: -70 }} />

      {FLOATING_ICONS.map((item, i) => (
        <div key={i} style={{ position: 'absolute', opacity: 0.18, userSelect: 'none', pointerEvents: 'none',
          animation: 'float 6s ease-in-out infinite', ...item.style }}>
          {item.icon}
        </div>
      ))}

      {/* Logo */}
      <div className="relative z-10 text-center" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 18 }}>
          <img src="/favicon.svg" alt="TripCoworking" style={{ width: 56, height: 56, flexShrink: 0 }} />
          <h1 style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1.15 }}>
            Trip<span style={{ color: '#7C3AED' }}>Coworking</span>
          </h1>
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginTop: 8 }}>
          多人協作 · 即時同步 · 輕鬆規劃旅遊行程
        </p>
      </div>

      {/* Auth 卡片 */}
      <div className="relative z-10 glass-card-glow" style={{ width: '100%', maxWidth: 420, padding: '30px 28px' }}>

        {/* 模式切換 tabs */}
        {!isForgot && (
          <div style={{ display: 'flex', marginBottom: 24, borderRadius: 14,
            background: 'rgba(165,125,65,0.10)', border: '1.5px solid rgba(165,125,65,0.18)', padding: 4 }}>
            {[['login','🔑 登入'], ['register','✨ 建立帳號']].map(([key, label]) => (
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
            }}>← 返回登入</button>
            <h2 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', marginTop: 10 }}>重設密碼</h2>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
              輸入你的 email，我們會寄送重設連結
            </p>
          </div>
        )}

        {/* Google 登入按鈕 */}
        {!isForgot && (
          <>
            <button
              onClick={handleGoogle}
              disabled={loading}
              style={{
                width: '100%', padding: '13px', borderRadius: 14, fontSize: 14, fontWeight: 900,
                background: 'linear-gradient(160deg,#ffffff 0%,#f9f9f9 100%)',
                border: '1.5px solid rgba(165,125,65,0.28)',
                boxShadow: '0 5px 0 rgba(140,100,40,0.16), 0 7px 18px rgba(120,80,20,0.09), inset 0 1.5px 0 rgba(255,255,255,0.95)',
                color: '#3C3C3C', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'transform 0.07s, box-shadow 0.07s',
                opacity: loading ? 0.7 : 1,
              }}
              onMouseDown={e => {
                e.currentTarget.style.transform = 'translateY(4px)'
                e.currentTarget.style.boxShadow = '0 1px 0 rgba(140,100,40,0.16), 0 2px 6px rgba(120,80,20,0.07), inset 0 1.5px 0 rgba(255,255,255,0.95)'
              }}
              onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? '處理中…' : `使用 Google 帳號${isLogin ? '登入' : '建立帳號'}`}
            </button>

            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', marginTop: 7 }}>
              若登入視窗未出現，請確認瀏覽器允許本站彈出視窗
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(165,125,65,0.20)' }} />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)' }}>或用 Email 登入</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(165,125,65,0.20)' }} />
            </div>
          </>
        )}

        {/* Email 表單 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                <span style={{ fontSize: 11, fontWeight: 900, color: '#6B21A8' }}>💡 解決方式：</span>
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
                顯示名稱（選填）
              </label>
              <input className="game-input" type="text" placeholder="你的名字"
                value={name} onChange={e => setName(e.target.value)} disabled={loading} style={{ fontSize: 14 }} />
            </div>
          )}

          {/* Email */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input className="game-input" type="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} disabled={loading} required style={{ fontSize: 14 }} />
          </div>

          {/* 密碼 */}
          {!isForgot && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  密碼
                </label>
                {isLogin && (
                  <button type="button" onClick={() => resetMode('forgot')} style={{
                    fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'none',
                    border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}>忘記密碼？</button>
                )}
              </div>
              <input className="game-input" type="password" placeholder="至少 6 個字元"
                value={password} onChange={e => setPassword(e.target.value)} disabled={loading} required style={{ fontSize: 14 }} />
            </div>
          )}

          {/* 確認密碼（建立帳號） */}
          {isRegister && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                確認密碼
              </label>
              <input className="game-input" type="password" placeholder="再次輸入密碼"
                value={confirm} onChange={e => setConfirm(e.target.value)} disabled={loading} required style={{ fontSize: 14 }} />
            </div>
          )}

          <button type="submit" className="btn-game btn-primary"
            style={{ marginTop: 2, padding: '14px', fontSize: 15 }} disabled={loading}>
            {loading ? '處理中…'
              : isForgot   ? '📧 發送重設連結'
              : isLogin    ? '🔑 登入'
              : '✨ 建立帳號'}
          </button>
        </form>
      </div>

      <p className="relative z-10" style={{ marginTop: 28, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
        免費使用 · 資料安全加密 · 多人即時協作
      </p>
    </div>
  )
}
