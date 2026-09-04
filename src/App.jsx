import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ViewModeProvider } from './contexts/ViewModeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { TutorialProvider } from './tutorial/TutorialContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { NotificationProvider } from './hooks/useNotifications'
import TutorialOverlay from './tutorial/TutorialOverlay'
import Home from './pages/Home'
import TripBoard from './pages/TripBoard'
import NoteDetail from './pages/NoteDetail'
import ChecklistPage from './pages/ChecklistPage'
import ExpensePage from './pages/ExpensePage'
import SettlementPage from './pages/SettlementPage'
import AuthPage from './pages/AuthPage'
import LineCallbackPage from './pages/LineCallbackPage'
import IconPickerPage from './pages/IconPickerPage'

// When LIFF redirects back to our root URL, liff.state and LIFF auth params are in the URL.
// We must call liff.init() here so it processes the auth code and navigates to liff.state
// (/auth?autoSignIn=1). After that, AuthPage completes the sign-in.
function LiffInitializer({ children }) {
  const [ready, setReady] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return !p.has('liff.state') && !p.has('liffClientId')
  })
  // Bug #35：區分 success/timeout；timeout 時顯示可關閉 banner，App 仍可用
  const [liffTimedOut, setLiffTimedOut] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    if (ready) return
    // Bug #35：liff.init() 加 10 秒 timeout，避免無限 loading
    const TIMEOUT_MARK = Symbol('liff-timeout')
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve(TIMEOUT_MARK), 10000)
    )
    Promise.race([
      import('@line/liff').then(({ default: liff }) =>
        liff.init({ liffId: import.meta.env.VITE_LIFF_ID })
      ),
      timeoutPromise,
    ])
      .then((result) => {
        if (result === TIMEOUT_MARK) {
          setLiffTimedOut(true)
          console.warn('[LIFF init] timeout after 10s — app continues in degraded mode')
        }
        setReady(true)
      })
      .catch((err) => {
        console.error('[LIFF init]', err)
        setReady(true)
      })
      // liff.init() navigates away via window.location.replace() — setReady never runs in that case
  }, [ready])

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
        <img src="https://loosedrawing.com/assets/media/illustrations/png/933.png" alt="" style={{ width: 120, height: 120, objectFit: 'contain', opacity: 0.85 }} />
        <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>LINE 登入中…</p>
      </div>
    )
  }

  return (
    <>
      {liffTimedOut && !bannerDismissed && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          padding: '10px 16px',
          background: 'rgba(146,64,14,0.95)', color: '#FFF7ED',
          fontSize: 13, fontWeight: 900, textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <span>⚠️ LINE 瀏覽器初始化逾時，部分功能可能受限</span>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="關閉"
            style={{
              width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,0.20)', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900,
            }}
          >×</button>
        </div>
      )}
      {children}
    </>
  )
}

function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth()
  const location = useLocation()
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <img src="https://loosedrawing.com/assets/media/illustrations/png/479.png" alt="" style={{ width: 120, height: 120, objectFit: 'contain', opacity: 0.85 }} />
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>載入中…</p>
    </div>
  )
  if (!currentUser) {
    const redirectTo = location.pathname + location.search
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectTo)}`} replace />
  }
  return children
}

// Bug #8：AuthProvider 內部 wrapper，將 currentUser.uid 傳入 NotificationProvider
// 讓桌面/手機版共用同一份通知訂閱
function NotificationsScope({ children }) {
  const { currentUser } = useAuth()
  return <NotificationProvider uid={currentUser?.uid ?? null}>{children}</NotificationProvider>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/line/callback" element={<LineCallbackPage />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/trip/:tripId" element={<ProtectedRoute><TripBoard /></ProtectedRoute>} />
      <Route path="/trip/:tripId/note/:noteId" element={<ProtectedRoute><NoteDetail /></ProtectedRoute>} />
      <Route path="/trip/:tripId/todos" element={<ProtectedRoute><ChecklistPage type="todo" /></ProtectedRoute>} />
      <Route path="/trip/:tripId/packing" element={<ProtectedRoute><ChecklistPage type="packing" /></ProtectedRoute>} />
      <Route path="/trip/:tripId/expenses" element={<ProtectedRoute><ExpensePage /></ProtectedRoute>} />
      <Route path="/trip/:tripId/expenses/settle" element={<ProtectedRoute><SettlementPage /></ProtectedRoute>} />
      <Route path="/icon-picker" element={<IconPickerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <LiffInitializer>
    <Sentry.ErrorBoundary fallback={({ error }) => (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
        <img src="https://loosedrawing.com/assets/media/illustrations/png/1959.png" alt="" style={{ width: 160, height: 160, objectFit: 'contain', opacity: 0.85 }} />
        <p style={{ fontSize: 16, fontWeight: 900, color: '#92400E' }}>發生錯誤，請重新整理頁面</p>
        <div style={{ fontSize: 12, color: '#92400E', background: 'rgba(146,64,14,0.08)', border: '1px solid rgba(146,64,14,0.2)', borderRadius: 8, padding: '8px 12px', maxWidth: 320, wordBreak: 'break-all', textAlign: 'left' }}>
          {String(error)}
        </div>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: 10, background: '#B45309', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          重新整理
        </button>
      </div>
    )}>
      <BrowserRouter>
        <ThemeProvider>
          <LanguageProvider>
            <ViewModeProvider>
              <AuthProvider>
                <NotificationsScope>
                  <TutorialProvider>
                    <AppRoutes />
                    <TutorialOverlay />
                  </TutorialProvider>
                </NotificationsScope>
              </AuthProvider>
            </ViewModeProvider>
          </LanguageProvider>
        </ThemeProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
    </LiffInitializer>
  )
}
