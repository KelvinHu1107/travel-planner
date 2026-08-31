import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ViewModeProvider } from './contexts/ViewModeContext'
import { TutorialProvider } from './tutorial/TutorialContext'
import { LanguageProvider } from './i18n/LanguageContext'
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

  useEffect(() => {
    if (ready) return
    import('@line/liff')
      .then(({ default: liff }) => liff.init({ liffId: import.meta.env.VITE_LIFF_ID }))
      .catch(() => setReady(true))
      // liff.init() navigates away via window.location.replace() — setReady never runs in that case
  }, [ready])

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 52 }}>✈️</div>
        <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>LINE 登入中…</p>
      </div>
    )
  }

  return children
}

function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth()
  const location = useLocation()
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 52 }}>✈️</div>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>載入中…</p>
    </div>
  )
  if (!currentUser) {
    const redirectTo = location.pathname + location.search
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectTo)}`} replace />
  }
  return children
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
    <Sentry.ErrorBoundary fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 52 }}>⚠️</div>
        <p style={{ fontSize: 16, fontWeight: 900, color: '#92400E' }}>發生錯誤，請重新整理頁面</p>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: 10, background: '#B45309', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          重新整理
        </button>
      </div>
    }>
      <BrowserRouter>
        <LanguageProvider>
          <ViewModeProvider>
            <AuthProvider>
              <TutorialProvider>
                <AppRoutes />
                <TutorialOverlay />
              </TutorialProvider>
            </AuthProvider>
          </ViewModeProvider>
        </LanguageProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
    </LiffInitializer>
  )
}
